// The hardcoded `postgres://momo:momo@localhost:55433/momo_keikaku` default that used to
// sit on the line below is gone, together with its twin in packages/db/src/client.ts. They
// were removed in the same change on purpose: with only one of them removed, a missing
// DATABASE_URL still reached a localhost database through the other — and on a machine
// where that database exists, it connected *successfully, to the wrong place*.
//
// drizzle-kit is tooling and runs outside the environment fence, so it reads the key here
// rather than through packages/app/src/config.ts, which cannot be imported from a
// drizzle-kit config without pulling the whole application layer into the CLI's loader.
// The failure is the same shape: it names the key.
const url = process.env.DATABASE_URL;
if (!url) {
    throw new Error('DATABASE_URL is required — the PostgreSQL connection string for the owning role, ' +
        'e.g. postgres://user:pass@host:port/db. There is no localhost default.');
}
export default {
    // Two files: the tenant-membership bridge sits in its own module so the `@momo/db` barrel
    // cannot re-export it (story 1.4 slice 1 — it has one reader).
    schema: ['./packages/db/src/schema.ts', './packages/db/src/schema-membership.ts'],
    out: './packages/db/drizzle',
    dialect: 'postgresql',
    dbCredentials: { url },
};
