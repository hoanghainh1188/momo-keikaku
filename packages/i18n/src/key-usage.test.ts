import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flattenKeys, messagesOf } from './index';

/**
 * Every literal `t('ns.key')` in `apps/web/src` names a key the `en` catalogue has (story 2.2,
 * review pass 1). `key-parity.test.ts` keeps `en` and `ja` in step with each other; nothing kept
 * the pages in step with them, so a removed or misspelt key only showed up as a raw key on screen.
 *
 * Only LITERAL keys are checked: `t('review.spi')` or `t("review.spi")`. A template or computed
 * key (`t(\`review.health.${key}\`)`) is skipped — its set is decided at runtime.
 *
 * A file that scopes its translator (`getTranslations('auth.signIn')`, `useTranslations(...)`)
 * resolves its literals under that namespace; a key counts as present when it exists bare or
 * under any namespace the file declares.
 */
const WEB_SRC = fileURLToPath(new URL('../../../apps/web/src/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const LITERAL_CALL = /\bt\(\s*(['"])([A-Za-z0-9_.]+)\1/g;
const NAMESPACE = /\b(?:getTranslations|useTranslations)\(\s*(['"])([A-Za-z0-9_.]+)\1/g;

describe('i18n keys used by apps/web', () => {
  it('finds the web sources it is meant to scan', () => {
    expect(sourceFiles(WEB_SRC).length).toBeGreaterThan(10);
  });

  it('resolves every literal t(...) key in the en catalogue', () => {
    const known = new Set(flattenKeys(messagesOf('en')));
    const missing: string[] = [];
    let checked = 0;
    for (const file of sourceFiles(WEB_SRC)) {
      const text = readFileSync(file, 'utf8');
      const namespaces = [...text.matchAll(NAMESPACE)].map((m) => m[2]!);
      for (const match of text.matchAll(LITERAL_CALL)) {
        const key = match[2]!;
        checked += 1;
        const candidates = [key, ...namespaces.map((ns) => `${ns}.${key}`)];
        if (!candidates.some((candidate) => known.has(candidate))) {
          missing.push(`${relative(WEB_SRC, file)}: ${key}`);
        }
      }
    }
    expect(checked, 'the scan found no literal keys at all').toBeGreaterThan(100);
    expect(missing, `keys used in apps/web but absent from en.json:\n${missing.join('\n')}`).toEqual(
      [],
    );
  });
});
