// `packages/adapters` implements the outbound ports `packages/app` declares.
//
// The clock (story 1.1), the UUIDv7 id generator (story 1.3 slice 2) and the console mailer
// (story 1.4 slice 4), all wired by `apps/web`'s composition root — the only `apps/*` file
// allowed to import this package (`.dependency-cruiser.cjs`,
// `apps-adapters-only-from-composition-root`). `mailer-ses` (Epic 8) and the tracker clients and
// queue adapter arrive in later stories.
export * from './clock';
export * from './ids';
export * from './mailer-console';
