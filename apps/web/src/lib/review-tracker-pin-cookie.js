/**
 * Story 6.7 / Q1→C: browser-session persistence for the Review Tracker freeze.
 * Cookie holds per-project pins; Re-pin rewrites. No DB session table this story.
 *
 * Shape matches `ReviewTrackerPin` in packages/db (string ids only — no bigint), so a
 * hand-rolled codec stays inside AD-4 without importing `@momo/domain` codec or `@momo/db`.
 */
import { cookies } from 'next/headers';
export const REVIEW_TRACKER_PIN_COOKIE = 'momo.review-tracker-pin';
function isPin(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const v = value;
    if (typeof v.overallSnapshotId !== 'string')
        return false;
    if (v.snapshotIdByConnector === null || typeof v.snapshotIdByConnector !== 'object')
        return false;
    if (Array.isArray(v.snapshotIdByConnector))
        return false;
    for (const [k, id] of Object.entries(v.snapshotIdByConnector)) {
        if (typeof k !== 'string' || typeof id !== 'string')
            return false;
    }
    return true;
}
function parseStore(raw) {
    if (!raw)
        return {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            return {};
        const out = {};
        for (const [projectId, pin] of Object.entries(parsed)) {
            if (isPin(pin))
                out[projectId] = pin;
        }
        return out;
    }
    catch {
        return {};
    }
}
/** String-only records — no bigint — so a tiny encoder replaces restricted JSON.stringify. */
function encodeStore(store) {
    const projects = Object.keys(store).sort();
    const parts = [];
    for (const projectId of projects) {
        const pin = store[projectId];
        const connectors = Object.keys(pin.snapshotIdByConnector).sort();
        const connParts = connectors.map((c) => `${jsonString(c)}:${jsonString(pin.snapshotIdByConnector[c])}`);
        parts.push(`${jsonString(projectId)}:{"overallSnapshotId":${jsonString(pin.overallSnapshotId)},"snapshotIdByConnector":{${connParts.join(',')}}}`);
    }
    return `{${parts.join(',')}}`;
}
function jsonString(value) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
async function cookieJar() {
    try {
        return await cookies();
    }
    catch {
        // Outside a Next request (composition unit tests) there is no jar — treat as no pin.
        return null;
    }
}
export async function readReviewTrackerPin(projectId) {
    const jar = await cookieJar();
    if (!jar)
        return null;
    const store = parseStore(jar.get(REVIEW_TRACKER_PIN_COOKIE)?.value);
    return store[projectId] ?? null;
}
export async function writeReviewTrackerPin(projectId, pin) {
    const jar = await cookieJar();
    if (!jar)
        return;
    const store = parseStore(jar.get(REVIEW_TRACKER_PIN_COOKIE)?.value);
    store[projectId] = pin;
    jar.set(REVIEW_TRACKER_PIN_COOKIE, encodeStore(store), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        // Session cookie — Review life ends when the browser session ends; Re-pin rewrites.
    });
}
export async function clearReviewTrackerPin(projectId) {
    const jar = await cookieJar();
    if (!jar)
        return;
    const store = parseStore(jar.get(REVIEW_TRACKER_PIN_COOKIE)?.value);
    if (!(projectId in store))
        return;
    delete store[projectId];
    if (Object.keys(store).length === 0) {
        jar.delete(REVIEW_TRACKER_PIN_COOKIE);
        return;
    }
    jar.set(REVIEW_TRACKER_PIN_COOKIE, encodeStore(store), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
    });
}
