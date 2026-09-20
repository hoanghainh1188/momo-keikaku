// `packages/db/auth` is the single sanctioned Better Auth <-> Drizzle binding, exposed
// to the rest of the system as an identity port. It is the one carve-out in the import
// rules, which is why it is its own unit rather than a folder inside `packages/db/src`.
//
// Skeleton: the identity tables, the adapter and the port arrive with story 1.4. Role,
// membership and revocation changes go through app use cases, never through here.
export {};
