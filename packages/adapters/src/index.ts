// `packages/adapters` implements the outbound ports `packages/app` declares.
//
// The clock (story 1.1), the UUIDv7 id generator (story 1.3 slice 2) and the console mailer
// (story 1.4 slice 4), all wired by `apps/web`'s composition root — the only `apps/*` file
// allowed to import this package (`.dependency-cruiser.cjs`,
// `apps-adapters-only-from-composition-root`). Story 5.1 adds fixture-replay and the
// GET-only backlog-http scaffold; `mailer-ses` (Epic 8) and the queue adapter arrive later.
export * from './clock';
export * from './ids';
export * from './mailer-console';
export * from './fixture-replay';
export * from './backlog-http';
export * from './credentials-aes';
