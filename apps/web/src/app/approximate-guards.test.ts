import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireTreeProbeLock } from '../../../../tests/support/tree-probe-lock';

/**
 * Story 5.14 / FR-26 fitness tests: the consequences of "person- and day-level actuals are
 * approximate", held over the web sources.
 *
 * 1. Structural (primary): any web view that imports `Approximated` (or anything from
 *    `@momo/domain/present/approximate`) renders through `ApproximateBreakdown`, the render-prop
 *    wrapper that puts the non-dismissible caption above the data. Read from the TypeScript AST,
 *    so a mention in a comment or a string satisfies nothing. A view is a `.tsx`, or a `.ts` that
 *    calls `createElement` (this app's JSX-free component convention, e.g. `user-chip-menu.ts`); a
 *    plain `.ts` model may carry the envelope. KNOWN GAP (deferred-work.md): a view that reads
 *    `r.data` from an envelope it got by inference, never naming the type, is not seen.
 * 2. The wrapper carries no `'use client'`: its child is a function, which cannot cross the
 *    server → client boundary.
 * 3. Reachability (depcruise): neither domain barrel (`index.ts`, `present/index.ts`) reaches the
 *    approximate modules — a real Client View reaches `@momo/domain` through `packages/app`, so a
 *    barrel export would trip the rule on every one of them; rule `client-view-not-to-approximate`
 *    fires on a temporary Client View page under a route group (FR-34); and a tripwire fails if a
 *    `c/` folder sits deeper behind URL-less segments than the rule's patterns reach. The probe
 *    is written into the real tree, so this file holds the tree-probe lock throughout
 *    (`tests/support/tree-probe-lock.ts`).
 * 4. Field-name scan (secondary): a view that names an assignee or a Tracker Account is on the
 *    allow-list below, with its reason. A new person-level surface has to argue its way in.
 * 5. The Review carries no free-floating approximate caption (Q2→C: its figures are exact).
 *
 * "No Unplanned Work group or Review output names a person" is held behaviourally in
 * `packages/domain/src/review.test.ts`, where the Review is built.
 */
const WEB_SRC = fileURLToPath(new URL('..', import.meta.url));
const APP_DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

/** The wrapper's own definition imports `Approximated` to type its prop. */
const WRAPPER_FILE = 'components/approximate-notice.tsx';
const APPROXIMATE_ENTRY = '@momo/domain/present/approximate';

/** Files allowed to name assignees / Tracker Accounts, each with why it carries no actuals. */
const PERSON_FIELD_ALLOW_LIST: Record<string, string> = {
  'app/p/[projectId]/connectors/linking-panel.tsx':
    'Story 5.8 Tracker Account → Resource linking: account names, no hours.',
  'app/p/[projectId]/connectors/page.tsx':
    'Builds the linking-panel rows (story 5.8); passes account identities, no per-person hours.',
};

const PERSON_FIELD = /\b(?:assignee\w*|trackerAccount\w*)\b/i;
/**
 * A Client View path below `app/`: `c/…` behind any number of URL-less segments — route groups
 * `(name)/` and parallel-route slots `@name/`. Unbounded here; the depcruise rule is capped.
 */
const CLIENT_VIEW_PATH = /^(?:(?:\([^/]+\)|@[^/]+)\/)*c\//;
/** How many URL-less segments `client-view-not-to-approximate`'s `from` patterns cover (0–3). */
const CLIENT_VIEW_RULE_DEPTH = 3;

let releaseTree = (): void => {};
beforeAll(async () => {
  releaseTree = await acquireTreeProbeLock();
}, 300_000);
afterAll(() => releaseTree());

function walk(dir: string, keep: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, keep);
    return keep(entry.name) ? [path] : [];
  });
}

const isSource = (name: string): boolean => /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name);
const rel = (path: string): string => relative(WEB_SRC, path).split('\\').join('/');
const read = (path: string): string => readFileSync(path, 'utf8');

const parse = (fileName: string, text: string): ts.SourceFile =>
  ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

function nodes(source: ts.SourceFile): ts.Node[] {
  const out: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const specifierOf = (node: ts.ImportDeclaration | ts.ExportDeclaration): string | undefined =>
  node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;

/** Imports or re-exports the envelope: from its web entry in any form, or `Approximated` by name. */
function importsApproximated(source: ts.SourceFile): boolean {
  return source.statements.some((s) => {
    if (!ts.isImportDeclaration(s) && !ts.isExportDeclaration(s)) return false;
    if (specifierOf(s) === APPROXIMATE_ENTRY) return true;
    const names: string[] = [];
    if (ts.isImportDeclaration(s)) {
      const bindings = s.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const e of bindings.elements) names.push((e.propertyName ?? e.name).text);
      }
    } else if (s.exportClause && ts.isNamedExports(s.exportClause)) {
      for (const e of s.exportClause.elements) names.push((e.propertyName ?? e.name).text);
    }
    return names.includes('Approximated');
  });
}

/** React's `createElement(…)` or `React.createElement(…)` — never `document.createElement(…)`. */
const isReactCreateElement = (node: ts.Node, source: ts.SourceFile): node is ts.CallExpression =>
  ts.isCallExpression(node) && ['createElement', 'React.createElement'].includes(node.expression.getText(source));

/** Renders `<ApproximateBreakdown>` (JSX) or `createElement(ApproximateBreakdown, …)`, in code. */
function rendersBreakdown(source: ts.SourceFile): boolean {
  return nodes(source).some((node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      return node.tagName.getText(source) === 'ApproximateBreakdown';
    }
    if (isReactCreateElement(node, source)) {
      const first = node.arguments[0];
      return first !== undefined && ts.isIdentifier(first) && first.text === 'ApproximateBreakdown';
    }
    return false;
  });
}

const callsCreateElement = (source: ts.SourceFile): boolean =>
  nodes(source).some((n) => isReactCreateElement(n, source));

/** A view (per the header) that names the envelope without rendering it through the wrapper. */
function bypassesBreakdown(fileName: string, text: string): boolean {
  const source = parse(fileName, text);
  const isView = fileName.endsWith('.tsx') || callsCreateElement(source);
  return isView && importsApproximated(source) && !rendersBreakdown(source);
}

/** The directive prologue: leading string-literal statements (`'use client'`, `'use server'`). */
function directivesOf(fileName: string, text: string): string[] {
  const out: string[] = [];
  for (const s of parse(fileName, text).statements) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) break;
    out.push(s.expression.text);
  }
  return out;
}

const views = (): string[] => walk(WEB_SRC, isSource);

describe('the structural guard sees what it is meant to see (story 5.14, self-test)', () => {
  const IMPORT = `import type { Approximated } from '${APPROXIMATE_ENTRY}';\n`;

  it('flags a view whose only ApproximateBreakdown is in a comment or a string', () => {
    const commented = `${IMPORT}// <ApproximateBreakdown label={x}>\n/* createElement(ApproximateBreakdown, p) */\nexport const V = (r: Approximated<number[]>) => <ul>{r.data.length}</ul>;\n`;
    const quoted = `${IMPORT}export const V = (r: Approximated<number[]>) => <ul title="<ApproximateBreakdown">{r.data.length}</ul>;\n`;
    expect(bypassesBreakdown('v.tsx', commented)).toBe(true);
    expect(bypassesBreakdown('v.tsx', quoted)).toBe(true);
  });

  it('flags a namespace import of the entry and a createElement view in a .ts', () => {
    const ns = `import * as A from '${APPROXIMATE_ENTRY}';\nexport const V = (r: A.Approximated<number[]>) => <ul>{r.data.length}</ul>;\n`;
    const plain = `${IMPORT}import { createElement } from 'react';\nexport const V = (r: Approximated<number[]>) => createElement('ul', null, r.data.length);\n`;
    expect(bypassesBreakdown('v.tsx', ns)).toBe(true);
    expect(bypassesBreakdown('v.ts', plain)).toBe(true);
  });

  it('does not count a DOM helper calling document.createElement as a view', () => {
    const dom = `${IMPORT}export const make = (r: Approximated<number[]>) => document.createElement('ul').append(String(r.data.length));\n`;
    const react = `${IMPORT}import React from 'react';\nexport const V = (r: Approximated<number[]>) => React.createElement('ul', null, r.data.length);\n`;
    expect(bypassesBreakdown('v.ts', dom)).toBe(false);
    expect(bypassesBreakdown('v.ts', react)).toBe(true);
  });

  it('matches Client View paths behind route groups and parallel-route slots', () => {
    for (const path of ['c/page.tsx', '(client)/c/page.tsx', '@modal/c/[id]/page.tsx', '(a)/@b/(c)/c/x.ts']) {
      expect(CLIENT_VIEW_PATH.test(path), path).toBe(true);
    }
    for (const path of ['p/c/page.tsx', 'cx/page.tsx', '(client)/p/c/page.tsx']) {
      expect(CLIENT_VIEW_PATH.test(path), path).toBe(false);
    }
  });

  it('passes a view that renders through the wrapper, in JSX or createElement', () => {
    const jsx = `${IMPORT}export const V = (r: Approximated<number[]>) => <ApproximateBreakdown label={r}>{(d) => <ul>{d.length}</ul>}</ApproximateBreakdown>;\n`;
    const call = `${IMPORT}import { createElement } from 'react';\nexport const V = (r: Approximated<number[]>) => createElement(ApproximateBreakdown, { label: r, children: (d: number[]) => d.length });\n`;
    expect(bypassesBreakdown('v.tsx', jsx)).toBe(false);
    expect(bypassesBreakdown('v.ts', call)).toBe(false);
  });

  it('reads a directive only from the prologue, never from a comment', () => {
    expect(directivesOf('a.tsx', `'use client';\nexport const x = 1;\n`)).toEqual(['use client']);
    expect(directivesOf('a.tsx', `/* 'use client' */\n// 'use client'\nexport const x = 1;\n`)).toEqual([]);
  });
});

describe('approximate figures render through ApproximateBreakdown (story 5.14, structural)', () => {
  it('finds the wrapper as an importer of Approximated — the scan can see what it looks for', () => {
    const importers = views().filter((f) => importsApproximated(parse(f, read(f))));
    expect(importers.map(rel)).toContain(WRAPPER_FILE);
  });

  it('fails any view that imports Approximated without rendering <ApproximateBreakdown>', () => {
    const offenders = views()
      .filter((f) => rel(f) !== WRAPPER_FILE)
      .filter((f) => bypassesBreakdown(f, read(f)))
      .map(rel);
    expect(
      offenders,
      `these files import Approximated but do not render it through <ApproximateBreakdown>:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps the wrapper a server-renderable module: no "use client" directive', () => {
    const path = join(WEB_SRC, WRAPPER_FILE);
    expect(directivesOf(path, read(path))).not.toContain('use client');
  });
});

describe('the Client View carries no person-level actuals (story 5.14 / FR-34)', () => {
  /** Exit code 2 means violations were found, which the probe below expects. */
  function cruise(entries: readonly string[]): {
    modules: readonly { source: string }[];
    summary: { violations: readonly { from: string; to: string; rule: { name: string } }[] };
  } {
    try {
      const out = execFileSync(
        join(ROOT, 'node_modules/.bin/depcruise'),
        [...entries, '--config', '.dependency-cruiser.cjs', '--output-type', 'json'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      );
      return JSON.parse(out);
    } catch (error) {
      const failure = error as { status?: number; stdout?: string };
      if (failure.status === 2 && failure.stdout) return JSON.parse(failure.stdout);
      throw error;
    }
  }

  const APPROXIMATE_MODULE = /^(apps\/web\/src\/components\/approximate-notice\.tsx|packages\/domain\/src\/(present\/)?approximate\.ts)$/;

  it.each(['packages/domain/src/present/index.ts', 'packages/domain/src/index.ts'])(
    'keeps the domain barrel %s from reaching the approximate modules',
    (barrel) => {
      // A real Client View reaches `@momo/domain` through `packages/app`; were the barrel to
      // reach approximate.ts, `client-view-not-to-approximate` would fire on every one of them.
      const { modules } = cruise([barrel]);
      expect(modules.map((m) => m.source)).toContain(barrel);
      expect(modules.map((m) => m.source).filter((s) => APPROXIMATE_MODULE.test(s))).toEqual([]);
    },
    120_000,
  );

  it(`has no c/ folder behind more than ${CLIENT_VIEW_RULE_DEPTH} route groups or slots (the rule's cap)`, () => {
    const tooDeep = walk(APP_DIR, () => true)
      .map((f) => relative(APP_DIR, dirname(f)).split('\\').join('/') + '/')
      .filter((dir) => CLIENT_VIEW_PATH.test(dir))
      .filter((dir) => {
        const head = dir.split('/');
        const urlLess = head.slice(0, head.indexOf('c')).length;
        return urlLess > CLIENT_VIEW_RULE_DEPTH;
      });
    expect(
      [...new Set(tooDeep)],
      'a Client View sits behind more URL-less segments than client-view-not-to-approximate ' +
        'matches — add a depth to CLIENT_VIEW_ROUTE in .dependency-cruiser.cjs and to this constant',
    ).toEqual([]);
  });

  it('has no file on a Client View path that imports Approximated or names a person field', () => {
    const offenders = walk(APP_DIR, isSource)
      .filter((f) => CLIENT_VIEW_PATH.test(relative(APP_DIR, f).split('\\').join('/')))
      .filter((f) => {
        const text = read(f);
        return importsApproximated(parse(f, text)) || PERSON_FIELD.test(text);
      })
      .map(rel);
    expect(offenders, `Client View files with person-level actuals:\n${offenders.join('\n')}`).toEqual([]);
  });

  it("matches the rule's own from patterns against Client View paths at every depth, groups and slots", () => {
    const config = createRequire(import.meta.url)(join(ROOT, '.dependency-cruiser.cjs')) as {
      forbidden: readonly { name: string; from: { path: string | readonly string[] } }[];
    };
    const rule = config.forbidden.find((r) => r.name === 'client-view-not-to-approximate');
    expect(rule, 'rule client-view-not-to-approximate is missing').toBeDefined();
    const patterns = ([] as string[]).concat(rule!.from.path).map((p) => new RegExp(p));
    const matches = (path: string): boolean => patterns.some((re) => re.test(path));
    for (const path of [
      'apps/web/src/app/c/page.tsx',
      'apps/web/src/app/@modal/c/x.tsx',
      'apps/web/src/app/(a)/@b/(c)/c/x.ts',
    ]) {
      expect(matches(path), path).toBe(true);
    }
    expect(matches('apps/web/src/app/p/c/page.tsx')).toBe(false);
  });

  describe('rule client-view-not-to-approximate fires on a Client View under a route group', () => {
    /**
     * Written into the real tree (a depcruise rule is a path) under a route group nothing real
     * uses, and only that group's directory is removed in afterAll — never a real `(client)`.
     */
    const PROBE_GROUP = 'apps/web/src/app/(__probe-approximate)';
    /** Outside the Client View: proves the rule follows reachability, not only direct imports. */
    const SHARED = 'apps/web/src/__probe-approximate-shared.ts';
    const SHARED_SOURCE = "export { ApproximateBreakdown } from '@/components/approximate-notice';\n";
    const PROBES = {
      page: [
        `${PROBE_GROUP}/c/page.tsx`,
        "import { ApproximateBreakdown } from '@/components/approximate-notice';\nexport default function Page() {\n  return ApproximateBreakdown;\n}\n",
      ],
      typeOnly: [
        `${PROBE_GROUP}/c/[id]/rows.ts`,
        `import type { Approximated } from '${APPROXIMATE_ENTRY}';\nexport type Rows = Approximated<readonly string[]>;\n`,
      ],
      indirect: [
        `${PROBE_GROUP}/c/indirect/page.tsx`,
        "import { ApproximateBreakdown } from '@/__probe-approximate-shared';\nexport default function Page() {\n  return ApproximateBreakdown;\n}\n",
      ],
    } as const;
    let fired: readonly { from: string; to: string; rule: { name: string } }[] = [];
    let wrote = false;

    beforeAll(() => {
      if (existsSync(join(ROOT, PROBE_GROUP))) {
        throw new Error(`${PROBE_GROUP} already exists — a leaked probe or a real route; refusing to write over it`);
      }
      if (existsSync(join(ROOT, SHARED))) {
        throw new Error(`${SHARED} already exists — a leaked probe or a real module; refusing to write over it`);
      }
      wrote = true;
      writeFileSync(join(ROOT, SHARED), SHARED_SOURCE);
      for (const [path, source] of Object.values(PROBES)) {
        mkdirSync(dirname(join(ROOT, path)), { recursive: true });
        writeFileSync(join(ROOT, path), source);
      }
      fired = cruise(Object.values(PROBES).map(([path]) => path)).summary.violations;
    }, 120_000);

    afterAll(() => {
      if (!wrote) return;
      rmSync(join(ROOT, PROBE_GROUP), { recursive: true, force: true });
      rmSync(join(ROOT, SHARED), { force: true });
    });

    it('reports the page importing the wrapper', () => {
      expect(
        fired.filter((v) => v.from === PROBES.page[0]).map((v) => [v.rule.name, v.to]),
      ).toContainEqual(['client-view-not-to-approximate', 'apps/web/src/components/approximate-notice.tsx']);
    });

    it('reports a type-only import of the web entry', () => {
      expect(
        fired.filter((v) => v.from === PROBES.typeOnly[0]).map((v) => [v.rule.name, v.to]),
      ).toContainEqual(['client-view-not-to-approximate', 'packages/domain/src/present/approximate.ts']);
    });

    it('reports a Client View that reaches the wrapper only through a shared module (reachable: true)', () => {
      expect(
        fired.filter((v) => v.from === PROBES.indirect[0]).map((v) => [v.rule.name, v.to]),
      ).toContainEqual(['client-view-not-to-approximate', 'apps/web/src/components/approximate-notice.tsx']);
      expect(fired.filter((v) => v.from === SHARED)).toEqual([]);
    });

    it('fires no other rule on the probes', () => {
      expect([...new Set(fired.map((v) => v.rule.name))]).toEqual(['client-view-not-to-approximate']);
    });
  });
});

describe('only allow-listed views name a person (story 5.14, secondary field-name scan)', () => {
  const personViews = (): string[] =>
    views().filter((f) => f.endsWith('.tsx') || callsCreateElement(parse(f, read(f))));

  it('finds no assignee / Tracker Account field in a view outside the allow-list', () => {
    const offenders = personViews()
      .map(rel)
      .filter((f) => !(f in PERSON_FIELD_ALLOW_LIST))
      .filter((f) => PERSON_FIELD.test(read(join(WEB_SRC, f))));
    expect(
      offenders,
      `these views name an assignee or Tracker Account; a person-level view must go through ` +
        `ApproximateBreakdown and be allow-listed here with its reason:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps no stale allow-list entry', () => {
    const stale = Object.keys(PERSON_FIELD_ALLOW_LIST).filter((f) => {
      const path = join(WEB_SRC, f);
      return !existsSync(path) || !PERSON_FIELD.test(read(path));
    });
    expect(stale).toEqual([]);
  });
});

describe('the Review carries no free-floating approximate caption (story 5.14, Q2→C)', () => {
  // Review figures are exact: Addendum A.2 books each delta to the later snapshot's Period.
  // Only a person/day breakdown spreads deltas, and its caption comes from ApproximateBreakdown.
  const REVIEW_PAGE = join(APP_DIR, 'p', '[projectId]', 'review', 'page.tsx');
  const OLD_KEY = 'approximate_hours_are_derived_from_the_differenc';
  const messages = (loc: 'en' | 'ja'): { review: Record<string, unknown> } =>
    JSON.parse(read(join(ROOT, 'packages', 'i18n', 'src', 'messages', `${loc}.json`)));

  it('does not render the old footer, nor an approximate caption outside ApproximateBreakdown', () => {
    const text = read(REVIEW_PAGE);
    expect(text).not.toContain(OLD_KEY);
    expect(text.includes('actuals.approximate.') && !rendersBreakdown(parse(REVIEW_PAGE, text))).toBe(false);
  });

  it('has deleted the old footer key from en and ja', () => {
    for (const loc of ['en', 'ja'] as const) {
      expect(messages(loc).review).not.toHaveProperty(OLD_KEY);
    }
  });
});
