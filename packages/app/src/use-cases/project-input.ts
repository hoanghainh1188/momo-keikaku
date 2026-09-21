/**
 * The input both project read use cases take, and the one path that runs them.
 *
 * Internal to `use-cases/`: it is deliberately not re-exported from `use-cases/index.ts`,
 * whose exports ARE the read surface the cross-tenant harness enumerates. A helper exported
 * there would be reported as a read use case with no registry entry — correctly.
 */
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import { isProjectNotFound } from '../ports/project-read';
import type { UseCaseContext } from './context';

/**
 * Every inbound boundary is validated by zod (ARCHITECTURE-SPINE.md).
 *
 * NUL is refused here because Postgres refuses it in a text parameter ("null character not
 * permitted") — an id arriving as `/p/%00/review` would otherwise reach the query and turn
 * into a 500 rather than `invalid_input`.
 */
const projectInputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .refine((value) => !value.includes('\0'), 'must not contain a NUL character'),
});

/** Derived from the schema, so the type and the validation cannot drift apart. */
export type ProjectInput = Readonly<z.infer<typeof projectInputSchema>>;

/**
 * Validates the input, runs `load` for the caller's Tenant, and maps an invisible Project to
 * `not_found`.
 *
 * NOTHING ELSE IS CAUGHT. A use case that swallowed the adapter's failure and returned a
 * default would look, to every caller, like a Project with no data — which is the shape of
 * isolation working, and exactly what the harness's completeness assertions exist to tell
 * apart from it.
 */
export async function runProjectRead<T>(
  ctx: UseCaseContext,
  input: ProjectInput,
  load: (tenantId: string, projectId: string) => Promise<T>,
): Promise<Result<T>> {
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.reduce<Readonly<Record<string, readonly string[]>>>(
      (acc, issue) => {
        const field = issue.path.join('.') || '(input)';
        return { ...acc, [field]: [...(acc[field] ?? []), issue.code] };
      },
      {},
    );
    return fail('invalid_input', details);
  }

  const { projectId } = parsed.data;
  try {
    return ok(await load(ctx.tenantId, projectId));
  } catch (error) {
    if (isProjectNotFound(error, projectId)) return fail('not_found');
    throw error;
  }
}
