/**
 * A SMALL FAKE OIDC PROVIDER (story 1.4 slice 3, founder decision 2026-09-21) — what Google sign-in
 * talks to in tests and in local dev. Node `http` plus `jose`: discovery, JWKS, authorize and token,
 * and a userinfo endpoint that exists only so a test can assert nobody called it.
 *
 * Tests start it in-process on a random port and SCRIPT the identity it hands back — the email,
 * the `email_verified` claim (any JSON value, so `"false"` is expressible), the `sub` — and the
 * ways it misbehaves: an IdP error, no id token, a token signed with a key its JWKS does not
 * publish, a wrong `aud`, no `nonce`, an expired token, a refused token request, and a discovery
 * document without `jwks_uri` (or an error status instead of one). `pnpm fake-oidc`
 * (`scripts/fake-oidc.ts`) runs it on a fixed port with a one-field "sign in as" page.
 *
 * What it checks, like a real provider would: the authorize request's `client_id`,
 * `redirect_uri`, `response_type=code`, an S256 `code_challenge` and a `state` (echoed back with
 * `iss`); the token request's client secret (post or basic), the one-time code, its
 * `redirect_uri`, and the PKCE verifier against the challenge. The id token carries the
 * authorize request's `nonce`.
 *
 * TEST INFRASTRUCTURE ONLY: never imported by `packages/*` or `apps/*` (`.dependency-cruiser.cjs`,
 * rule `no-test-support-in-source`). Inside the lint fence: no environment, no wall clock — every
 * time comes from the `clock` argument (tests pass `systemClock`, because Better Auth checks `exp`
 * and the state's expiry against real time) — and every JSON body through the `@momo/domain` codec.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { stringify } from '@momo/domain';
import type { Clock } from '../../packages/adapters/src/clock';

/** The identity the next sign-in hands back. `emailVerified` is the claim's raw JSON value. */
export interface FakeIdentity {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean | string | null;
  readonly name?: string;
}

/** How the next sign-in behaves. Everything but `identity` defaults to "like a real provider". */
export interface FakeScript {
  readonly identity: FakeIdentity;
  /** The authorize step redirects back with `error=<this>` (and the state) instead of a code. */
  readonly idpError?: string;
  /** The token response carries no `id_token`. */
  readonly omitIdToken?: boolean;
  /** The id token is signed with a key the JWKS does not publish (same `kid`). */
  readonly foreignKey?: boolean;
  /** The id token's `aud`, instead of the client id. */
  readonly audience?: string;
  /** The id token carries no `nonce`. */
  readonly dropNonce?: boolean;
  /** Seconds until the id token's `exp`, from the clock (default 600; negative is expired). */
  readonly expiresInSeconds?: number;
  /** The token endpoint refuses the code exchange (`invalid_grant`), whatever it is sent. */
  readonly rejectToken?: boolean;
}

/** `ok`; a document without `jwks_uri`; or a 500 instead of a document. */
export type DiscoveryMode = 'ok' | 'no_jwks_uri' | 'error';

export interface FakeOidcOptions {
  /** 0 (the default) for a random free port. */
  readonly port?: number;
  readonly clock: Clock;
  readonly clientId: string;
  readonly clientSecret: string;
  /** The one redirect URI the client registered, e.g. `http://localhost:3101/api/auth/callback/google`. */
  readonly redirectUri: string;
  readonly discovery?: DiscoveryMode;
  /** The first script; tests replace it with `script(...)` before each sign-in. */
  readonly script?: FakeScript;
  /** Local dev: `GET /authorize` shows a "sign in as" page instead of answering the script. */
  readonly interactive?: boolean;
}

/** How often each endpoint was asked, since the fake started. */
export interface FakeHits {
  readonly discovery: number;
  readonly jwks: number;
  readonly authorize: number;
  readonly token: number;
  readonly userinfo: number;
}

export interface FakeOidc {
  /** `http://127.0.0.1:<port>` — no trailing slash; what discovery names as `issuer`. */
  readonly issuer: string;
  script(next: FakeScript): void;
  setDiscovery(mode: DiscoveryMode): void;
  hits(): FakeHits;
  close(): Promise<void>;
}

const KID = 'fake-oidc-key-1';
const DEFAULT_IDENTITY: FakeIdentity = { sub: 'fake-sub-0', email: 'nobody@fake-oidc.example', emailVerified: true };

/** What an issued code remembers until the token request spends it. */
interface IssuedCode {
  readonly redirectUri: string;
  readonly challenge: string;
  readonly nonce: string | null;
  readonly script: FakeScript;
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  response.end(stringify(body));
}

function redirect(response: ServerResponse, location: URL): void {
  response.writeHead(302, { location: location.toString(), 'cache-control': 'no-store' });
  response.end();
}

async function formOf(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** The client credentials of a token request: HTTP Basic, or `client_id`/`client_secret` in the body. */
function clientOf(request: IncomingMessage, form: URLSearchParams): { id: string | null; secret: string | null } {
  const header = request.headers.authorization;
  if (header?.startsWith('Basic ')) {
    const [id, secret] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    return { id: decodeURIComponent(id ?? ''), secret: decodeURIComponent(secret ?? '') };
  }
  return { id: form.get('client_id'), secret: form.get('client_secret') };
}

/** The "sign in as" page (local dev): one email field, every authorize parameter carried hidden. */
function signInAsPage(params: URLSearchParams): string {
  const hidden = [...params.entries()]
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake OIDC · sign in as</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px system-ui,sans-serif;margin:18vh auto;max-width:340px;padding:0 16px;color:#17181b}
h1{font-size:18px}label{display:grid;gap:4px;font-size:12px;color:#5a5d63}
input[type=email]{font:inherit;height:32px;padding:0 8px;border:1px solid #c6c6cb}
button{margin-top:12px;height:32px;padding:0 14px;background:#1f3a5f;color:#fff;border:0;font:inherit}
p{color:#5a5d63;font-size:12px}</style></head><body>
<h1>Fake OIDC provider</h1><p>Local development only. The email is returned as verified.</p>
<form method="post" action="/authorize">${hidden}
<label>Sign in as<input type="email" name="email" required autofocus></label>
<button type="submit">Continue</button></form></body></html>`;
}

/**
 * Starts the fake. Resolves once it is listening; `close()` stops it (a test that needs
 * "discovery down" closes it before building the auth instance).
 */
export async function startFakeOidc(options: FakeOidcOptions): Promise<FakeOidc> {
  const signing = await generateKeyPair('RS256', { extractable: true });
  const foreign = await generateKeyPair('RS256', { extractable: true });
  const publicJwk: JWK = { ...(await exportJWK(signing.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };

  let script: FakeScript = options.script ?? { identity: DEFAULT_IDENTITY };
  let discovery: DiscoveryMode = options.discovery ?? 'ok';
  const hits = { discovery: 0, jwks: 0, authorize: 0, token: 0, userinfo: 0 };
  const codes = new Map<string, IssuedCode>();
  let issuer = '';

  async function idTokenOf(issued: IssuedCode): Promise<string> {
    const { identity } = issued.script;
    const now = Math.floor(options.clock.nowMs() / 1000);
    const claims: Record<string, unknown> = {
      iss: issuer,
      sub: identity.sub,
      aud: issued.script.audience ?? options.clientId,
      iat: now,
      exp: now + (issued.script.expiresInSeconds ?? 600),
      email: identity.email,
      email_verified: identity.emailVerified,
      name: identity.name ?? identity.email,
    };
    if (issued.nonce !== null && !issued.script.dropNonce) claims.nonce = issued.nonce;
    const key: CryptoKey = issued.script.foreignKey ? foreign.privateKey : signing.privateKey;
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' }).sign(key);
  }

  function discoveryDocument(): Record<string, unknown> {
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      ...(discovery === 'no_jwks_uri' ? {} : { jwks_uri: `${issuer}/jwks` }),
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      scopes_supported: ['openid', 'email', 'profile'],
    };
  }

  /** Checks an authorize request; answers what is wrong with it, or `null`. */
  function authorizeProblem(params: URLSearchParams): string | null {
    if (params.get('response_type') !== 'code') return 'response_type must be code';
    if (params.get('client_id') !== options.clientId) return 'unknown client_id';
    if (params.get('redirect_uri') !== options.redirectUri) return 'redirect_uri not registered';
    if (params.get('code_challenge_method') !== 'S256' || !params.get('code_challenge')) return 'S256 PKCE required';
    if (!params.get('state')) return 'state required';
    return null;
  }

  /** Completes an authorize request: a code (or the scripted IdP error), back to the client. */
  function completeAuthorize(response: ServerResponse, params: URLSearchParams, answering: FakeScript): void {
    const back = new URL(options.redirectUri);
    back.searchParams.set('state', params.get('state')!);
    back.searchParams.set('iss', issuer);
    if (answering.idpError) {
      back.searchParams.set('error', answering.idpError);
      return redirect(response, back);
    }
    const code = randomBytes(24).toString('base64url');
    codes.set(code, {
      redirectUri: params.get('redirect_uri')!,
      challenge: params.get('code_challenge')!,
      nonce: params.get('nonce'),
      script: answering,
    });
    back.searchParams.set('code', code);
    redirect(response, back);
  }

  async function authorize(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    hits.authorize += 1;
    const submitted = request.method === 'POST' ? await formOf(request) : null;
    const email = submitted?.get('email')?.trim() ?? '';
    const params = new URLSearchParams([...(submitted ?? url.searchParams).entries()].filter(([name]) => name !== 'email'));
    const problem = authorizeProblem(params);
    if (problem !== null) return send(response, 400, { error: 'invalid_request', error_description: problem });
    if (options.interactive && email === '') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return void response.end(signInAsPage(params));
    }
    // The "sign in as" page answers for the email typed in, verified; a test answers its script.
    // GATED ON `interactive`: without it, any POST carrying an email silently replaced the script
    // with a verified identity, so a scripted `idpError`, `foreignKey`, `audience`, `dropNonce` or
    // expiry would be ignored and the test would pass for the wrong reason.
    const answering: FakeScript =
      options.interactive && email !== ''
        ? { identity: { sub: `fake-sub:${email.toLowerCase()}`, email, emailVerified: true } }
        : script;
    completeAuthorize(response, params, answering);
  }

  async function token(request: IncomingMessage, response: ServerResponse): Promise<void> {
    hits.token += 1;
    const form = await formOf(request);
    const client = clientOf(request, form);
    if (client.id !== options.clientId || client.secret !== options.clientSecret) {
      return send(response, 401, { error: 'invalid_client' });
    }
    const code = form.get('code') ?? '';
    const issued = codes.get(code);
    codes.delete(code); // one-time, spent or not
    if (form.get('grant_type') !== 'authorization_code' || issued === undefined || issued.script.rejectToken) {
      return send(response, 400, { error: 'invalid_grant' });
    }
    if (form.get('redirect_uri') !== issued.redirectUri || s256(form.get('code_verifier') ?? '') !== issued.challenge) {
      return send(response, 400, { error: 'invalid_grant', error_description: 'redirect_uri or code_verifier mismatch' });
    }
    const body: Record<string, unknown> = {
      access_token: randomBytes(24).toString('base64url'),
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
    };
    if (!issued.script.omitIdToken) body.id_token = await idTokenOf(issued);
    send(response, 200, body);
  }

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', issuer);
    const endpoint = `${request.method ?? 'GET'} ${url.pathname}`;
    switch (endpoint) {
      case 'GET /.well-known/openid-configuration':
        hits.discovery += 1;
        if (discovery === 'error') return send(response, 500, { error: 'discovery unavailable' });
        return send(response, 200, discoveryDocument());
      case 'GET /jwks':
        hits.jwks += 1;
        return send(response, 200, { keys: [publicJwk] });
      case 'GET /authorize':
      case 'POST /authorize':
        return authorize(request, response, url);
      case 'POST /token':
        return token(request, response);
      case 'GET /userinfo':
        hits.userinfo += 1;
        return send(response, 200, { sub: script.identity.sub, email: script.identity.email, email_verified: true });
      default:
        return send(response, 404, { error: 'not_found' });
    }
  }

  const server = createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      if (!response.headersSent) send(response, 500, { error: 'fake_oidc_failure', error_description: String(error) });
      else response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    issuer,
    script: (next) => {
      script = next;
    },
    setDiscovery: (mode) => {
      discovery = mode;
    },
    hits: () => ({ ...hits }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
