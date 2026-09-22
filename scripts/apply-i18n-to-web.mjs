/**
 * Replaces exact JSX text nodes with `{t('dotted.key')}` using en.json values.
 * Adds `const t = await getTranslations();` to async server components when needed.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/i18n/src/messages/en.json'), 'utf8'));

/** @param {unknown} node @param {string} prefix */
function flatten(node, prefix, out) {
  if (typeof node === 'string') {
    if (node.length >= 3 && !node.includes('return (') && !node.includes('.join(')) {
      if (!out.has(node)) out.set(node, prefix);
    }
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  for (const [k, v] of Object.entries(node)) {
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

const valueToKey = new Map();
flatten(en, '', valueToKey);

const WEB = path.join(ROOT, 'apps/web/src');

/** @param {string} dir */
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(abs);
      continue;
    }
    if (!ent.name.endsWith('.tsx')) continue;
    if (ent.name.includes('.test.')) continue;
    let text = fs.readFileSync(abs, 'utf8');
    const isServerPage =
      text.includes('export default async function') || text.includes('export default async ');
    let changed = false;

    const sorted = [...valueToKey.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [value, key] of sorted) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp(`>\\s*${escaped.replace(/\s+/g, '\\s+')}\\s*<`, 'g'),
        new RegExp(`title=\\{?['"]${escaped}['"]\\}?`, 'g'),
        new RegExp(`intro=\\{?['"]${escaped}['"]\\}?`, 'g'),
      ];
      for (const re of patterns) {
        if (re.test(text)) {
          text = text.replace(re, (match) => {
            if (match.startsWith('title=')) return `title={t('${key}')}`;
            if (match.startsWith('intro=')) return `intro={t('${key}')}`;
            return `>{t('${key}')}<`;
          });
          changed = true;
        }
      }
    }

    if (!changed) continue;

    if (isServerPage && !text.includes('getTranslations')) {
      text = `import { getTranslations } from 'next-intl/server';\n${text}`;
      text = text.replace(
        /export default async function ([^(]+)\([^)]*\)\s*\{/,
        (m) => `${m}\n  const t = await getTranslations();`,
      );
    }

    if (text.includes("'use client'") && !text.includes('useTranslations')) {
      text = text.replace("'use client';", "'use client';\n\nimport { useTranslations } from 'next-intl';");
      text = text.replace(
        /export function (\w+)\(/,
        (m, name) => `${m.replace(`export function ${name}(`, `export function ${name}(`)}\n  const t = useTranslations();`,
      );
    }

    fs.writeFileSync(abs, text);
    console.log('updated', path.relative(ROOT, abs));
  }
}

walk(WEB);
