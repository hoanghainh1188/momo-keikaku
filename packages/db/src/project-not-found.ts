/**
 * The one rejection `packages/db` raises for a Project the Tenant cannot see — it does not
 * exist, or another Tenant owns it (one event under row-level security).
 *
 * `packages/app`'s `isProjectNotFound` recognises it by the prefix `project <id> not found`
 * and turns it into `not_found`; any other wording would surface as a 500. So every throw
 * site goes through this function, and the wording lives here once. Internal: deliberately
 * not re-exported from the package barrel.
 */
export function projectNotFound(projectId: string): Error {
  return new Error(`project ${projectId} not found — run \`pnpm seed\` to seed`);
}
