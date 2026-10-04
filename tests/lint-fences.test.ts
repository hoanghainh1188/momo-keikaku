import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

/**
 * AD-4's two lint fences, pinned. Both are fences BY LOCATION (`files`/`ignores` globs in
 * `eslint.config.js`), so a mistyped glob or a reordered block would switch one off with
 * `pnpm lint` still green. This drives the real config through ESLint's API: the snippet is
 * linted as if it lived at `filePath`, whether or not that file contains it.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: ROOT });

const ROUNDING = 'const x = 1.5;\nexport const a = Math.round(x);\nexport const b = x.toFixed(1);\n';
const STRINGIFY = 'const x = { a: 1 };\nexport const s = JSON.stringify(x);\n';

async function restricted(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${ROOT}${filePath}` });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-properties')
    .map((m) => m.message.split(' is restricted')[0]!);
}

async function restrictedSyntax(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${ROOT}${filePath}` });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => m.message);
}

describe('the AD-4 rounding fence', () => {
  it.each(['packages/domain/src/evm.ts', 'packages/domain/src/evm.test.ts'])(
    'flags Math.round and .toFixed in %s',
    async (path) => {
      expect(await restricted(ROUNDING, path)).toEqual(["'Math.round'", "'toFixed'"]);
    },
  );

  it.each(['packages/domain/src/present/index.ts', 'packages/domain/src/present/present.test.ts'])(
    'lets %s round — it is the presentation module',
    async (path) => {
      expect(await restricted(ROUNDING, path)).toEqual([]);
    },
  );
});

describe('the AD-4 JSON.stringify fence', () => {
  it.each(['packages/db/src/repo-writes.ts', 'tests/schedule/fence-harness.ts'])(
    'flags JSON.stringify in non-test application source (%s)',
    async (path) => {
      expect(await restricted(STRINGIFY, path)).toEqual(["'JSON.stringify'"]);
    },
  );

  it.each([
    'packages/domain/src/present/codec.ts',
    'packages/db/src/demo-golden.test.ts',
    'tests/cross-tenant.test.ts',
  ])('allows it in %s', async (path) => {
    expect(await restricted(STRINGIFY, path)).toEqual([]);
  });
});

describe('the NFR-S8 dangerouslySetInnerHTML ban (story 1.7)', () => {
  const planted = 'export const x = <div dangerouslySetInnerHTML={{ __html: "x" }} />;\n';

  it('flags dangerouslySetInnerHTML in application TSX', async () => {
    const messages = await restrictedSyntax(planted, 'apps/web/src/components/shell.tsx');
    expect(messages.some((m) => m.includes('dangerouslySetInnerHTML'))).toBe(true);
  });
});
