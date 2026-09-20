import { describe, expect, it } from 'vitest';

/**
 * The migrator step's pure guards: the two places where a bad value has to be refused with a
 * name rather than carried into SQL or into the wrong database.
 *
 * No database is involved. What is being tested is that `parseAppRoleIdentity` actually
 * decodes a percent-encoded password (a password containing `@`, `/` or `:` must be encoded
 * in the URL and must not be *created* encoded — CI's password decodes to itself, so the
 * decode is invisible there and deleting it would ship green), and that both guards refuse
 * the shapes that would otherwise fail much later and much less legibly.
 *
 * The import is dynamic and preceded by two assignments because
 * `packages/app/src/config.ts` parses eagerly at module load: importing the script for its
 * pure functions would otherwise require a real environment it never uses. The script's own
 * top-level `main()` is behind an entry-point check, so this import runs no migration.
 */
process.env.DATABASE_URL ??= 'postgres://owner:owner@localhost:55433/momo_keikaku';
process.env.APP_DATABASE_URL ??= 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku';

const { parseAppRoleIdentity, assertSameDatabase } = await import('./pgboss-migrate');

describe('parseAppRoleIdentity', () => {
  it('reads the role name and password out of the connection string', () => {
    expect(parseAppRoleIdentity('postgres://momo_app:s3cret@localhost:55433/momo_keikaku')).toEqual({
      name: 'momo_app',
      password: 's3cret',
    });
  });

  it('decodes a percent-encoded password, so the role is created with the real one', () => {
    // 'p@ss/w:rd' cannot appear literally in a URL — each of those three characters would be
    // read as URL structure. Creating the role with the encoded form would make every
    // subsequent login fail with a password the operator never chose.
    expect(
      parseAppRoleIdentity('postgres://momo_app:p%40ss%2Fw%3Ard@localhost:55433/momo_keikaku')
        .password,
    ).toBe('p@ss/w:rd');
  });

  it('refuses a string that is not a URL', () => {
    expect(() => parseAppRoleIdentity('momo_app:momo_app@localhost/db')).toThrow(/not a URL/);
  });

  it('refuses a user name it would have to quote into SQL', () => {
    expect(() => parseAppRoleIdentity('postgres://Bobby%22;--:pw@localhost/db')).toThrow(
      /user name matching/,
    );
  });

  it('refuses a missing password, because the role has to log in', () => {
    expect(() => parseAppRoleIdentity('postgres://momo_app@localhost/db')).toThrow(
      /must carry a password/,
    );
  });
});

describe('assertSameDatabase', () => {
  it('accepts two strings naming the same database', () => {
    expect(() =>
      assertSameDatabase(
        'postgres://momo:momo@localhost:55433/momo_keikaku',
        'postgres://momo_app:pw@localhost:55433/momo_keikaku',
      ),
    ).not.toThrow();
  });

  it('treats an omitted port as 5432 rather than as a mismatch', () => {
    expect(() =>
      assertSameDatabase(
        'postgres://momo:momo@localhost/momo_keikaku',
        'postgres://momo_app:pw@localhost:5432/momo_keikaku',
      ),
    ).not.toThrow();
  });

  it('names a mismatch instead of landing the roles in the wrong database', () => {
    expect(() =>
      assertSameDatabase(
        'postgres://momo:momo@localhost:55433/momo_keikaku',
        'postgres://momo_app:pw@localhost:55433/momo_kiekaku',
      ),
    ).toThrow(/different databases \(localhost:55433\/momo_keikaku vs localhost:55433\/momo_kiekaku\)/);
  });
});
