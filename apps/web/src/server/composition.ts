/**
 * `apps/web`'s COMPOSITION ROOT — the only file under `apps/web` permitted to import `@momo/db`,
 * `@momo/db-auth` or `@momo/adapters`. `.dependency-cruiser.cjs` (rules `apps-not-to-db`,
 * `web-db-auth-only-from-composition-root` and `apps-adapters-only-from-composition-root`) names
 * this exact path, and `pnpm depcruise` fails CI on any other `apps/*` file importing them.
 *
 * AD-1 says an inbound adapter may call use cases and nothing else. Something still has to
 * build the database handle, pick the role, and hand `packages/db`'s repository to
 * `packages/app`'s use cases as the ports they declare — and that something is this file,
 * named, so the rule allows exactly this path rather than a pattern. It is AD-1's second
 * carve-out beside `packages/db/auth` (ARCHITECTURE-SPINE.md, amended 2026-09-21).
 *
 * WHAT IT WIRES:
 *
 *   * The handle, on the restricted `momo_app` role — not the owner. `FORCE ROW LEVEL
 *     SECURITY` does nothing against a superuser (measured 2026-09-20), so a web app on the
 *     owner's credential would make every policy inert. `@momo/db` cannot read the
 *     configuration itself (the environment fence, and it may not import `@momo/app`), so
 *     the connection string is read here and passed in.
 *   * The ports. `packages/db`'s functions are handed over as they are and satisfy
 *     `packages/app`'s ports STRUCTURALLY; each `satisfies` below is where TypeScript checks it.
 *   * The outbound adapters (story 1.3 slice 2): the `Clock` (`systemClock`) and the UUIDv7 id
 *     port, both from `packages/adapters` (AD-1, amended for this edge: the composition root alone).
 *   * THE AUTH INSTANCE AND THE REQUEST CONTEXT (story 1.4 slice 1). One Better Auth instance per
 *     server bundle, built lazily on first use from the configuration (`@momo/db-auth`'s
 *     `createAuth`), and `requestContext()` — `resolveRequestContext` over the request's headers,
 *     at most once per render (React `cache()`), redirecting to `/sign-in` or `/no-access` when
 *     it resolves to nothing. Every use-case binding takes its context from there, or from the
 *     caller when a server action has already resolved one: there is no constant Tenant and no
 *     constant actor in this file any more, and `tests/web-composition.test.ts` pins that.
 *   * GOOGLE SIGN-IN (story 1.4 slice 3), when `AUTH_GOOGLE=on`: `googleProvider()` is passed to
 *     that instance, which then fetches the issuer's discovery document on first use. The
 *     middleware's session refresh gets an instance of its own built WITHOUT Google, so the
 *     middleware never waits on discovery (a hung fetch still blocks this instance: Epic 8). Whether the button shows is the instance's REGISTRATION
 *     (configured and discovered), never the configuration alone.
 *   * PASSWORD RESET (story 1.4 slice 4): `webMailer()` (console today; `ses` fails naming the
 *     missing adapter until Epic 8), `systemClock.now` and the identity-event writer over
 *     `webDb()` are ONE value fed into `baseAuthOptions()`, so both instances agree.
 *
 * WHAT IT EXPORTS: use-case bindings, the auth bindings (the route handler, the middleware's
 * session refresh, sign-in with a password or Google, sign-out) and the context resolution —
 * never the handle, an auth instance, a repository function or a Drizzle schema (AD-1). It wires;
 * it never queries.
 *
 * IMPORTING IT READS NO CONFIGURATION: `next build` evaluates route modules without a database or
 * a secret. Everything that reads `config` is built per call, or memoised on first use.
 */
import { cache } from 'react';
import { headers as nextHeaders } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  assignMemberProject as assignMemberProjectUseCase,
  changeMemberRole as changeMemberRoleUseCase,
  config,
  createDepartment as createDepartmentUseCase,
  createProgram as createProgramUseCase,
  createProject as createProjectUseCase,
  explainTickets as explainTicketsUseCase,
  googleProvider,
  getClientView as getClientViewUseCase,
  getProjectHeader as getProjectHeaderUseCase,
  getProjectMapping as getProjectMappingUseCase,
  getProjectReview as getProjectReviewUseCase,
  mapTicket as mapTicketUseCase,
  mapTickets as mapTicketsUseCase,
  markChangeRequestCandidates as markChangeRequestCandidatesUseCase,
  planTicketsAsWorkPackage as planTicketsAsWorkPackageUseCase,
  reassignProjectDepartment as reassignProjectDepartmentUseCase,
  reassignProjectProgram as reassignProjectProgramUseCase,
  renameDepartment as renameDepartmentUseCase,
  renameProgram as renameProgramUseCase,
  renameProject as renameProjectUseCase,
  resolveRequestContext,
  revokeMembership as revokeMembershipUseCase,
  unassignMemberProject as unassignMemberProjectUseCase,
  type AssignMemberProjectInput,
  type ChangeMemberRoleInput,
  type ChangeRequestCandidatesInput,
  type CreateDepartmentInput,
  type CreateProgramInput,
  type CreateProjectInput,
  type ExplainTicketsInput,
  type IdentityPort,
  type MailerPort,
  type MapTicketInput,
  type MapTicketsInput,
  type MembershipReader,
  type PlanTicketsInput,
  type ProjectInput,
  type ProjectReadDeps,
  type ReassignProjectDepartmentInput,
  type ReassignProjectProgramInput,
  type RenameDepartmentInput,
  type RenameProgramInput,
  type RenameProjectInput,
  type RequestContext,
  type RequestContextResolution,
  type ResolveRequestContextDeps,
  type RevokeMembershipInput,
  type UnassignMemberProjectInput,
  type WriteDeps,
} from '@momo/app';
import { mailerConsoleOn, systemClock, uuidV7IdsOn } from '@momo/adapters';
import {
  getDb,
  identityEventWriterOn,
  inTenantTransaction,
  loadProjectBundle,
  loadReview,
  membershipsOf,
  type Db,
} from '@momo/db';
import {
  createAuth,
  googleRegistered,
  googleSignIn as startGoogleSignIn,
  identityOn,
  requestPasswordReset as startPasswordResetRequest,
  resetPassword as consumePasswordReset,
  serveAllowlisted,
  sessionForMiddleware,
  signInWithPassword,
  signOutOf,
  type Auth,
  type MiddlewareSession,
} from '@momo/db-auth';

/** The handle, on the restricted application role. Pools are memoised inside `getDb`. */
function webDb(): Db {
  return getDb(config.APP_DATABASE_URL);
}

// --- identity: the auth instance and the request context (story 1.4 slice 1) ----------------

/**
 * The one id generator for the process. Module-scoped because it keeps UUIDv7's monotonic state
 * (ids minted in one Clock millisecond must still sort by creation), which a per-call generator
 * would reset. Building it reads no configuration, so importing this file still reads nothing.
 * The writes' new rows AND Better Auth's users and sessions take their ids from it.
 */
const webIds = uuidV7IdsOn(systemClock);

/**
 * The process's mailer (story 1.4 slice 4), built on FIRST USE and memoised like the auth
 * instances below — reading `config.MAILER` at import time would defeat the point of the
 * per-key, read-on-first-use config getters. `console` is the only transport that ships;
 * `ses` (Epic 8) fails naming the missing adapter rather than silently falling back — NOT at
 * boot, since this runs inside `baseAuthOptions()`, reached only when an auth instance is first
 * built. Because `sessionAuth()` shares that same value, the first request through the
 * middleware throws and every route, `/sign-in` included, answers 500 — loud, but only once a
 * request actually arrives, not before.
 */
let mailerInstance: MailerPort | undefined;
function webMailer(): MailerPort {
  if (mailerInstance) return mailerInstance;
  switch (config.MAILER) {
    case 'console':
      mailerInstance = mailerConsoleOn((line) => console.log(line)) satisfies MailerPort;
      break;
    case 'ses':
      throw new Error(
        'MAILER=ses is not implemented yet — mailer-ses lands in Epic 8, when the AWS account ' +
          'and sender domain exist to test it against. Set MAILER=console for local dev.',
      );
  }
  return mailerInstance;
}

/**
 * What every instance of this process is built from — everything but the Google provider. The
 * mailer, `now` and the identity-event writer (story 1.4 slice 4) are ONE value shared by both
 * instances (AD-1's no-drift rule), exactly as the id generator already is.
 */
function baseAuthOptions() {
  return {
    db: webDb(),
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    idleHours: config.SESSION_IDLE_TIMEOUT_HOURS,
    generateId: () => webIds.next(),
    mailer: webMailer(),
    now: systemClock.now,
    identityEvents: identityEventWriterOn(webDb()),
  };
}

/**
 * The Better Auth instance for pages, server actions and the route handler, built on FIRST USE —
 * never at import, because building it reads the secret, the base URL and the Google keys
 * (`googleProvider()` fails naming any missing one when `AUTH_GOOGLE=on`). The middleware and the
 * route handlers are separate bundles, so each has its own instances and its own pool (`getDb`
 * memoises one per connection string per bundle, at most 8 connections each).
 */
let authInstance: Auth | undefined;
function webAuth(): Auth {
  authInstance ??= createAuth({ ...baseAuthOptions(), google: googleProvider() });
  return authInstance;
}

/**
 * The middleware's instance: the same options WITHOUT Google. Registering Google fetches the
 * issuer's discovery document when the instance is first used — with no timeout — and the
 * middleware runs before every page and action request, so it must never be the one waiting.
 */
let sessionAuthInstance: Auth | undefined;
function sessionAuth(): Auth {
  sessionAuthInstance ??= createAuth(baseAuthOptions());
  return sessionAuthInstance;
}

/** The request's headers, as a plain `Headers` (Next hands a read-only wrapper). */
async function incomingHeaders(): Promise<Headers> {
  return new Headers(await nextHeaders());
}

/** What `resolveRequestContext` is given: the session store, the bridge's one reader, the log. */
function resolverDeps() {
  return {
    identity: identityOn(webAuth()) satisfies IdentityPort<Headers>,
    handle: webDb(),
    memberships: { membershipsOf } satisfies MembershipReader<Db>,
    onNoAccess: (event) => {
      // The reason is logged, never shown: the page says "no access" and nothing else.
      console.warn(
        `[auth] no access for user ${event.userId}: ${event.reason} ` +
          `(${event.memberships} memberships, no active Tenant, no tenant switcher yet)`,
      );
    },
  } satisfies ResolveRequestContextDeps<Headers, Db>;
}

/**
 * The request, resolved — AT MOST ONCE PER RENDER. React `cache()` scopes the memo to one server
 * request, so the root layout, the project layout and the page share one resolution (and one
 * trip to the session table and the bridge). Never redirects: see `requestContext()`.
 */
const resolveThisRequest = cache(
  async (): Promise<RequestContextResolution> =>
    resolveRequestContext(resolverDeps(), await incomingHeaders()),
);

/**
 * THE REQUEST CONTEXT every binding runs its use case with — or a redirect: `/sign-in` when the
 * request is signed out (no session, an expired one, or an active Tenant with no matching
 * membership — that session is deleted), `/no-access` when it is signed in with no Tenant to act
 * in. A server action calls this ONCE and passes the result to every binding it calls. The root
 * layout and `/no-access` never call it: they read `signInState()`, which does not redirect.
 */
export async function requestContext(): Promise<RequestContext> {
  const resolved = await resolveThisRequest();
  switch (resolved.status) {
    case 'signed_in':
      return resolved.context;
    case 'no_access':
      return redirect('/no-access');
    case 'signed_out':
      return redirect('/sign-in');
    default: {
      const unhandled: never = resolved;
      throw new Error(`unhandled resolution: ${String(unhandled)}`);
    }
  }
}

/** Whether the request is signed in at all — for the root layout's sign-out control. */
export async function signInState(): Promise<'signed_in' | 'no_access' | 'signed_out'> {
  return (await resolveThisRequest()).status;
}

// --- the auth bindings: the route handler, the middleware, sign-in, sign-out -----------------

let authRoute: ((request: Request) => Promise<Response>) | undefined;

/**
 * `/api/auth/*`: Better Auth for exactly the endpoints in use (`/get-session`, `/sign-out`,
 * `/sign-in/email`, and `GET /callback/google` while Google is registered), 404 for everything
 * else — parametrised routes included.
 */
export function handleAuthRequest(request: Request): Promise<Response> {
  authRoute ??= serveAllowlisted(webAuth());
  return authRoute(request);
}

/**
 * The middleware's session check, which also SLIDES the session (Better Auth refreshes it when
 * it is more than `updateAge` old) and hands back the `Set-Cookie` to forward. Not the
 * authority: `requestContext()` is, on every render. On the Google-less instance (see
 * `sessionAuth`): it never fetches discovery.
 */
export function refreshSession(headers: Headers): Promise<MiddlewareSession> {
  return sessionForMiddleware(sessionAuth(), headers);
}

/**
 * Whether the sign-in page offers "Sign in with Google": the provider is REGISTERED — configured
 * and discovered. With `AUTH_GOOGLE=off`, or discovery failed, it is not.
 */
export async function googleEnabled(): Promise<boolean> {
  return googleRegistered(webAuth());
}

/**
 * Starts a Google sign-in: the provider's authorization URL to redirect to, or `null` when Google
 * is not registered or Better Auth refused. The state cookie reaches the browser through
 * `nextCookies()`, so the `Set-Cookie`s the call also returns are not needed here.
 */
export async function googleSignIn(): Promise<string | null> {
  const started = await startGoogleSignIn(webAuth(), await incomingHeaders());
  return started?.url ?? null;
}

/** Email + password sign-in; `false` for every refusal, told apart by nothing. */
export async function signInWithEmail(credentials: {
  readonly email: string;
  readonly password: string;
}): Promise<boolean> {
  return signInWithPassword(webAuth(), await incomingHeaders(), credentials);
}

/** Ends the request's session and clears its cookie. */
export async function signOut(): Promise<void> {
  await signOutOf(webAuth(), await incomingHeaders());
}

/**
 * Requests a password reset (story 1.4 slice 4). The caller shows the same generic sentence
 * whatever happens on the other side of this call — an unknown email, a Google-only user, a mail
 * that failed to send, or a mail actually sent all look the same from here, by design (NFR-S5).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await startPasswordResetRequest(webAuth(), await incomingHeaders(), email);
}

/**
 * Consumes a reset token and sets a new password. `false` for every refusal — a reused or
 * expired token, a password Better Auth's `minPasswordLength` refuses — told apart by nothing.
 */
export async function resetPassword(input: { readonly token: string; readonly password: string }): Promise<boolean> {
  return consumePasswordReset(webAuth(), await incomingHeaders(), input);
}

/**
 * The project read port, wired. Built per call rather than at module load, so importing this
 * file reads no configuration — `next build` evaluates route modules without a database.
 */
function projectReadDeps() {
  return {
    handle: webDb(),
    projectRead: { loadProjectBundle, loadReview },
  } satisfies ProjectReadDeps<Db>;
}

/** The Project bundle, for the project frame. See `packages/app`'s `getProjectHeader`. */
export async function getProjectHeader(input: ProjectInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return getProjectHeaderUseCase(projectReadDeps(), context, input);
}

/** The bundle and its Review, for every project page. See `packages/app`'s `getProjectReview`. */
export async function getProjectReview(input: ProjectInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return getProjectReviewUseCase(projectReadDeps(), context, input);
}

/** The Mapping surface, joined and ordered. See `packages/app`'s `getProjectMapping`. */
export async function getProjectMapping(input: ProjectInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return getProjectMappingUseCase(projectReadDeps(), context, input);
}

/** The client projection, default visibility. See `packages/app`'s `getClientView`. */
export async function getClientView(input: ProjectInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return getClientViewUseCase(projectReadDeps(), context, input);
}


/**
 * The write deps, wired: the one tenant transaction every write use case runs its change and its
 * audit record in (AD-14), the Clock and the id port. One value for every write — it satisfies
 * the project writes' deps and the organisation writes' alike. Built per call, for the same
 * reason as the read port (the id generator inside it is the process's one, above).
 */
function writeDeps() {
  return {
    handle: webDb(),
    clock: systemClock,
    ids: webIds,
    transaction: inTenantTransaction,
  } satisfies WriteDeps<Db>;
}

/** FR-29 *Map*. See `packages/app`'s `mapTickets`. */
export async function mapTickets(input: MapTicketsInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return mapTicketsUseCase(writeDeps(), context, input);
}

/** FR-29 *Plan*. See `packages/app`'s `planTicketsAsWorkPackage`. */
export async function planTicketsAsWorkPackage(input: PlanTicketsInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return planTicketsAsWorkPackageUseCase(writeDeps(), context, input);
}

/** FR-29 *Explain*. See `packages/app`'s `explainTickets`. */
export async function explainTickets(input: ExplainTicketsInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return explainTicketsUseCase(writeDeps(), context, input);
}

/** FR-29 *Change Request candidate*. See `packages/app`'s `markChangeRequestCandidates`. */
export async function markChangeRequestCandidates(input: ChangeRequestCandidatesInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return markChangeRequestCandidatesUseCase(writeDeps(), context, input);
}

/** FR-21 manual Mapping of one Ticket. See `packages/app`'s `mapTicket`. */
export async function mapTicket(input: MapTicketInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return mapTicketUseCase(writeDeps(), context, input);
}

// --- FR-1's organisation writes (story 1.3 slice 2). No page calls them yet: the Organisation
// admin surface waits for sign-in and roles (1.4/1.5). Wired now so the bindings, the Clock and the
// id port are pinned by `tests/web-composition.test.ts` before a page can reach them.

/** FR-1: a new Department. See `packages/app`'s `createDepartment`. */
export async function createDepartment(input: CreateDepartmentInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return createDepartmentUseCase(writeDeps(), context, input);
}

/** FR-1: renames a Department. See `packages/app`'s `renameDepartment`. */
export async function renameDepartment(input: RenameDepartmentInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return renameDepartmentUseCase(writeDeps(), context, input);
}

/** FR-1: a new Program in a Department. See `packages/app`'s `createProgram`. */
export async function createProgram(input: CreateProgramInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return createProgramUseCase(writeDeps(), context, input);
}

/** FR-1: renames a Program. See `packages/app`'s `renameProgram`. */
export async function renameProgram(input: RenameProgramInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return renameProgramUseCase(writeDeps(), context, input);
}

/** FR-1: a new Project. See `packages/app`'s `createProject`. */
export async function createProject(input: CreateProjectInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return createProjectUseCase(writeDeps(), context, input);
}

/** FR-1: renames a Project. See `packages/app`'s `renameProject`. */
export async function renameProject(input: RenameProjectInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return renameProjectUseCase(writeDeps(), context, input);
}

/** FR-1: moves a Project between its Department's Programs. See `reassignProjectProgram`. */
export async function reassignProjectProgram(input: ReassignProjectProgramInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return reassignProjectProgramUseCase(writeDeps(), context, input);
}

/** FR-1: moves a Project to another Department. See `reassignProjectDepartment`. */
export async function reassignProjectDepartment(input: ReassignProjectDepartmentInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return reassignProjectDepartmentUseCase(writeDeps(), context, input);
}

// --- Membership changes (story 1.4 slice 2). No page calls them yet — there is no Users screen in
// this slice. Wired now so a future server action reaches them with the context it resolved once,
// and so `tests/web-composition.test.ts` pins each binding to its own use case. Each requires
// `tenant_admin` in the context and re-checks it against the bridge inside its transaction.

/** FR-3: revokes a membership; the member's next request is signed out. See `revokeMembership`. */
export async function revokeMembership(input: RevokeMembershipInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return revokeMembershipUseCase(writeDeps(), context, input);
}

/** Changes a member's role (Tenant Admin or PM). See `packages/app`'s `changeMemberRole`. */
export async function changeMemberRole(input: ChangeMemberRoleInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return changeMemberRoleUseCase(writeDeps(), context, input);
}

/** FR-1 PM assignment: a Project added to a member's Projects. See `assignMemberProject`. */
export async function assignMemberProject(input: AssignMemberProjectInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return assignMemberProjectUseCase(writeDeps(), context, input);
}

/** FR-1 PM assignment: a Project removed from a member's Projects. See `unassignMemberProject`. */
export async function unassignMemberProject(input: UnassignMemberProjectInput, ctx?: RequestContext) {
  const context = ctx ?? (await requestContext());
  return unassignMemberProjectUseCase(writeDeps(), context, input);
}
