// createAuth: sign-in for the admin. Methods (Google, email, your own) prove
// who someone is and return an `Identity`; the app's `authorize` decides
// whether that identity may in, and as which user. A signed cookie keeps
// the identity between requests, and `authorize` runs again on each
// guarded request, so taking someone's access away works at once.
// Framework-neutral: everything is a Fetch `Request` in, a `Response` out,
// so it fits any middleware (the example uses `start.middleware`).
import { createSealer, type Sealer } from './seal.ts';

/** Who a sign-in method says someone is. */
export interface Identity {
  /** Email address, lowercased. Methods only return addresses they have verified. */
  email: string;
  /** Display name, when the method knows it. */
  name?: string;
  /** The `id` of the method that signed them in, e.g. `'google'`. */
  method: string;
}

/** What `authorize` receives. */
export interface AuthorizeInput {
  /** Who the method (or the session cookie) says this is. */
  identity: Identity;
  /** The request being authorized. */
  request: Request;
}

/** Why a sign-in failed: the `error` parameter of the sign-in page. */
export type AuthError = 'denied' | 'expired' | 'invalid' | 'invalid-email' | 'failed';

/** A sign-in method, as the sign-in page lists it. Plain JSON, so it can cross a server function. */
export interface AuthMethodInfo {
  id: string;
  /** Button text, e.g. "Continue with Google". */
  label: string;
  /** `'button'`: a button that posts to `action`; `'email'`: an email field that posts to `action`, then a code that posts to `callback`. */
  input: 'button' | 'email';
  /** Path the sign-in form posts to. */
  action: string;
  /** Path of the method's callback (where an emailed code or link is posted). */
  callback: string;
}

/** What a method's `callback` returns once it knows who someone is. */
export interface AuthSuccess {
  identity: Identity;
  /** Path to go to after signing in, if the method carried one through; `ctx.returnTo` otherwise. */
  returnTo?: string;
}

/** What a sign-in method gets from `createAuth` for each request. */
export interface AuthMethodContext {
  /** Where to go after signing in: the request's `returnTo` parameter (a path on this site), or the admin. */
  readonly returnTo: string;
  /** The sealer over the app's secret: sign state, hash tokens. */
  readonly sealer: Sealer;
  /** Absolute URL of this method's routes: `url()` is its start, `url('callback')` its callback. */
  url(path?: 'callback'): string;
  /** Absolute URL of the sign-in page with these search parameters (undefined ones left out). */
  signInUrl(params?: Record<string, string | undefined>): string;
  /** Whether `identity` may sign in (runs `authorize`), e.g. before sending an email. */
  allows(identity: Identity): Promise<boolean>;
  /** Back to the sign-in page, showing `error`, with these search parameters too (e.g. to keep a code form open). */
  fail(error: AuthError, params?: Record<string, string | undefined>): Response;
  /** A 303 redirect to `location`, setting these cookies. */
  redirect(location: string, cookies?: readonly string[]): Response;
  /** A Set-Cookie header storing `value` for this method (its routes only) for `maxAge` seconds. */
  setCookie(value: string, maxAge: number): string;
  /** The value `setCookie` stored, if the browser sent it back. */
  readCookie(): string | undefined;
}

/**
 * A way to sign in. `createAuth` routes `POST <basePath>/<id>` to `start`
 * and `<basePath>/<id>/callback` (GET or POST) to `callback`.
 */
export interface AuthMethod {
  /** URL segment and `Identity.method`: lowercase letters, digits and dashes. */
  id: string;
  /** Button text on the sign-in page. */
  label: string;
  /** What the sign-in page shows for it; see `AuthMethodInfo.input`. */
  input: 'button' | 'email';
  /** The sign-in form was submitted: redirect to the provider, send an email, … */
  start(request: Request, ctx: AuthMethodContext): Promise<Response>;
  /** The provider (or an emailed link or code) came back: who is it? A Response instead answers the request as it is (e.g. `ctx.fail`). */
  callback(request: Request, ctx: AuthMethodContext): Promise<AuthSuccess | Response>;
}

/** Options for `createAuth`. */
export interface AuthOptions<User> {
  /** The ways to sign in, in the order the sign-in page lists them. */
  methods: readonly AuthMethod[];
  /**
   * Who may use the admin: the user for this identity, or null if they may
   * not. Runs when someone signs in and again on every guarded request, so
   * removing someone takes effect at once; keep it quick (one lookup). The
   * user is what `user()` and `require()` return; keep it plain JSON if it
   * goes to the browser. `allowEmails([...])` covers a fixed list.
   */
  authorize(input: AuthorizeInput): User | null | undefined | Promise<User | null | undefined>;
  /**
   * Signs the session cookie and the OAuth state, and keys token hashes:
   * at least 32 characters, from the environment, never in code. Several
   * keys rotate: the first signs, all are accepted.
   */
  secret: string | readonly string[];
  /** Where the auth routes live. Default `/admin/auth`. */
  basePath?: string;
  /** The app's sign-in page (a route rendering `<SignIn>` from `@mortar-kit/admin`). Default `/admin/sign-in`. */
  signInPath?: string;
  /** Paths (prefixes) that need a signed-in user; `handle` redirects (GET) or refuses (401) the rest. Default `['/admin']`. */
  protect?: readonly string[];
  /** Where to go after signing in when no `returnTo` was given. Default `/admin`. */
  home?: string;
  /** How long a session lasts, in seconds. Default 14 days. */
  maxAge?: number;
  /** The session cookie's name. Default `mortar_session`. */
  cookieName?: string;
  /**
   * The site's public origin, e.g. `https://example.com`: OAuth redirect
   * URIs, email links and the same-origin check use it. Set it behind a
   * proxy, where the request's own URL may be `http://localhost:3000`.
   * Default: the origin of each request.
   */
  baseUrl?: string;
}

/** Sign-in for the admin; see `createAuth`. */
export interface Auth<User> {
  /** The methods, for the sign-in page. */
  readonly methods: readonly AuthMethodInfo[];
  /** The sign-in page's path. */
  readonly signInPath: string;
  /**
   * Answers the auth routes (sign-in methods, `POST <basePath>/sign-out`)
   * and guards `protect`ed paths; null means carry on (the request is
   * someone else's, or the user is signed in). Call it first in your
   * middleware: `return (await auth.handle(request)) ?? next();`.
   */
  handle(request: Request): Promise<Response | null>;
  /** The signed-in user (`authorize` asked again), or null. */
  user(request: Request): Promise<User | null>;
  /**
   * The signed-in user, or throws a 401 Response (403 for a cross-site
   * POST). Call it first in every server function that writes: middleware
   * can't tell which server-function calls are the admin's.
   */
  require(request: Request): Promise<User>;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
const DAY = 24 * 60 * 60;

/** Paths without a trailing slash, compared lowercased (routers match paths case-insensitively). */
const clean = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path).toLowerCase();
const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix === '/' ? '/' : `${prefix}/`);

/**
 * Sign-in for the admin. Put `handle` first in the app's middleware and
 * `require` first in each server function that writes.
 *
 * @example
 * ```ts
 * const auth = createAuth({
 *   methods: [google({ clientId, clientSecret }), email({ mailer, store })],
 *   authorize: allowEmails(['you@example.com', '*@example.com']),
 *   secret: process.env.MORTAR_AUTH_SECRET!,
 * });
 * ```
 */
export function createAuth<User>(options: AuthOptions<User>): Auth<User> {
  const sealer = createSealer(options.secret);
  const basePath = clean(options.basePath ?? '/admin/auth');
  const signInPath = clean(options.signInPath ?? '/admin/sign-in');
  const protect = (options.protect ?? ['/admin']).map(clean);
  const home = options.home ?? '/admin';
  const maxAge = options.maxAge ?? 14 * DAY;
  const cookieName = options.cookieName ?? 'mortar_session';
  const baseUrl = options.baseUrl ? new URL(options.baseUrl).origin : undefined;

  const byId = new Map<string, AuthMethod>();
  for (const method of options.methods) {
    if (!ID.test(method.id)) throw new Error(`Mortar auth: invalid method id "${method.id}" (lowercase letters, digits and dashes).`);
    if (method.id === 'sign-out') throw new Error('Mortar auth: "sign-out" is not a method id (it is the sign-out route).');
    if (byId.has(method.id)) throw new Error(`Mortar auth: two methods have the id "${method.id}".`);
    byId.set(method.id, method);
  }
  const methods: AuthMethodInfo[] = options.methods.map((m) => ({
    id: m.id,
    label: m.label,
    input: m.input,
    action: `${basePath}/${m.id}`,
    callback: `${basePath}/${m.id}/callback`,
  }));

  const originOf = (request: Request) => baseUrl ?? new URL(request.url).origin;

  /** A Set-Cookie header. Secure on https; never readable from scripts. */
  const cookie = (request: Request, name: string, value: string, path: string, age: number) =>
    `${name}=${value}; Path=${path}; Max-Age=${age}; HttpOnly; SameSite=Lax${originOf(request).startsWith('https:') ? '; Secure' : ''}`;

  const redirect = (location: string, cookies: readonly string[] = []) => {
    const headers = new Headers({ location, 'cache-control': 'no-store' });
    for (const c of cookies) headers.append('set-cookie', c);
    return new Response(null, { status: 303, headers });
  };

  /** A path on this site to come back to, never somewhere else (`//evil.com`) or the auth pages themselves. */
  const safeReturn = (value: unknown): string => {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return home;
    const path = clean(new URL(value, 'http://x').pathname);
    return under(path, basePath) || under(path, signInPath) ? home : value;
  };

  const signInUrl = (request: Request, params: Record<string, string | undefined> = {}) => {
    const url = new URL(signInPath, originOf(request));
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
    return url.href;
  };

  /** Whether a request comes from this site (for POSTs): its Origin, else Sec-Fetch-Site; requests with neither aren't from a browser. */
  const sameOrigin = (request: Request) => {
    const origin = request.headers.get('origin');
    if (origin) return origin === originOf(request);
    const site = request.headers.get('sec-fetch-site');
    return !site || site === 'same-origin' || site === 'none';
  };
  const isRead = (request: Request) => request.method === 'GET' || request.method === 'HEAD';

  const authorize = async (identity: Identity, request: Request) => (await options.authorize({ identity, request })) ?? null;

  const cached = new WeakMap<Request, Promise<User | null>>();
  const user = (request: Request): Promise<User | null> => {
    let found = cached.get(request);
    if (!found) {
      found = (async () => {
        const token = readCookies(request).get(cookieName);
        const identity = token ? asIdentity(await sealer.open(token)) : null;
        return identity ? authorize(identity, request) : null;
      })();
      cached.set(request, found);
    }
    return found;
  };

  const contextFor = (request: Request, method: AuthMethod, returnTo: string): AuthMethodContext => {
    const methodPath = `${basePath}/${method.id}`;
    const fail = (error: AuthError, params: Record<string, string | undefined> = {}) =>
      redirect(signInUrl(request, { ...params, error, returnTo: returnTo === home ? undefined : returnTo }));
    return {
      returnTo,
      sealer,
      url: (path) => new URL(path ? `${methodPath}/${path}` : methodPath, originOf(request)).href,
      signInUrl: (params) => signInUrl(request, params),
      allows: async (identity) => (await authorize(identity, request)) !== null,
      fail,
      redirect,
      setCookie: (value, age) => cookie(request, `${cookieName}_${method.id}`, value, methodPath, age),
      readCookie: () => readCookies(request).get(`${cookieName}_${method.id}`),
    };
  };

  /** Signs `identity` in: asks `authorize`, then sets the session cookie and goes to `returnTo`. */
  const signIn = async (request: Request, method: AuthMethod, ctx: AuthMethodContext, success: AuthSuccess) => {
    const identity: Identity = { ...success.identity, email: success.identity.email.toLowerCase(), method: method.id };
    if ((await authorize(identity, request)) === null) return ctx.fail('denied');
    const session = await sealer.seal(identity, maxAge);
    return redirect(safeReturn(success.returnTo ?? ctx.returnTo), [
      cookie(request, cookieName, session, '/', maxAge),
      // The method's own state (e.g. OAuth's) is done with.
      ctx.setCookie('', 0),
    ]);
  };

  const handleAuthRoute = async (request: Request, rest: string): Promise<Response> => {
    if (!isRead(request) && !sameOrigin(request)) return new Response('Cross-site request refused', { status: 403 });
    if (rest === '/sign-out') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
      return redirect(signInUrl(request), [cookie(request, cookieName, '', '/', 0)]);
    }
    const match = /^\/([a-z0-9-]+)(\/callback)?$/.exec(rest);
    const method = match && byId.get(match[1]!);
    if (!match || !method) return new Response('Not found', { status: 404 });
    const isCallback = match[2] !== undefined;
    if (!isCallback && request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });

    const returnTo = safeReturn(await param(request, 'returnTo'));
    const ctx = contextFor(request, method, returnTo);
    try {
      if (!isCallback) return await method.start(request, ctx);
      const result = await method.callback(request, ctx);
      return result instanceof Response ? result : await signIn(request, method, ctx, result);
    } catch (error) {
      console.error(`Mortar auth: the ${method.id} method failed.`, error);
      return ctx.fail('failed');
    }
  };

  return {
    methods,
    signInPath,
    async handle(request) {
      const url = new URL(request.url);
      const path = clean(url.pathname);
      if (under(path, basePath)) return handleAuthRoute(request, path.slice(basePath.length));
      if (under(path, signInPath) || !protect.some((p) => under(path, p))) return null;
      if (await user(request)) return null;
      if (!isRead(request)) return new Response('Sign in required', { status: 401 });
      const back = url.pathname + url.search;
      return redirect(signInUrl(request, { returnTo: back === home ? undefined : back }));
    },
    user,
    async require(request) {
      if (!isRead(request) && !sameOrigin(request)) throw new Response('Cross-site request refused', { status: 403 });
      const found = await user(request);
      if (found === null) throw new Response('Sign in required', { status: 401 });
      return found;
    },
  };
}

/** The request's cookies by name. */
function readCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) cookies.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return cookies;
}

/** A parameter from the query string or, for a form POST, the form (read from a clone, so methods can read the body again). */
async function param(request: Request, name: string): Promise<string | undefined> {
  const fromQuery = new URL(request.url).searchParams.get(name);
  if (fromQuery !== null) return fromQuery;
  if (request.method !== 'POST') return undefined;
  return formValue(await readForm(request), name);
}

/** The request's form fields (from a clone), or an empty form if it has none. */
export async function readForm(request: Request): Promise<FormData> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/x-www-form-urlencoded') && !type.includes('multipart/form-data')) return new FormData();
  try {
    return await request.clone().formData();
  } catch {
    return new FormData();
  }
}

/** A text field of a form, or undefined. */
export function formValue(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === 'string' ? value : undefined;
}

function asIdentity(value: unknown): Identity | null {
  if (!value || typeof value !== 'object') return null;
  const { email, name, method } = value as Record<string, unknown>;
  if (typeof email !== 'string' || typeof method !== 'string') return null;
  return typeof name === 'string' ? { email, name, method } : { email, method };
}
