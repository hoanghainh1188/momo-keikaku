/**
 * AR-52 closure tests (story 2.9): writers, callers, reachability.
 *
 * Writers: every AD-25 scheduling input write lives under `repositories/plan-input` (or the
 * fence). Callers: `recalculateProject` is only reached from `applyPlanChange` (and itself).
 * Reachability: mapping / disposition / tracker-shaped modules do not import it.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name) && !name.endsWith('.test.ts')) acc.push(path);
  }
  return acc;
}

function rel(path: string): string {
  return relative(ROOT, path).replaceAll('\\', '/');
}

describe('AR-52 writers — AD-25 input writes stay inside the fence', () => {
  it('only plan-input (and seed/probe test helpers) insert into wp_dependency', () => {
    const files = walk(join(ROOT, 'packages')).concat(walk(join(ROOT, 'apps')));
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const path = rel(file);
      if (path.includes('repositories/plan-input')) continue;
      if (path.includes('schema-catalog.test')) continue;
      if (path.includes('baseline-read.test')) continue;
      if (path.includes('seed.ts') || path.includes('probe-tenants') || path.includes('fixtures')) {
        continue; // seed/probe — not lasting AD-25 writers (spec Never)
      }
      if (path.includes('schema.ts') || path.includes('drizzle/')) continue;
      // Drizzle insert into wpDependency / work_package duration/constraint.
      if (
        /insert\s*\(\s*s\.wpDependency/.test(text) ||
        /insert\s*\(\s*wpDependency/.test(text) ||
        /\.insert\(s\.wpDependency/.test(text)
      ) {
        offenders.push(path);
      }
    }
    expect(offenders, `wp_dependency inserts outside plan-input:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });
});

describe('AR-52 callers — recalculateProject callers are the FR-6b list present so far', () => {
  it('is imported only from apply-plan-change and its own module / tests', () => {
    const files = walk(join(ROOT, 'packages')).concat(walk(join(ROOT, 'apps')));
    const allowed = new Set([
      'packages/app/src/schedule/apply-plan-change.ts',
      'packages/app/src/schedule/recalculate-project.ts',
    ]);
    const offenders: string[] = [];
    for (const file of files) {
      const path = rel(file);
      if (allowed.has(path)) continue;
      const text = readFileSync(file, 'utf8');
      if (
        /recalculateProject/.test(text) &&
        (/from ['"].*recalculate-project/.test(text) || /import\s*\{[^}]*recalculateProject/.test(text))
      ) {
        offenders.push(path);
      }
    }
    expect(offenders, `unexpected recalculateProject importers:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });
});

describe('AR-52 reachability — unreachable from mapping / disposition / tracker-shaped code', () => {
  it('mapping and disposition modules do not import recalculateProject or schedule repos', () => {
    const banned = [
      'packages/app/src/use-cases/project-writes.ts',
      'packages/db/src/repo-writes.ts',
      'packages/app/src/use-cases/get-project-mapping.ts',
    ];
    for (const path of banned) {
      const text = readFileSync(join(ROOT, path), 'utf8');
      expect(text).not.toMatch(/recalculateProject/);
      expect(text).not.toMatch(/repositories\/(schedule|plan-input)/);
      expect(text).not.toMatch(/applyPlanChange/);
    }
  });

  it('depcruise keeps scheduling repositories only reachable from app/schedule', () => {
    const out = execFileSync(
      join(ROOT, 'node_modules/.bin/depcruise'),
      [
        'apps',
        'packages',
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'json',
      ],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    const cruise = JSON.parse(out) as {
      summary: { violations: readonly { rule: { name: string } }[] };
    };
    const scheduling = cruise.summary.violations.filter((v) =>
      v.rule.name.includes('scheduling'),
    );
    expect(scheduling).toEqual([]);
  });
});
