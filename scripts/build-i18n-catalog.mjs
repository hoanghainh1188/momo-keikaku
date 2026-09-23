/**
 * One-off catalog builder for story 1.9: walks apps/web UI sources and emits nested en.json.
 * Keys are grouped by path prefix; duplicate text reuses the first key.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WEB = path.join(ROOT, 'apps/web/src');

/** @param {string} rel */
function prefixFor(rel) {
  if (rel.startsWith('app/sign-in/')) return 'auth.signIn';
  if (rel.startsWith('app/forgot-password/')) return 'auth.forgotPassword';
  if (rel.startsWith('app/reset-password/')) return 'auth.resetPassword';
  if (rel.startsWith('app/no-access/')) return 'auth.noAccess';
  if (rel.startsWith('app/admin/audit/')) return 'admin.audit';
  if (rel.startsWith('app/admin/')) return 'admin';
  if (rel.startsWith('app/p/') && rel.includes('/review/')) return 'review';
  if (rel.startsWith('app/p/') && rel.includes('/plan/')) return 'plan';
  if (rel.startsWith('app/p/') && rel.includes('/mapping/')) return 'mapping';
  if (rel.startsWith('app/p/') && rel.includes('/connectors/')) return 'connectors';
  if (rel.startsWith('app/p/') && rel.includes('/baselines/')) return 'baselines';
  if (rel.startsWith('app/p/') && rel.includes('/layout')) return 'shell';
  if (rel.startsWith('app/layout')) return 'meta';
  if (rel.startsWith('components/shell')) return 'shell';
  if (rel.startsWith('components/sign-out')) return 'shell.signOut';
  if (rel.startsWith('components/user-chip')) return 'shell.userChip';
  if (rel.startsWith('components/ui')) return 'ui';
  if (rel.startsWith('components/disposition-rail')) return 'review.disposition';
  if (rel.startsWith('components/map-ticket-form')) return 'mapping.form';
  if (rel.startsWith('components/scope-ledger-bar')) return 'mapping.ledger';
  return 'common';
}

/** @param {string} text */
function slug(text) {
  const base = text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  return base || 'text';
}

/** @param {Record<string, unknown>} tree @param {string[]} parts @param {string} value */
function setNested(tree, parts, value) {
  let node = tree;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (typeof node[p] !== 'object' || node[p] === null) node[p] = {};
    node = /** @type {Record<string, unknown>} */ (node[p]);
  }
  const leaf = parts[parts.length - 1];
  if (node[leaf] === undefined) node[leaf] = value;
}

/** @param {string} dir */
function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (!/\.(tsx|ts)$/.test(ent.name)) continue;
    const rel = path.relative(WEB, abs).replaceAll('\\', '/');
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue;
    if (rel.includes('/actions.ts')) continue;
    const prefix = prefixFor(rel);
    const text = fs.readFileSync(abs, 'utf8');

    const patterns = [
      /\btitle=\{?['"]([^'"]{2,})['"]\}?/g,
      /\bintro=\{?['"]([^'"]{2,})['"]\}?/g,
      /\blabel=\{?['"]([^'"]{2,})['"]\}?/g,
      /\bplaceholder=\{?['"]([^'"]{2,})['"]\}?/g,
      /metadata\s*=\s*\{[^}]*title:\s*['"]([^'"]+)['"]/g,
      />\s*([A-Za-z][^<{]{2,}?)\s*</g,
    ];

    const seen = new Set();
    for (const re of patterns) {
      let m;
      while ((m = re.exec(text))) {
        let s = m[1]
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/&rsquo;/g, "'")
          .replace(/&amp;/g, '&');
        if (!s || s.includes('{') || s.includes('`') || /^https?:/.test(s)) continue;
        if (seen.has(s)) continue;
        seen.add(s);
        const key = slug(s);
        setNested(out, [...prefix.split('.'), key], s);
      }
    }
  }
}

const tree = {
  errors: {
    not_found: 'That item could not be found.',
    invalid_input: 'Something in the request was not valid.',
  },
  mail: {
    resetPassword: {
      subject: 'Reset your momo-keikaku password',
      body: {
        intro: 'We received a request to reset your momo-keikaku password.',
        linkLine: 'Reset it here: {link}',
        expiry: 'This link expires in {hours, plural, one {# hour} other {# hours}} and can be used once. If you did not request this, you can ignore this email — your password will not change.',
      },
    },
  },
};

walk(WEB, tree);

// Manual fixes for auth flows (script misses JSX expressions).
setNested(tree, ['auth', 'forgotPassword', 'sent', 'oneHour'], "If that email has an account, we've sent a link to reset the password. It expires in an hour.");
setNested(tree, ['auth', 'forgotPassword', 'sent', 'manyHours'], "If that email has an account, we've sent a link to reset the password. It expires in {hours} hours.");

const outDir = path.join(ROOT, 'packages/i18n/src/messages');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'en.json'), `${JSON.stringify(tree, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'ja.json'), `${JSON.stringify(tree, null, 2)}\n`);
console.log('Wrote', path.join(outDir, 'en.json'));
