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
 * rule `no-test-or-tooling-in-source`). Inside the lint fence: no environment, no wall clock — every
 * time comes from the `clock` argument (tests pass `systemClock`, because Better Auth checks `exp`
 * and the state's expiry against real time) — and every JSON body through the `@momo/domain` codec.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { stringify } from '@momo/domain';
const KID = 'fake-oidc-key-1';
const DEFAULT_IDENTITY = { sub: 'fake-sub-0', email: 'nobody@fake-oidc.example', emailVerified: true };
function send(response, status, body, headers = {}) {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    response.end(stringify(body));
}
function redirect(response, location) {
    response.writeHead(302, { location: location.toString(), 'cache-control': 'no-store' });
    response.end();
}
async function formOf(request) {
    const chunks = [];
    for await (const chunk of request)
        chunks.push(chunk);
    return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
function s256(verifier) {
    return createHash('sha256').update(verifier).digest('base64url');
}
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
/** The client credentials of a token request: HTTP Basic, or `client_id`/`client_secret` in the body. */
function clientOf(request, form) {
    const header = request.headers.authorization;
    if (header?.startsWith('Basic ')) {
        const [id, secret] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
        return { id: decodeURIComponent(id ?? ''), secret: decodeURIComponent(secret ?? '') };
    }
    return { id: form.get('client_id'), secret: form.get('client_secret') };
}
/** The "sign in as" page (local dev): one email field, every authorize parameter carried hidden. */
function signInAsPage(params) {
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
export async function startFakeOidc(options) {
    const signing = await generateKeyPair('RS256', { extractable: true });
    const foreign = await generateKeyPair('RS256', { extractable: true });
    const publicJwk = { ...(await exportJWK(signing.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
    let script = options.script ?? { identity: DEFAULT_IDENTITY };
    let discovery = options.discovery ?? 'ok';
    const hits = { discovery: 0, jwks: 0, authorize: 0, token: 0, userinfo: 0 };
    const codes = new Map();
    let issuer = '';
    async function idTokenOf(issued) {
        const { identity } = issued.script;
        const now = Math.floor(options.clock.nowMs() / 1000);
        const claims = {
            iss: issuer,
            sub: identity.sub,
            aud: issued.script.audience ?? options.clientId,
            iat: now,
            exp: now + (issued.script.expiresInSeconds ?? 600),
            email: identity.email,
            email_verified: identity.emailVerified,
            name: identity.name ?? identity.email,
        };
        if (issued.nonce !== null && !issued.script.dropNonce)
            claims.nonce = issued.nonce;
        const key = issued.script.foreignKey ? foreign.privateKey : signing.privateKey;
        return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' }).sign(key);
    }
    function discoveryDocument() {
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
    function authorizeProblem(params) {
        if (params.get('response_type') !== 'code')
            return 'response_type must be code';
        if (params.get('client_id') !== options.clientId)
            return 'unknown client_id';
        if (params.get('redirect_uri') !== options.redirectUri)
            return 'redirect_uri not registered';
        if (params.get('code_challenge_method') !== 'S256' || !params.get('code_challenge'))
            return 'S256 PKCE required';
        if (!params.get('state'))
            return 'state required';
        return null;
    }
    /** Completes an authorize request: a code (or the scripted IdP error), back to the client. */
    function completeAuthorize(response, params, answering) {
        const back = new URL(options.redirectUri);
        back.searchParams.set('state', params.get('state'));
        back.searchParams.set('iss', issuer);
        if (answering.idpError) {
            back.searchParams.set('error', answering.idpError);
            return redirect(response, back);
        }
        const code = randomBytes(24).toString('base64url');
        codes.set(code, {
            redirectUri: params.get('redirect_uri'),
            challenge: params.get('code_challenge'),
            nonce: params.get('nonce'),
            script: answering,
        });
        back.searchParams.set('code', code);
        redirect(response, back);
    }
    async function authorize(request, response, url) {
        hits.authorize += 1;
        const submitted = request.method === 'POST' ? await formOf(request) : null;
        const email = submitted?.get('email')?.trim() ?? '';
        const params = new URLSearchParams([...(submitted ?? url.searchParams).entries()].filter(([name]) => name !== 'email'));
        const problem = authorizeProblem(params);
        if (problem !== null)
            return send(response, 400, { error: 'invalid_request', error_description: problem });
        if (options.interactive && email === '') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
            return void response.end(signInAsPage(params));
        }
        // The "sign in as" page answers for the email typed in, verified; a test answers its script.
        // GATED ON `interactive`: without it, any POST carrying an email silently replaced the script
        // with a verified identity, so a scripted `idpError`, `foreignKey`, `audience`, `dropNonce` or
        // expiry would be ignored and the test would pass for the wrong reason.
        const answering = options.interactive && email !== ''
            ? { identity: { sub: `fake-sub:${email.toLowerCase()}`, email, emailVerified: true } }
            : script;
        completeAuthorize(response, params, answering);
    }
    async function token(request, response) {
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
        const body = {
            access_token: randomBytes(24).toString('base64url'),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid email profile',
        };
        if (!issued.script.omitIdToken)
            body.id_token = await idTokenOf(issued);
        send(response, 200, body);
    }
    async function route(request, response) {
        const url = new URL(request.url ?? '/', issuer);
        const endpoint = `${request.method ?? 'GET'} ${url.pathname}`;
        switch (endpoint) {
            case 'GET /.well-known/openid-configuration':
                hits.discovery += 1;
                if (discovery === 'error')
                    return send(response, 500, { error: 'discovery unavailable' });
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
        route(request, response).catch((error) => {
            if (!response.headersSent)
                send(response, 500, { error: 'fake_oidc_failure', error_description: String(error) });
            else
                response.end();
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 0, '127.0.0.1', () => resolve());
    });
    issuer = `http://127.0.0.1:${server.address().port}`;
    return {
        issuer,
        script: (next) => {
            script = next;
        },
        setDiscovery: (mode) => {
            discovery = mode;
        },
        hits: () => ({ ...hits }),
        close: () => new Promise((resolve, reject) => {
            server.closeAllConnections();
            server.close((error) => (error ? reject(error) : resolve()));
        }),
    };
}
