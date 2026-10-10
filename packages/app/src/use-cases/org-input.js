/**
 * The inputs the organisation write use cases take (story 1.3 slice 2).
 *
 * Internal to `use-cases/`, like `project-write-input.ts`: not re-exported from
 * `use-cases/index.ts`, whose exports ARE the enumerated surface.
 */
import { z } from 'zod';
const noNul = (value) => !value.includes('\0');
const NUL_MESSAGE = 'must not contain a NUL character';
/**
 * An id the caller names. Not required to be a UUID: the demo's rows keep readable ids
 * (`dep-delivery`), and new rows take UUIDv7 ids from the id port. NUL is refused because
 * Postgres refuses it in a text parameter, which would otherwise be a 500 instead of
 * `invalid_input`.
 */
const id = z.string().min(1).refine(noNul, NUL_MESSAGE);
/**
 * A name a Tenant Admin typed: trimmed, then refused when blank or NUL-bearing. The TRIMMED value
 * is what is stored and what the audit payload records. No uniqueness rule — the slice's Never
 * list keeps it out. No length bound either, but by this slice's own decision, not the Never list.
 */
const name = z.string().trim().min(1).refine(noNul, NUL_MESSAGE);
/** `ProjectConfig.contractType` — the domain's two contract forms. */
const contractType = z.enum(['請負', '準委任']);
export const createDepartmentInputSchema = z.object({ name });
export const renameDepartmentInputSchema = z.object({ departmentId: id, name });
export const createProgramInputSchema = z.object({ departmentId: id, name });
export const renameProgramInputSchema = z.object({ programId: id, name });
export const createProjectInputSchema = z.object({
    name,
    departmentId: id,
    /** Optional: absent or `null` is a Project in no Program. */
    programId: id.nullable().default(null),
    clientName: name,
    contractType,
});
export const renameProjectInputSchema = z.object({ projectId: id, name });
/** `programId: null` clears the Program. The key is required, so "clear" is never implicit. */
export const reassignProjectProgramInputSchema = z.object({
    projectId: id,
    programId: id.nullable(),
});
/**
 * The owning Department and the Program the Project carries AFTER the move, in one command: the
 * Program must be cleared (`null`) or one of the new Department's. The key is required, so a
 * caller cannot move a Project and silently keep a Program that now belongs elsewhere.
 */
export const reassignProjectDepartmentInputSchema = z.object({
    projectId: id,
    departmentId: id,
    programId: id.nullable(),
});
