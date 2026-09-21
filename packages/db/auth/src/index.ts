// `packages/db/auth` is the single sanctioned Better Auth <-> Drizzle binding, exposed
// to `apps/web` as an identity port. It is one of AD-1's two named carve-outs (the other is
// `apps/web/src/server/composition.ts`), which is why it is its own unit rather than a folder
// inside `packages/db/src`.
//
// Skeleton: the identity tables, the adapter and the port arrive with story 1.4. Role,
// membership and revocation changes go through app use cases, never through here.
export {};
