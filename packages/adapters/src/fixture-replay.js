/**
 * AD-6 `fixture-replay` adapter (story 5.1).
 *
 * Reads `fixtures/backlog/<scenario>/NNNN.json` pages, advances a per-Connector cursor
 * through `FixtureCursorPort`, and never imports the database package. Fixture Tickets are
 * stored with `tracker_kind = 'fixture'` by callers; this adapter emits `adapterKind: 'fixture'`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mhFromJsonNumber } from './mh-from-json';
function repoRootFrom(start) {
    let dir = start;
    for (let i = 0; i < 8; i += 1) {
        if (existsSync(join(dir, 'fixtures', 'backlog')))
            return dir;
        dir = dirname(dir);
    }
    throw new Error('could not locate the repo root (no fixtures/backlog found)');
}
function ticketFromRaw(t) {
    return {
        trackerIssueId: t.trackerIssueId,
        key: t.key,
        title: t.title,
        statusId: t.statusId,
        estimateMh: t.estimateMh === null ? null : mhFromJsonNumber(t.estimateMh),
        actualMh: t.actualMh === null ? null : mhFromJsonNumber(t.actualMh),
        assigneeAccountId: t.assigneeAccountId,
        createdAt: t.createdAt,
        parentIssueId: t.parentIssueId ?? null,
        issueTypeId: t.issueTypeId,
        trackerProjectId: t.trackerProjectId ?? null,
        attributes: t.attributes ?? [],
    };
}
function accountsFromPage(raw) {
    if (raw.accounts && raw.accounts.length > 0) {
        return raw.accounts.map((a) => ({
            accountId: a.accountId,
            displayName: a.displayName,
            ...(a.email !== undefined ? { email: a.email } : {}),
        }));
    }
    // Synthesise from assignees when the page omits an accounts array.
    const seen = new Map();
    for (const t of raw.tickets) {
        if (!t.assigneeAccountId || seen.has(t.assigneeAccountId))
            continue;
        seen.set(t.assigneeAccountId, {
            accountId: t.assigneeAccountId,
            displayName: t.assigneeAccountId,
        });
    }
    return [...seen.values()];
}
/**
 * Build a `TrackerPort`-shaped fixture-replay adapter. One page per `readScope` call;
 * the cursor advances after a successful read. `complete` is true when the page just
 * read was the last file in the scenario directory.
 */
export function fixtureReplayOn(options) {
    const root = options.fixturesRoot ?? repoRootFrom(process.cwd());
    return {
        async readScope(connectorConfig, _credentials) {
            const scenario = connectorConfig.scenario ?? connectorConfig.site;
            // Refuse path segments so a crafted site/scenario cannot escape fixtures/backlog.
            if (scenario.split(/[\\/]/).some((part) => part === '..' || part === '')) {
                throw new Error(`invalid fixture scenario name: ${scenario}`);
            }
            const dir = join(root, 'fixtures', 'backlog', scenario);
            if (!existsSync(dir)) {
                throw new Error(`fixture scenario directory missing: fixtures/backlog/${scenario}`);
            }
            const files = readdirSync(dir)
                .filter((f) => /^\d{4}\.json$/.test(f))
                .sort();
            if (files.length === 0) {
                throw new Error(`fixture scenario has no pages: fixtures/backlog/${scenario}`);
            }
            const pageIndex = await options.cursor.get(connectorConfig.connectorId);
            const anchorMs = Date.parse(connectorConfig.timeAnchorIso);
            if (!Number.isFinite(anchorMs)) {
                throw new Error(`invalid timeAnchorIso: ${connectorConfig.timeAnchorIso}`);
            }
            if (pageIndex < 0 || pageIndex >= files.length) {
                // Past the end: return an empty complete read so callers can stop cleanly.
                return {
                    complete: true,
                    observedAt: new Date(anchorMs).toISOString(),
                    tickets: [],
                    accounts: [],
                    hoursFieldPresent: false,
                    rateLimit: null,
                    adapterKind: 'fixture',
                };
            }
            const fileName = files[pageIndex];
            const raw = JSON.parse(readFileSync(join(dir, fileName), 'utf8'));
            if (!Array.isArray(raw.tickets)) {
                throw new Error(`fixture page ${scenario}/${fileName}: tickets must be an array`);
            }
            const tickets = raw.tickets.map(ticketFromRaw);
            const accounts = accountsFromPage(raw);
            const observedAt = new Date(anchorMs + raw.observedAtOffsetHours * 3600_000).toISOString();
            const isLast = pageIndex >= files.length - 1;
            // Time-series scenarios (ec-phase2, leave-and-return, …) set complete:true per file;
            // pagination scenarios (page-shift) set complete:false until the last overlapping page.
            const complete = raw.complete ?? isLast;
            // Advance only after a successful parse so a bad page can be retried.
            await options.cursor.set(connectorConfig.connectorId, pageIndex + 1);
            return {
                complete,
                observedAt,
                tickets,
                accounts,
                hoursFieldPresent: raw.hoursFieldPresent,
                rateLimit: null,
                adapterKind: 'fixture',
            };
        },
    };
}
