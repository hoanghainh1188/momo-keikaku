import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
/**
 * The two source-level bans, asserted over the whole repository.
 *
 * ESLint enforces both as well (`eslint.config.js`, the `tenantSyntax` block) and that is
 * the gate a developer sees first. It covers every module ESLint parses — `apps/**`,
 * `packages/**`, `scripts/**` and the root configs. This file is the backstop for everything
 * it cannot: the rules are *syntax* selectors, so they see a string literal and a member call
 * and nothing at all in a comment, a `.sql` file, the CI workflow, `infra/` or a Markdown
 * snippet. A ban that can be restated one directory over in a file ESLint does not parse is
 * not a ban. So this walks EVERY tracked file, whatever its type and wherever it sits.
 *
 * The files are listed by `git ls-files`, so anything ignored (node_modules, .next, build
 * output) is out of scope by construction rather than by a hand-maintained exclusion list.
 *
 * One tree is excluded: `_bmad-output/`. Those are the planning artifacts — the
 * architecture spine, the epics and this story's own spec — and they are where the ban is
 * *stated*. A document that says "this form is banned" has to be able to name the form.
 * Everything that ships, and everything that configures what ships, is in scope.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/**
 * The banned form, assembled from parts.
 *
 * Written this way so that this file — the one asserting the phrase appears nowhere — does
 * not itself contain it. `grep -r` for the phrase across the repository returns nothing,
 * including this test, which is the property the spec's verification step checks by hand.
 */
const BANNED_SET_FORM = new RegExp(['SET', '\\s+LOCAL\\s+', 'app', '\\.', 'tenant_id'].join(''), 'i');
/** The planning artifacts: prose that has to be able to name what it forbids. */
const PLANNING_ARTIFACTS = /^_bmad(-output)?\//;
/** Every tracked file, relative to the repository root. */
function trackedFiles() {
    return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
        .split('\0')
        .filter((path) => path.length > 0 && !PLANNING_ARTIFACTS.test(path));
}
/** Text files only: a binary read as utf8 would match nothing useful and cost a lot. */
const TEXT_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|sql|json|ya?ml|md|css|toml|sh|nvmrc|gitignore)$/i;
function textFiles() {
    return trackedFiles().filter((path) => TEXT_EXTENSIONS.test(path) || !path.includes('.'));
}
describe('the non-parameterizable SET form of the tenant setting is absent', () => {
    it('appears in no tracked file, in code or in prose', () => {
        // It cannot take a bind parameter — the right-hand side of SET is not an expression —
        // so using it means interpolating a tenant id into SQL. `withTenant` issues
        // `set_config('app.tenant_id', $1, true)` with the value bound instead.
        //
        // Prose counts. A comment showing the banned form is how it comes back: someone greps
        // for it, finds it, and copies it.
        const offenders = textFiles().filter((path) => {
            let contents;
            try {
                contents = readFileSync(`${ROOT}${path}`, 'utf8');
            }
            catch {
                return false;
            }
            return BANNED_SET_FORM.test(contents);
        });
        expect(offenders, `the banned SET form appears in: ${offenders.join(', ')}`).toEqual([]);
    });
});
describe('the bare db handle never issues a query', () => {
    /**
     * A handle from `getDb(connectionString)` has no tenant set: a read on it returns nothing
     * from a tenant-owned table and a write is refused by the policy's WITH CHECK. The
     * convention is a naming one — `db` opens transactions, `tx` issues queries — so the
     * violation is visible in a diff and not only to a linter.
     *
     * The same selector list as the ESLint rule. Duplicated on purpose: this one reads the
     * text, so it also covers the shapes an AST selector cannot see (a handle reached through
     * an alias in a template, say), and it covers files ESLint's `applicationSources` globs
     * do not reach.
     */
    const BARE_HANDLE = /\bdb\s*\.\s*(select|selectDistinct|selectDistinctOn|insert|update|delete|execute|query|\$with)\s*[(<]/;
    it('is not called on a variable named `db` in any tracked module', () => {
        // Every tracked module, not only the three trees the application happens to live in
        // today: a `db.select(...)` in a root config or a future directory is the same mistake.
        const sources = textFiles().filter((path) => /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(path) &&
            // This file names the shape in order to forbid it.
            path !== 'packages/db/src/source-discipline.test.ts');
        const offenders = sources.filter((path) => {
            const contents = readFileSync(`${ROOT}${path}`, 'utf8');
            return contents.split('\n').some((line) => BARE_HANDLE.test(line));
        });
        expect(offenders, `a bare \`db\` handle issues a query in: ${offenders.join(', ')}. ` +
            'Wrap the work in withTenant(db, tenantId, (tx) => …) and issue it on `tx`.').toEqual([]);
    });
});
describe('the tenant-membership bridge has one reader for request resolution, one writer (story 1.4)', () => {
    /**
     * `resolveRequestContext` is the one place a membership is read to resolve a request, and it
     * reads through `membershipsOf` (`repo-membership.ts`); story 1.4 slice 2's audited membership
     * use cases are the one place it is changed, through `membershipWriterOn`
     * (`repo-membership-write.ts`). So among the modules that SHIP — every tracked TypeScript/
     * JavaScript file outside the tests — only that reader, that writer, the seed (which writes the
     * demo members) and the probe Tenants (which write and remove theirs) may import the Drizzle
     * symbol, and no other one may name the table in a query. Tests are outside the rule: a test has
     * to be able to seed a membership and look one up.
     *
     * The `@momo/db` barrel does not export the symbol either, so an application cannot reach it by
     * the package name.
     */
    const ALLOWED_IMPORTERS = new Set([
        'packages/db/src/repo-membership.ts',
        'packages/db/src/repo-membership-write.ts',
        'packages/db/src/seed.ts',
        'packages/db/src/probe-tenants.ts',
    ]);
    const DEFINITION = 'packages/db/src/schema-membership.ts';
    /** Code only: a comment that NAMES the table or the symbol (this rule's own prose) is not a use. */
    const code = (path) => readFileSync(`${ROOT}${path}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const isTest = (path) => /\.test\.[cm]?[jt]sx?$/.test(path) || path.startsWith('tests/');
    const applicationSources = () => textFiles().filter((path) => /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(path) && !isTest(path));
    it('imports `tenantMembership` only in its reader, its writer, the seed and the probe Tenants', () => {
        const importers = applicationSources().filter((path) => {
            if (path === DEFINITION)
                return false;
            const contents = code(path);
            return (/\btenantMembership\b/.test(contents) ||
                /(from\s+|import\s*\(\s*)['"][^'"]*schema-membership(\.[jt]s)?['"]/.test(contents));
        });
        expect(importers.sort()).toEqual([...ALLOWED_IMPORTERS].sort());
    });
    it('is named in a FROM or JOIN by no other application source', () => {
        const offenders = applicationSources().filter((path) => {
            if (ALLOWED_IMPORTERS.has(path) || path === DEFINITION)
                return false;
            return /\b(FROM|JOIN)\s+"?tenant_membership\b/i.test(code(path));
        });
        expect(offenders, `tenant_membership is queried outside its reader in: ${offenders.join(', ')}`).toEqual([]);
    });
    it('has its reader, `membershipsOf`, named only where it is defined, exported and wired', () => {
        // The spec: the reader is called only by `resolveRequestContext`, which the composition root
        // hands it to. Among shipping sources the identifier appears in exactly these files: the reader,
        // the barrel, the composition root that wires it — and, under the same name, the `packages/app`
        // port member it satisfies and the resolver, its one caller.
        const namers = applicationSources().filter((path) => /\bmembershipsOf\b/.test(code(path)));
        expect(namers.sort()).toEqual([
            'apps/web/src/server/composition.ts',
            'packages/app/src/authz/resolve-request-context.ts',
            'packages/app/src/ports/membership.ts',
            'packages/db/src/index.ts',
            'packages/db/src/repo-membership.ts',
        ].sort());
    });
    it('has its writer, `membershipWriterOn`, named only where it is defined and composed', () => {
        // One writer, pinned the way the reader is: defined in `repo-membership-write.ts` and composed
        // into the one tenant transaction every audited write runs in — so a second module building
        // its own membership writer (outside the transaction, or on a handle of its own) fails here.
        const namers = applicationSources().filter((path) => /\bmembershipWriterOn\b/.test(code(path)));
        expect(namers.sort()).toEqual(['packages/db/src/repo-membership-write.ts', 'packages/db/src/tenant-transaction.ts'].sort());
    });
    it('is not exported by the @momo/db barrel', () => {
        const barrel = code('packages/db/src/index.ts');
        expect(barrel).not.toMatch(/schema-membership/);
        expect(barrel).not.toMatch(/\btenantMembership\b/);
    });
    it('has `identityEventWriterOn`, `identity_event`\'s one writer, named only where it is defined, exported and composed (story 1.4 slice 4)', () => {
        // `identity_event` is global — no tenant, no tenant transaction to run inside — so its writer
        // is not folded into `inTenantTransaction`'s scope the way the membership writer is; the
        // composition root calls it directly and hands the result to `createAuth` as `identityEvents`.
        const namers = applicationSources().filter((path) => /\bidentityEventWriterOn\b/.test(code(path)));
        expect(namers.sort()).toEqual([
            'packages/db/src/repo-identity-event.ts',
            'packages/db/src/index.ts',
            'apps/web/src/server/composition.ts',
        ].sort());
    });
});
