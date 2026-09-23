/**
 * The supervisor behind `pnpm dev` (story 1.1 slice B3): runs several long-lived children as one.
 *
 *  - every line a child writes is prefixed with its name (`[web] …`, `[worker] …`);
 *  - SIGINT / SIGTERM / SIGHUP to the supervisor is forwarded to every child, once;
 *  - if the supervising process exits anyway, every child's group is SIGKILLed, not orphaned;
 *  - a second signal escalates to SIGKILL — once the first is more than a second old (below);
 *  - when one child exits on its own, the others are stopped (SIGTERM), and the run fails naming
 *    the child that exited first;
 *  - the run settles only once every child's output has drained (`'close'`, not `'exit'`), so a
 *    crashing child's last lines are printed before the caller's `process.exit`.
 *
 * Each child is spawned `detached`, which makes it the leader of its own process group, and every
 * signal is sent to that whole group. Two reasons. First, `pnpm → tsx → node` is three processes:
 * signalling only the `pnpm` pid would leave the program itself running. Second, a detached child
 * is not in the terminal's foreground group, so a Ctrl-C reaches it exactly once — through the
 * supervisor — instead of once from the terminal and again from the forwarding. The worker treats
 * a second signal as "exit now", so a double delivery would turn every Ctrl-C into a hard exit.
 *
 * The one-second window exists because one Ctrl-C reaches the supervisor more than once. The
 * terminal sends SIGINT to its whole foreground group — `pnpm`, `tsx` and the node running this
 * file — and `pnpm` and `tsx` each relay it on top (measured: a single Ctrl-C arrived twice and
 * SIGKILLed the web app). A repeat inside the window is the same keypress, not an operator
 * insisting.
 *
 * Written on `node:child_process` alone: no new runtime dependency (the spec rules out
 * `concurrently`).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

export interface ChildSpec {
  /** The prefix on every output line, and the name a failure reports. */
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface ChildExit {
  readonly name: string;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface SupervisedExit {
  /** The exit code the supervising process should use. */
  readonly code: number;
  /** `child-exit` when a child ended the run on its own; `signal` when the supervisor was told to stop. */
  readonly reason: 'child-exit' | 'signal';
  /** The child whose own exit ended the run, when `reason` is `child-exit`. */
  readonly failed: ChildExit | null;
  /** Every child's exit, in the order they happened. */
  readonly exits: readonly ChildExit[];
}

export interface SuperviseOptions {
  /** Called once, after every child has exited. */
  readonly onExit?: (result: SupervisedExit) => void;
  /** Where the prefixed lines go. Default: the supervisor's own stdout / stderr. */
  readonly stdout?: Writable;
  readonly stderr?: Writable;
  /** Where SIGINT / SIGTERM are listened for. Default: `process`. A test passes an emitter. */
  readonly signals?: EventEmitter;
  /** How long stopped children get before SIGKILL. Default 10 s. */
  readonly killAfterMs?: number;
  /** A repeat signal within this long of the first is treated as the same one. Default 1 s. */
  readonly repeatGraceMs?: number;
}

export interface Supervisor {
  /** Resolves once every child has exited. */
  readonly done: Promise<SupervisedExit>;
  /** The spawned children, by name (for tests and diagnostics). */
  readonly children: ReadonlyMap<string, ChildProcess>;
}

// SIGHUP: the terminal closed. Detached children never see it themselves, so without forwarding
// they would outlive the window they were started from.
const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const DEFAULT_KILL_AFTER_MS = 10_000;
const DEFAULT_REPEAT_GRACE_MS = 1_000;

/**
 * Signals the child's whole process group. The group is signalled even when its leader has
 * already exited: `pnpm` dying does not take the `node` it started with it.
 */
function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // ESRCH: the group is already gone. Fall back to the child itself in case the platform has
    // no process groups; that too is a no-op on a process that has exited.
    child.kill(signal);
  }
}

function pipeLines(source: Readable | null, sink: Writable, prefix: string): void {
  if (!source) return;
  createInterface({ input: source, crlfDelay: Infinity }).on('line', (line) => {
    sink.write(`${prefix}${line}\n`);
  });
}

export function supervise(
  specs: readonly ChildSpec[],
  options: SuperviseOptions = {},
): Supervisor {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const signals = options.signals ?? process;
  const killAfterMs = options.killAfterMs ?? DEFAULT_KILL_AFTER_MS;
  const repeatGraceMs = options.repeatGraceMs ?? DEFAULT_REPEAT_GRACE_MS;
  const width = Math.max(...specs.map((spec) => spec.name.length));

  const exits: ChildExit[] = [];
  let reason: SupervisedExit['reason'] | null = null;
  let failed: ChildExit | null = null;
  let escalated = false;
  let killTimer: NodeJS.Timeout | null = null;
  /** Whether a repeat signal now means "kill": false until the first is `repeatGraceMs` old. */
  let repeatArmed = false;

  const children = new Map<string, ChildProcess>();
  for (const spec of specs) {
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const prefix = `[${spec.name}]${' '.repeat(width - spec.name.length)} `;
    pipeLines(child.stdout, stdout, prefix);
    pipeLines(child.stderr, stderr, prefix);
    children.set(spec.name, child);
  }

  const exited = new Set<string>();
  const running = (): string[] => [...children.keys()].filter((name) => !exited.has(name));

  function stopAll(signal: NodeJS.Signals): void {
    for (const child of children.values()) signalGroup(child, signal);
    if (!killTimer && signal !== 'SIGKILL') {
      killTimer = setTimeout(() => kill(), killAfterMs);
      killTimer.unref();
    }
  }

  function kill(): void {
    escalated = true;
    for (const child of children.values()) signalGroup(child, 'SIGKILL');
  }

  function armRepeat(): void {
    if (repeatGraceMs <= 0) {
      repeatArmed = true;
      return;
    }
    setTimeout(() => {
      repeatArmed = true;
    }, repeatGraceMs).unref();
  }

  function onSignal(signal: NodeJS.Signals): void {
    if (reason !== null) {
      // The same Ctrl-C relayed by `pnpm` / `tsx`: already being handled.
      if (!repeatArmed) return;
      // A second signal: the operator will not wait for a graceful stop.
      stderr.write(`\n${signal} again — killing ${running().join(', ') || 'nothing'}\n`);
      kill();
      return;
    }
    reason = 'signal';
    armRepeat();
    stderr.write(`\n${signal} — stopping ${running().join(', ')}\n`);
    stopAll(signal);
  }

  const listeners = FORWARDED.map((signal) => {
    const listener = (): void => onSignal(signal);
    signals.on(signal, listener);
    return [signal, listener] as const;
  });

  // Last resort: the supervising process is exiting (an uncaught error, a `process.exit`
  // elsewhere) while children still run. Only for the real process — an injected emitter in a test
  // says nothing about the test runner's own lifetime.
  const onProcessExit = (): void => {
    for (const [name, child] of children) if (!exited.has(name)) signalGroup(child, 'SIGKILL');
  };
  if (signals === process) process.on('exit', onProcessExit);

  const done = new Promise<SupervisedExit>((resolve) => {
    const closed = new Set<string>();
    const settle = (): void => {
      if (running().length > 0 || closed.size < children.size) return;
      for (const [signal, listener] of listeners) signals.off(signal, listener);
      process.off('exit', onProcessExit);
      if (killTimer) clearTimeout(killTimer);
      const result: SupervisedExit = {
        code: exitCodeFor(reason ?? 'signal', failed, escalated),
        reason: reason ?? 'signal',
        failed,
        exits: [...exits],
      };
      options.onExit?.(result);
      resolve(result);
    };

    for (const [name, child] of children) {
      const record = (exit: ChildExit): void => {
        if (exited.has(name)) return;
        exited.add(name);
        exits.push(exit);
        if (reason === null) {
          reason = 'child-exit';
          failed = exit;
          const how = exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`;
          stderr.write(`\n${name} exited (${how}) — stopping the others\n`);
          armRepeat();
          stopAll('SIGTERM');
        }
        settle();
      };
      // `'exit'` stops the siblings at once; `'close'` (stdio drained) is what lets the run settle.
      child.on('exit', (code, signal) => record({ name, code, signal }));
      child.on('close', (code, signal) => {
        record({ name, code, signal });
        closed.add(name);
        settle();
      });
      child.on('error', (error) => {
        stderr.write(`[${name}] failed to start: ${error.message}\n`);
        record({ name, code: 1, signal: null });
        closed.add(name);
        settle();
      });
    }
  });

  return { done, children };
}

function exitCodeFor(
  reason: SupervisedExit['reason'],
  failed: ChildExit | null,
  escalated: boolean,
): number {
  if (reason === 'child-exit') {
    // A dev server that exits on its own has failed, even with code 0.
    return failed && failed.code !== null && failed.code !== 0 ? failed.code : 1;
  }
  return escalated ? 1 : 0;
}
