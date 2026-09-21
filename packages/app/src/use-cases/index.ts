// THE READ SURFACE. Every export of this module is a use case, and the cross-tenant harness
// (`tests/cross-tenant.test.ts`) reads this module's namespace to decide what it must drive:
// an export here with no entry in `tests/read-use-cases.ts` fails the build, naming it, with
// no database running. So export use cases from here and nothing else — a helper, a schema or
// a constant belongs in its own module.
//
// Deliberately free of `../config`: a pure use-case test, or the harness, imports this module
// without needing a single environment variable.
export { getProjectHeader } from './get-project-header';
export { getProjectReview } from './get-project-review';
