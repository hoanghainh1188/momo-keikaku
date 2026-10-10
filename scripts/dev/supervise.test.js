import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { supervise } from './supervise';
/**
 * The I/O matrix rows "child dies" and "Ctrl-C" of story 1.1 slice B3, driven with real
 * `node -e` children. The supervisor listens on an emitter instead of the test process, so a
 * "Ctrl-C" here is an `emit('SIGINT')` and nothing reaches vitest itself.
 */
/** Stays up until SIGINT/SIGTERM, logs the signal it got, and exits 0 shortly after. */
const GRACEFUL = `
  let got = 0;
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => {
    got++;
    console.log('got ' + s + ' #' + got);
    setTimeout(() => process.exit(0), 50);
  });
  console.log('ready');
  setInterval(() => {}, 1000);
`;
/** Stays up and ignores SIGINT/SIGTERM: only SIGKILL stops it. */
const STUBBORN = `
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => console.log('ignoring ' + s));
  console.log('ready');
  setInterval(() => {}, 1000);
`;
function node(name, script) {
    return { name, command: process.execPath, args: ['-e', script] };
}
function capture() {
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk.toString()));
    return { stream, text: () => chunks.join('') };
}
/** Resolves once `text()` contains `needle` `times` times — a deterministic wait, not a sleep. */
async function waitFor(text, needle, times = 1) {
    // Tests may not read the wall clock (eslint `momo/fence-tests`), so the bound is a poll count:
    // 1,000 polls of 10 ms.
    for (let poll = 0; text().split(needle).length - 1 < times; poll++) {
        if (poll >= 1_000)
            throw new Error(`timed out waiting for ${needle}:\n${text()}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}
let active = null;
afterEach(() => {
    // A failed assertion must not leave detached children behind.
    for (const child of active?.children.values() ?? []) {
        try {
            if (child.pid)
                process.kill(-child.pid, 'SIGKILL');
        }
        catch {
            // already gone
        }
    }
    active = null;
});
describe('supervise', () => {
    it('prefixes every line with the child name, padded to the longest name', async () => {
        const out = capture();
        const err = capture();
        active = supervise([node('web', GRACEFUL), node('worker', `console.error('oops'); console.log('hi'); setTimeout(() => {}, 100);`)], { stdout: out.stream, stderr: err.stream, signals: new EventEmitter() });
        await active.done;
        await waitFor(out.text, '[worker] hi');
        expect(out.text()).toContain('[web]    ready');
        expect(err.text()).toContain('[worker] oops');
    });
    it('child dies: stops the sibling and exits non-zero naming the child', async () => {
        const out = capture();
        const err = capture();
        const signals = new EventEmitter();
        let onExitCalls = 0;
        active = supervise([
            node('web', GRACEFUL),
            node('worker', `setTimeout(() => { console.error('boom'); process.exit(3); }, 300);`),
        ], { stdout: out.stream, stderr: err.stream, signals, onExit: () => onExitCalls++ });
        const result = await active.done;
        expect(result.reason).toBe('child-exit');
        expect(result.code).toBe(3);
        expect(result.failed).toEqual({ name: 'worker', code: 3, signal: null });
        expect(result.exits.map((e) => e.name)).toEqual(['worker', 'web']);
        expect(err.text()).toContain('worker exited (code 3)');
        expect(onExitCalls).toBe(1);
        // The supervisor stops listening for signals once it is done.
        expect(signals.listenerCount('SIGINT')).toBe(0);
        expect(signals.listenerCount('SIGTERM')).toBe(0);
    });
    it('a child that exits 0 on its own still fails the run', async () => {
        active = supervise([node('web', GRACEFUL), node('worker', `process.exit(0)`)], {
            stdout: capture().stream,
            stderr: capture().stream,
            signals: new EventEmitter(),
        });
        const result = await active.done;
        expect(result.reason).toBe('child-exit');
        expect(result.code).toBe(1);
    });
    it('Ctrl-C: every child receives SIGINT exactly once, and the run ends after both exit', async () => {
        const out = capture();
        const signals = new EventEmitter();
        active = supervise([node('web', GRACEFUL), node('worker', GRACEFUL)], {
            stdout: out.stream,
            stderr: capture().stream,
            signals,
        });
        await waitFor(out.text, 'ready', 2);
        signals.emit('SIGINT', 'SIGINT');
        const result = await active.done;
        expect(result.reason).toBe('signal');
        expect(result.code).toBe(0);
        expect(result.exits).toHaveLength(2);
        expect(result.exits.every((e) => e.code === 0)).toBe(true);
        await waitFor(out.text, 'got SIGINT', 2);
        expect(out.text()).toContain('[web]    got SIGINT #1');
        expect(out.text()).toContain('[worker] got SIGINT #1');
        expect(out.text()).not.toContain('#2');
    });
    it('a second SIGINT kills children that ignore the first', async () => {
        const out = capture();
        const signals = new EventEmitter();
        active = supervise([node('web', STUBBORN), node('worker', STUBBORN)], {
            stdout: out.stream,
            stderr: capture().stream,
            signals,
            repeatGraceMs: 0,
        });
        await waitFor(out.text, 'ready', 2);
        signals.emit('SIGINT', 'SIGINT');
        await waitFor(out.text, 'ignoring SIGINT', 2);
        signals.emit('SIGINT', 'SIGINT');
        const result = await active.done;
        expect(result.reason).toBe('signal');
        expect(result.code).toBe(1);
        expect(result.exits.every((e) => e.signal === 'SIGKILL')).toBe(true);
    });
    it('one Ctrl-C relayed several times (terminal, pnpm, tsx) is still one Ctrl-C', async () => {
        const out = capture();
        const signals = new EventEmitter();
        active = supervise([node('web', GRACEFUL), node('worker', GRACEFUL)], {
            stdout: out.stream,
            stderr: capture().stream,
            signals,
        });
        await waitFor(out.text, 'ready', 2);
        signals.emit('SIGINT', 'SIGINT');
        signals.emit('SIGINT', 'SIGINT');
        signals.emit('SIGINT', 'SIGINT');
        const result = await active.done;
        expect(result.code).toBe(0);
        expect(result.exits.every((e) => e.code === 0 && e.signal === null)).toBe(true);
    });
    it("prints a crashing child's last stderr line before `done` resolves", async () => {
        const err = capture();
        // The shape of `pnpm → node`: the process the supervisor spawned exits at once, while the
        // program under it (same pipes, same group) writes its last line a moment later. `'exit'` fires
        // before that line; only `'close'` waits for it. The grandchild ignores the SIGTERM that stops
        // the group, as a program still printing its crash report would not be done yet.
        const grandchild = "process.on('SIGTERM', () => {}); process.send('armed'); process.disconnect();" +
            " setTimeout(() => console.error('last words'), 100)";
        const crash = `
      const { spawn } = require('node:child_process');
      const g = spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      g.on('message', () => { g.unref(); g.disconnect?.(); process.exit(4); });
    `;
        active = supervise([node('web', GRACEFUL), node('worker', crash)], {
            stdout: capture().stream,
            stderr: err.stream,
            signals: new EventEmitter(),
        });
        const result = await active.done;
        expect(result.code).toBe(4);
        expect(err.text()).toContain('[worker] last words');
    });
    it('forwards SIGHUP (the terminal closed) to every child', async () => {
        const out = capture();
        const signals = new EventEmitter();
        const hup = `
      process.on('SIGHUP', () => { console.log('got SIGHUP'); setTimeout(() => process.exit(0), 20); });
      console.log('ready');
      setInterval(() => {}, 1000);
    `;
        active = supervise([node('web', hup), node('worker', hup)], {
            stdout: out.stream,
            stderr: capture().stream,
            signals,
        });
        await waitFor(out.text, 'ready', 2);
        signals.emit('SIGHUP', 'SIGHUP');
        const result = await active.done;
        expect(result.reason).toBe('signal');
        expect(result.code).toBe(0);
        expect(out.text()).toContain('[web]    got SIGHUP');
        expect(out.text()).toContain('[worker] got SIGHUP');
        expect(signals.listenerCount('SIGHUP')).toBe(0);
    });
    it('escalates to SIGKILL when a stopped child outlives the grace period', async () => {
        const out = capture();
        active = supervise([node('web', STUBBORN), node('worker', `setTimeout(() => process.exit(2), 300)`)], { stdout: out.stream, stderr: capture().stream, signals: new EventEmitter(), killAfterMs: 200 });
        const result = await active.done;
        expect(result.failed?.name).toBe('worker');
        expect(result.code).toBe(2);
        expect(result.exits.find((e) => e.name === 'web')?.signal).toBe('SIGKILL');
    });
    it('a child that cannot be spawned fails the run naming it', async () => {
        const err = capture();
        active = supervise([node('web', GRACEFUL), { name: 'worker', command: '/nonexistent/momo-binary', args: [] }], { stdout: capture().stream, stderr: err.stream, signals: new EventEmitter() });
        const result = await active.done;
        expect(result.failed?.name).toBe('worker');
        expect(result.code).toBe(1);
        expect(err.text()).toContain('[worker] failed to start');
    });
});
