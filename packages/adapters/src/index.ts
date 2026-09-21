// `packages/adapters` implements the outbound ports `packages/app` declares.
//
// The clock (story 1.1) and the UUIDv7 id generator (story 1.3 slice 2), both wired by
// `apps/web`'s composition root — the only `apps/*` file allowed to import this package
// (`.dependency-cruiser.cjs`, `apps-adapters-only-from-composition-root`). Mail, the tracker
// clients and the queue adapter arrive in later stories.
export * from './clock';
export * from './ids';
