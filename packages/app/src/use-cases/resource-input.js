/**
 * The inputs the Resource / Rate write use cases take (story 1.6).
 *
 * Internal to `use-cases/`: not re-exported from `use-cases/index.ts`.
 */
import { z } from 'zod';
const noNul = (value) => !value.includes('\0');
const NUL_MESSAGE = 'must not contain a NUL character';
const id = z.string().min(1).refine(noNul, NUL_MESSAGE);
/** A name or role a caller typed: trimmed, then refused when blank or NUL-bearing. */
const label = z.string().trim().min(1).refine(noNul, NUL_MESSAGE);
/** A calendar date as `YYYY-MM-DD`. */
const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .refine(noNul, NUL_MESSAGE);
/** Yen per hour: a non-negative integer (JPY). Negative is `invalid_input`. */
const yenPerHour = z.number().int().nonnegative();
export const createResourceInputSchema = z.object({
    departmentId: id,
    name: label,
    role: label,
});
export const appendResourceRateInputSchema = z.object({
    resourceId: id,
    effectiveFrom: isoDate,
    yenPerHour,
});
export const appendProjectDefaultRateInputSchema = z.object({
    projectId: id,
    effectiveFrom: isoDate,
    yenPerHour,
});
/** Story 5.8: link a Tracker Account to a Resource (or change the link). */
export const linkTrackerAccountInputSchema = z.object({
    projectId: id,
    trackerAccountId: id,
    resourceId: id,
});
/** Story 5.8: unlink a Tracker Account (append resource_id = null). */
export const unlinkTrackerAccountInputSchema = z.object({
    projectId: id,
    trackerAccountId: id,
});
