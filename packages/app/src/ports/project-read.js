/**
 * How an adapter reports a Project the Tenant cannot see: it REJECTS, with an `Error` whose
 * message begins `project <projectId> not found`.
 *
 * That is `packages/db`'s existing behaviour (`repo.ts`, the first statement of the bundle
 * read), and this slice may not change `packages/db`'s public behaviour, so the contract is
 * written down here rather than re-engineered there. Row-level security makes "does not
 * exist" and "belongs to another Tenant" the same event — the row is simply invisible — so
 * this one recognition covers both, which is exactly the `not_found` rule.
 *
 * Matched on the caller's OWN projectId, so an unrelated failure that happens to say
 * "not found" is not mistaken for it. Anything else the adapter throws is not recognised and
 * propagates: a connection failure is not a missing Project, and answering `not_found` for it
 * would turn an outage into a page that says the Project does not exist.
 *
 * If the adapter's wording ever changes, the cross-tenant harness fails naming the use case,
 * because a foreign Project id then throws instead of answering `not_found`.
 */
export function isProjectNotFound(error, projectId) {
    return error instanceof Error && error.message.startsWith(`project ${projectId} not found`);
}
