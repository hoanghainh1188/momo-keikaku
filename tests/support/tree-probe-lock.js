/**
 * One lock for "the real source tree is being probed", held across vitest's worker processes.
 *
 * `tests/depcruise-fences.test.ts` proves its rules fire by writing `__probe-*` files under
 * `apps/` and `packages/` (and a probe line into `apps/web/src/server/composition.ts`), because
 * dependency-cruiser's rules are paths and a probe only means something at the path it names.
 * Any suite that lists those trees in the same window reads a tree that is changing under it:
 * `tests/schedule-closure.test.ts` cruised `apps packages` while the probes were being removed
 * and failed on `ENOENT ... apps/worker/src/__probe-adapters.ts` (1 in 4 full runs on a 12-core
 * laptop). Excluding `__probe` from the other cruise would not have been enough — the composition
 * edit is not a probe file — and would have taught a second gate to look away from a path.
 *
 * Since story 5.14 `apps/web/src` is a probe target too: `apps/web/src/app/approximate-guards.test.ts`
 * writes a temporary Client View under `apps/web/src/app/(__probe-approximate)/c/`, and
 * `tests/depcruise-fences.test.ts` writes `apps/web/src/__probe-*.ts` files.
 *
 * So each writer holds this lock from the first probe written to the last one removed, and every
 * suite that walks or cruises the whole of `apps/`, `packages/` or `apps/web/src` holds it while
 * it does (`removed-routes.test.ts`, `packages/i18n/src/key-usage.test.ts`, the source scan in
 * `tests/web-composition.test.ts`). Suites that read one fixed directory with no probes in it
 * (`packages/adapters/src`) do not need it.
 *
 * The lock is a file created with `wx` (atomic: exactly one creator wins) holding the owner's
 * pid. It lives in the OS temp dir keyed by the checkout's path, so two worktrees never wait on
 * each other. A lock whose owner is no longer alive — a run killed mid-probe — is taken over
 * rather than waited on forever.
 */
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LOCK_PATH = join(tmpdir(), `momo-tree-probe-${createHash('sha1').update(ROOT).digest('hex').slice(0, 12)}.lock`);
const POLL_MS = 50;
/**
 * About three minutes of polling — the probe window is one cruise, a few seconds. Counted in
 * attempts, not read off the wall clock, which only the Clock port may do (eslint).
 */
const MAX_ATTEMPTS = 3_600;
function ownerIsAlive() {
    let pid;
    try {
        pid = Number(readFileSync(LOCK_PATH, 'utf8'));
    }
    catch {
        return true; // Released, or not yet written by its creator: retry rather than steal.
    }
    if (!Number.isInteger(pid) || pid <= 0)
        return true;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
function tryAcquire() {
    try {
        writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' });
        return true;
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
        if (!ownerIsAlive())
            rmSync(LOCK_PATH, { force: true });
        return false;
    }
}
/** Waits for the lock and returns its release; calling the release twice is harmless. */
export async function acquireTreeProbeLock() {
    for (let attempt = 1; !tryAcquire(); attempt += 1) {
        if (attempt >= MAX_ATTEMPTS) {
            throw new Error(`tree-probe lock ${LOCK_PATH} still held after ${MAX_ATTEMPTS} attempts`);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    let held = true;
    return () => {
        if (!held)
            return;
        held = false;
        rmSync(LOCK_PATH, { force: true });
    };
}
