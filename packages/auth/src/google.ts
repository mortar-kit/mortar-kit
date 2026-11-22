// Sign in with Google: OAuth 2.0's authorization code flow with PKCE. The
// state, PKCE verifier and return path wait in a short-lived signed cookie
// scoped to the method's routes; the callback checks the state, swaps the
// code for an ID token at Google's token endpoint and reads the email from
// it. The token comes straight from Google over TLS, so its claims are
// checked (issuer, audience, expiry, verified email) but its signature
// isn't fetched and verified, as Google's OpenID Connect guide allows.
import type { AuthMethod } from './auth.ts';
import { fromBase64Url, randomToken, sha256 } from './seal.ts';

/** Options for `google`. */
export interface GoogleOptions {
  /** OAuth client id (Google Cloud console › APIs & Services › Credentials, type "Web application"). */
  clientId: string;
  /** The client's secret: from the environment, never in code. */
  clientSecret: string;
  /** Only accept accounts of this Google Workspace domain, e.g. `example.com` (also hints the account picker). */
  hostedDomain?: string;
  /** Button text. Default "Continue with Google". */
  label?: string;
  /** The method's id, in its URLs. Default `google`. */
  id?: string;
  /** For tests: the fetch that calls Google's token endpoint. */
  fetch?: typeof fetch;
}

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const STATE_AGE = 10 * 60;

interface Pending {
  state: string;
  verifier: string;
  returnTo: string;
}

/**
 * Sign in with a Google account. Add `<baseUrl>/admin/auth/google/callback`
 * (or your `basePath`) as an authorized redirect URI of the OAuth client.
 */
export function google(options: GoogleOptions): AuthMethod {
  if (!options.clientId || !options.clientSecret) throw new Error('Mortar auth: google() needs a clientId and a clientSecret.');
  const doFetch = options.fetch ?? fetch;
  const id = options.id ?? 'google';
  return {
    id,
    label: options.label ?? 'Continue with Google',
    input: 'button',

    async start(_request, ctx) {
      const pending: Pending = { state: randomToken(), verifier: randomToken(48), returnTo: ctx.returnTo };
      const url = new URL(AUTHORIZE);
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: ctx.url('callback'),
        response_type: 'code',
        scope: 'openid email profile',
        state: pending.state,
        code_challenge: await sha256(pending.verifier),
        code_challenge_method: 'S256',
        prompt: 'select_account',
        ...(options.hostedDomain ? { hd: options.hostedDomain } : {}),
      }).toString();
      return ctx.redirect(url.href, [ctx.setCookie(await ctx.sealer.seal(pending, STATE_AGE), STATE_AGE)]);
    },

    async callback(request, ctx) {
      const params = new URL(request.url).searchParams;
      const stored = ctx.readCookie();
      const pending = stored ? ((await ctx.sealer.open(stored)) as Pending | null) : null;
      // No cookie: it expired, or the sign-in started in another browser.
      if (!pending) return ctx.fail('expired');
      if (params.get('state') !== pending.state) return ctx.fail('invalid');
      // The person cancelled at Google, or Google refused.
      const code = params.get('code');
      if (params.get('error') || !code) return ctx.fail('denied');

      const response = await doFetch(TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          code,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: ctx.url('callback'),
          grant_type: 'authorization_code',
          code_verifier: pending.verifier,
        }),
      });
      if (!response.ok) throw new Error(`Google's token endpoint answered ${response.status}: ${await response.text()}`);
      const { id_token: idToken } = (await response.json()) as { id_token?: unknown };
      const claims = typeof idToken === 'string' ? decodeJwt(idToken) : null;
      if (!claims) throw new Error('Google sent no readable ID token.');

      const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      const valid =
        ISSUERS.includes(String(claims.iss)) &&
        audience.includes(options.clientId) &&
        typeof claims.exp === 'number' &&
        claims.exp > Date.now() / 1000 &&
        typeof claims.email === 'string' &&
        (claims.email_verified === true || claims.email_verified === 'true') &&
        (!options.hostedDomain || claims.hd === options.hostedDomain);
      if (!valid) return ctx.fail('denied');
      const email = (claims.email as string).toLowerCase();
      const identity = typeof claims.name === 'string' && claims.name ? { email, name: claims.name, method: id } : { email, method: id };
      return { identity, returnTo: pending.returnTo };
    },
  };
}

/** A JWT's claims, unverified, or null if it isn't one. */
function decodeJwt(token: string): Record<string, unknown> | null {
  const bytes = fromBase64Url(token.split('.')[1] ?? '');
  if (!bytes) return null;
  try {
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
