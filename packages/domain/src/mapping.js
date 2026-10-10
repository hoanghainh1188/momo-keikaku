const NO_HOURS = 0n;
export function mappingHead(events, mappingSeqMax = Number.POSITIVE_INFINITY) {
    const head = new Map();
    for (const e of events) {
        if (e.seq > mappingSeqMax)
            continue;
        const cur = head.get(e.ticketId);
        if (!cur || e.seq > cur.seq) {
            head.set(e.ticketId, { wpId: e.wpId, source: e.source, seq: e.seq, ruleId: e.ruleId ?? null });
        }
    }
    return head;
}
function attributeIds(obs, kind) {
    return obs.attributes.filter((a) => a.kind === kind).map((a) => a.id);
}
/**
 * Story 5.10 / Harry Q2: an anchored, case-sensitive glob with `*` (any run, empty included) and
 * `?` (exactly one character) and nothing else — every other character is literal. Iterative
 * with single-star backtracking, so a hostile pattern costs O(pattern × text), never exponential.
 */
export function globMatches(pattern, text) {
    let p = 0;
    let t = 0;
    let starP = -1;
    let starT = 0;
    while (t < text.length) {
        const pc = pattern[p];
        if (pc === '*') {
            starP = p;
            starT = t;
            p += 1;
        }
        else if (pc !== undefined && (pc === '?' || pc === text[t])) {
            p += 1;
            t += 1;
        }
        else if (starP >= 0) {
            p = starP + 1;
            starT += 1;
            t = starT;
        }
        else {
            return false;
        }
    }
    while (pattern[p] === '*')
        p += 1;
    return p === pattern.length;
}
function ruleMatches(rule, obs) {
    switch (rule.match.field) {
        case 'milestone':
            return attributeIds(obs, 'milestone').includes(rule.match.value);
        case 'category':
            return attributeIds(obs, 'category').includes(rule.match.value);
        case 'issueType':
            return obs.issueTypeId === rule.match.value;
        case 'parent':
            return obs.parentIssueId !== null && obs.parentIssueId === rule.match.value;
        case 'keyPattern':
            return globMatches(rule.match.value, obs.key);
    }
}
/**
 * FR-22: strict priority order, first match wins. Pure. Reads `attributes` (AD-6). Returns the
 * firing rule as well as its target (story 5.10), so the event can record which rule moved it.
 * Ties on priority (which the schema refuses for live rules) fall back to id order, so the
 * result never depends on the order the caller happened to pass.
 */
export function evaluateRules(rules, obs) {
    const ordered = [...rules].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const r of ordered) {
        if (ruleMatches(r, obs))
            return { wpId: r.wpId, ruleId: r.id };
    }
    return null;
}
/** The thin `wpId | null` form of `evaluateRules` (FR-22's `evaluateRules(rules, observation) → wpId | null`). */
export function evaluateRuleTarget(rules, obs) {
    return evaluateRules(rules, obs)?.wpId ?? null;
}
/**
 * FR-22 "manual wins": rules are only applied to Tickets whose head is not manual
 * (Dispositions count as manual). `release` clears the head for rules and is re-evaluable
 * (story 5.9 / A4). Returns the events that should be appended — only for Tickets whose
 * result changes: a different WP, or the same WP now held by a different rule.
 *
 * Story 5.10: each event carries `ruleId` — the rule that fired, or, when no rule matches any
 * more and the Ticket leaves a rule Mapping for Unmapped, the rule it left (the prior head's).
 */
export function applyRules(rules, tickets, head, seqFrom, at) {
    let seq = seqFrom;
    const out = [];
    for (const t of tickets) {
        const cur = head.get(t.trackerIssueId);
        if (cur && (cur.source === 'manual' || cur.source === 'disposition'))
            continue;
        const match = evaluateRules(rules, t);
        const wpId = match?.wpId ?? null;
        // The result is the PAIR (wpId, ruleId): a different rule now holding the Ticket at the same
        // WP is still a change "by that rule" (NFR-A1), so the head never names a stale rule. An
        // unchanged null result (already unmapped) appends nothing.
        if ((cur?.wpId ?? null) === wpId && (wpId === null || (cur?.ruleId ?? null) === match.ruleId)) {
            continue;
        }
        out.push({
            seq: seq++,
            ticketId: t.trackerIssueId,
            wpId,
            source: 'rule',
            ruleId: match ? match.ruleId : (cur?.ruleId ?? null),
            at,
            actor: 'system:rules',
        });
    }
    return out;
}
function addFlow(flows, wpId, mh) {
    const cur = flows.get(wpId) ?? { wpId, tickets: 0, mh: NO_HOURS };
    flows.set(wpId, { wpId, tickets: cur.tickets + 1, mh: cur.mh + mh });
}
const byWp = (a, b) => (a.wpId < b.wpId ? -1 : a.wpId > b.wpId ? 1 : 0);
/**
 * Story 5.10 / UX-DR22: what saving `proposed` would move, read-only and pure. It is exactly
 * `applyRules(proposed, …)` against the current heads — the same evaluation the save runs — so
 * the preview cannot promise a move the save does not make. The current rules are already
 * expressed in the heads (every save and every ingest keeps them in step), so they are not a
 * separate input. Hours are the Ticket's cumulative ledger hours from hours Connectors only;
 * a Ticket-Count Connector's Tickets count, but contribute no hours (`hoursByTicket` omits them).
 */
export function previewRuleChange(proposed, tickets, head, hoursByTicket) {
    const keyOf = new Map(tickets.map((t) => [t.trackerIssueId, t.key]));
    const events = applyRules(proposed, tickets, head, 0, '');
    const arrivals = new Map();
    const departures = new Map();
    let unmappedTickets = 0;
    let unmappedMh = NO_HOURS;
    const moves = [];
    for (const e of events) {
        const fromWpId = head.get(e.ticketId)?.wpId ?? null;
        // A same-WP rule switch is recorded, but moves no Ticket and no hours.
        if (fromWpId === e.wpId)
            continue;
        const mh = hoursByTicket.get(e.ticketId) ?? NO_HOURS;
        if (e.wpId !== null)
            addFlow(arrivals, e.wpId, mh);
        else {
            unmappedTickets += 1;
            unmappedMh += mh;
        }
        if (fromWpId !== null)
            addFlow(departures, fromWpId, mh);
        moves.push({ ticketId: e.ticketId, key: keyOf.get(e.ticketId) ?? e.ticketId, fromWpId, toWpId: e.wpId, mh });
    }
    moves.sort((a, b) => (a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0));
    return {
        arrivals: [...arrivals.values()].sort(byWp),
        departures: [...departures.values()].sort(byWp),
        toUnmapped: { tickets: unmappedTickets, mh: unmappedMh },
        moves,
    };
}
