/**
 * AD-24 / AR-41 CI gate (story 5.1): reject any committed Backlog fixture file that
 * carries a field outside the FR-19 whitelist (plus page metadata).
 *
 * Story 5.15: the same page check also runs IN-PROCESS over every snapshot the load-fixture
 * generator emits (5 Projects × 4 weeks), because those Tickets are never committed as JSON
 * and would otherwise slip past a gate that only walks `fixtures/backlog/*.json`.
 *
 * Exit 0 on clean fixtures; non-zero naming the first offending path and field.
 *
 * Run: `pnpm fixtures:check-whitelist`
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLoadFixture } from '../packages/db/src/load-generator';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'fixtures', 'backlog');

/** Page-level metadata keys (not TicketObservation fields). */
const PAGE_KEYS = new Set([
  'scenario',
  'page',
  'observedAtOffsetHours',
  'recordedObservedAt',
  'hoursFieldPresent',
  'complete',
  'tickets',
  'accounts',
]);

/** FR-19 whitelist + AD-6 observation fields. */
const TICKET_KEYS = new Set([
  'trackerIssueId',
  'key',
  'title',
  'statusId',
  'estimateMh',
  'actualMh',
  'assigneeAccountId',
  'createdAt',
  'parentIssueId',
  'issueTypeId',
  'trackerProjectId',
  'attributes',
]);

const ATTRIBUTE_KEYS = new Set(['kind', 'id', 'label']);

/** Closed Backlog attribute kinds for R0 fixtures (AD-6). */
const BACKLOG_ATTRIBUTE_KINDS = new Set(['milestone', 'category']);

const ACCOUNT_KEYS = new Set(['accountId', 'displayName', 'email']);

/** Explicitly banned names — fail even if somehow added to a future allow-list by mistake. */
const BANNED = new Set([
  'description',
  'comment',
  'comments',
  'body',
  'resolved',
  'categoryIds',
  'milestoneIds',
  'raw',
  'payload',
]);

function walkJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walkJsonFiles(path));
    else if (name.endsWith('.json')) out.push(path);
  }
  return out;
}

/** The first out-of-whitelist key of `obj`, as a message, or null. */
function offendingKey(where: string, obj: object, allowed: Set<string>): string | null {
  for (const key of Object.keys(obj)) {
    if (BANNED.has(key)) return `${where} has banned field "${key}"`;
    if (!allowed.has(key)) return `${where} has out-of-whitelist field "${key}"`;
  }
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

function checkAttributes(where: string, attributes: unknown): string | null {
  if (!Array.isArray(attributes)) return `${where}.attributes must be an array`;
  for (let j = 0; j < attributes.length; j += 1) {
    const attr: unknown = attributes[j];
    const at = `${where}.attributes[${j}]`;
    if (!isRecord(attr)) return `${at} must be an object`;
    const bad = offendingKey(at, attr, ATTRIBUTE_KEYS);
    if (bad) return bad;
    if (typeof attr.kind !== 'string' || !BACKLOG_ATTRIBUTE_KINDS.has(attr.kind)) {
      return `${at}.kind must be one of ${[...BACKLOG_ATTRIBUTE_KINDS].join('|')}`;
    }
  }
  return null;
}

/**
 * Pure page check: the first whitelist violation in one Backlog page, as a message naming the
 * offending field, or null when the page is clean. Only KEYS are judged — values may be JSON
 * numbers (committed files) or `bigint` (generated pages) alike.
 */
export function checkFixturePage(raw: unknown): string | null {
  if (!isRecord(raw)) return 'root must be a JSON object';
  const bad = offendingKey('page', raw, PAGE_KEYS);
  if (bad) return bad;

  if (!Array.isArray(raw.tickets)) return 'tickets must be an array';
  for (let i = 0; i < raw.tickets.length; i += 1) {
    const t: unknown = raw.tickets[i];
    if (!isRecord(t)) return `tickets[${i}] must be an object`;
    const badTicket = offendingKey(`tickets[${i}]`, t, TICKET_KEYS);
    if (badTicket) return badTicket;
    const badAttr = checkAttributes(`tickets[${i}]`, t.attributes);
    if (badAttr) return badAttr;
  }

  if (raw.accounts !== undefined) {
    if (!Array.isArray(raw.accounts)) return 'accounts must be an array when present';
    for (let i = 0; i < raw.accounts.length; i += 1) {
      const a: unknown = raw.accounts[i];
      if (!isRecord(a)) return `accounts[${i}] must be an object`;
      const badAccount = offendingKey(`accounts[${i}]`, a, ACCOUNT_KEYS);
      if (badAccount) return badAccount;
    }
  }
  return null;
}

/** One page to check and the label a failure names it by. */
export interface LabelledPage {
  readonly label: string;
  readonly page: unknown;
}

/**
 * Every snapshot the load-fixture generator emits, as a Backlog page (story 5.15). The Ticket
 * and account objects are passed through exactly as generated, so a field the generator adds
 * outside the whitelist is caught by name. Page metadata is restated in the committed-file shape.
 */
export function generatedLoadPages(): LabelledPage[] {
  const shape = generateLoadFixture();
  const anchorMs = Date.parse(shape.anchor);
  return shape.projects.flatMap((project) =>
    project.snapshots.map((snap, index) => ({
      label: `load-fixture:${project.id}:${snap.snapshotId}`,
      page: {
        scenario: `load-${project.id}`,
        page: index + 1,
        observedAtOffsetHours: (Date.parse(snap.observedAt) - anchorMs) / 3_600_000,
        recordedObservedAt: snap.observedAt,
        hoursFieldPresent: snap.hoursFieldPresent,
        complete: snap.complete,
        tickets: snap.tickets,
        accounts: snap.accounts,
      },
    })),
  );
}

function committedPages(): LabelledPage[] {
  return walkJsonFiles(FIXTURES).map((path) => {
    const label = relative(ROOT, path);
    try {
      return { label, page: JSON.parse(readFileSync(path, 'utf8')) as unknown };
    } catch (e) {
      return { label, page: new InvalidJson(e instanceof Error ? e.message : String(e)) };
    }
  });
}

class InvalidJson {
  constructor(readonly reason: string) {}
}

/** Checks committed files and generated load pages; returns the first failure, or a summary. */
export function runWhitelistGate(): { ok: true; summary: string } | { ok: false; error: string } {
  const committed = committedPages();
  if (committed.length === 0) {
    return { ok: false, error: `no JSON under ${relative(ROOT, FIXTURES)}` };
  }
  const generated = generatedLoadPages();
  for (const { label, page } of [...committed, ...generated]) {
    const error =
      page instanceof InvalidJson ? `is not valid JSON (${page.reason})` : checkFixturePage(page);
    if (error !== null) return { ok: false, error: `${label}: ${error}` };
  }
  const tickets = generated.reduce(
    (sum, { page }) => sum + (page as { tickets: readonly unknown[] }).tickets.length,
    0,
  );
  return {
    ok: true,
    summary:
      `ok (${committed.length} files, ${generated.length} generated load pages / ` +
      `${tickets} Ticket observations)`,
  };
}

/** Realpath both sides, so a symlinked checkout still recognises the CLI entry and runs the gate. */
function isEntryPoint(argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

const invokedDirectly = isEntryPoint(process.argv[1]);

if (invokedDirectly) {
  const result = runWhitelistGate();
  if (result.ok) {
    console.log(`fixture whitelist: ${result.summary}`);
  } else {
    console.error(`fixture whitelist: ${result.error}`);
    process.exit(1);
  }
}
