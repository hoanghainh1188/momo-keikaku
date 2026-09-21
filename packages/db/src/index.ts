// NOTE: `fixtures.ts` is deliberately NOT re-exported here. It reads the fixture
// files from disk and is only used by the seed and the tests; keeping it out of
// this barrel keeps the Next.js server bundle free of filesystem globbing.
//
// `seed.ts` is not here either, for the same reason and one more: its composition root is
// `scripts/seed.ts`, and nothing in an application should be able to truncate the database
// by importing a barrel.
//
// `probe-tenants.ts` is in that same category — it writes and deletes whole Tenants for the
// cross-tenant harness, and is imported by `tests/cross-tenant.test.ts` by path and by
// nothing else. (The harness and its registry lived in this package until story 1.2 slice 3
// moved them to the root `tests/` directory, beside the use cases they now enumerate.)
export * from './client';
export * from './schema';
export * from './repo';
export * from './table-classes';
export * from './with-tenant';
