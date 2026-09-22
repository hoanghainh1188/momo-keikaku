import { handleAuthRequest } from '@/server/composition';

/**
 * `/api/auth/*` — Better Auth's HTTP surface, through the composition root's allowlist (story 1.4
 * slice 1): `GET /get-session`, `POST /sign-out` and `POST /sign-in/email` reach Better Auth
 * always, plus `GET /callback/google` while this instance has Google REGISTERED (configured and
 * discovered — `servedEndpoints` in `@momo/db-auth`'s `bindings.ts`). Every other path and method
 * answers 404, parametrised routes included: `/reset-password/:token` in particular is never
 * served, which is why both reset flows are server actions.
 */
export const dynamic = 'force-dynamic';

const handler = (request: Request): Promise<Response> => handleAuthRequest(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
