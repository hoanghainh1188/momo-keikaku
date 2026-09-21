import { notFound } from 'next/navigation';
import type { Result } from '@momo/app';

/**
 * A use case's value, or Next's 404 for its error arm.
 *
 * Both codes a project read can return render the same page, and deliberately: `not_found`
 * already answers a Project that is another Tenant's exactly as one that does not exist, and
 * an `invalid_input` projectId — an empty route segment — is a URL naming no Project either.
 * The switch is exhaustive, so a code added to `packages/app`'s closed enum is a compile error
 * here until somebody decides what it renders.
 */
export function valueOrNotFound<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  switch (code) {
    case 'not_found':
    case 'invalid_input':
      return notFound();
    default: {
      const unhandled: never = code;
      throw new Error(`unhandled use-case error code: ${String(unhandled)}`);
    }
  }
}
