/**
 * The inputs the membership write use cases take (story 1.4 slice 2).
 *
 * Internal to `use-cases/`, like `org-input.ts`: not re-exported from `use-cases/index.ts`, whose
 * exports ARE the enumerated surface.
 */
import { z } from 'zod';

const noNul = (value: string) => !value.includes('\0');
const NUL_MESSAGE = 'must not contain a NUL character';

/**
 * A user or Project id the caller names. Not required to be a UUID (the probe and demo rows keep
 * readable ids); NUL is refused because Postgres refuses it in a text parameter, which would
 * otherwise be a 500 instead of `invalid_input`.
 */
const id = z.string().min(1).refine(noNul, NUL_MESSAGE);

/**
 * The roles a membership may be GIVEN in this release: Tenant Admin and PM. `client_viewer` and
 * `internal_viewer` exist in the enum (`authz/request-context.ts`) but are not assignable, so they
 * answer `invalid_input` like any other string.
 */
export const ASSIGNABLE_ROLES = ['tenant_admin', 'pm'] as const;

export const revokeMembershipInputSchema = z.object({ userId: id });

export const changeMemberRoleInputSchema = z.object({ userId: id, role: z.enum(ASSIGNABLE_ROLES) });

export const assignMemberProjectInputSchema = z.object({ userId: id, projectId: id });

export const unassignMemberProjectInputSchema = z.object({ userId: id, projectId: id });

export type RevokeMembershipInput = Readonly<z.input<typeof revokeMembershipInputSchema>>;
export type ChangeMemberRoleInput = Readonly<z.input<typeof changeMemberRoleInputSchema>>;
export type AssignMemberProjectInput = Readonly<z.input<typeof assignMemberProjectInputSchema>>;
export type UnassignMemberProjectInput = Readonly<z.input<typeof unassignMemberProjectInputSchema>>;
