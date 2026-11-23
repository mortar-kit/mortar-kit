// createMiddleware: the request middleware a Mortar site needs, in one
// function: the auth routes and the /admin guard, uploaded files, a limit
// on sign-in attempts, /sitemap.xml and /robots.txt, a Content-Security-Policy
// for pages (off on the dev server, whose scripts have no nonce), and
// security headers on every response. Shaped for
// `start.middleware` (`(event, next) => Response`) but typed structurally,
// so it doesn't depend on the vite plugin.
import { serveBlob, sitemap, type AnyCollection, type BlobStore, type ContentSource, type SitemapOptions } from '@mortar-kit/core';

import type { Auth } from './auth.ts';

/** What the middleware reads and writes on the request event (`StartRequestEvent` fits). */
export interface MiddlewareEvent {
  request: Request;
  /** The CSP nonce the page render uses; set here when `csp` is on and nothing set it. */
  nonce?: string | { script?: string | false; style?: string | false };
}

/** A middleware for `start.middleware`. */
export type Middleware = (event: MiddlewareEvent, next: () => Promise<Response>) => Promise<Response>;

/** Options for `createMiddleware`. */
export interface MiddlewareOptions {
  /** The site's `createAuth` (or `authFromEnv`). */
  auth: Auth<unknown>;
  /** Serves uploaded files from this store at the path its `url('')` gives (e.g. `/uploads/`), with `serveBlob`. */
  blobs?: BlobStore;
  /**
   * Limits sign-in attempts (posts to the auth routes) per client: `max`
   * in each `window` of seconds, then 429 with Retry-After. Asking for a
   * code or link and trying one count separately, so a client that used
   * up its sends can still type the code it got. Default
   * `{ max: 10, window: 600 }` for each; `false` turns it off. Kept in
   * memory, per server process.
   */
  rateLimit?: { max: number; window: number } | false;
  /**
   * Who a request is from, for the rate limit; undefined means not
   * limited. Default: the first address in `X-Forwarded-For`, else
   * `X-Real-IP`, which a proxy in front of the server sets. Without a
   * proxy, a Fetch Request doesn't carry the client's address: pass your
   * own (a shared bucket for everyone would let one client lock every
   * editor out).
   */
  clientKey?: (request: Request) => string | undefined;
  /**
   * A Content-Security-Policy for HTML responses. `true` (default) sends
   * `script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'`,
   * with a fresh nonce per request that the page render puts on its
   * scripts; a string is your own policy, where `{nonce}` is replaced by
   * that nonce; `false` sends none. The server entry must pass the nonce
   * to `renderToStream` (the plugin's generated entries do). Default
   * off on the dev server (`dev`), since Vite's dev scripts carry no nonce.
   */
  csp?: boolean | string;
  /**
   * Headers for every response, unless it set them itself. Default
   * `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
   * and `X-Frame-Options: SAMEORIGIN` (the admin's preview is a same-origin
   * frame). Yours are added to those; a header set to `null` is left out;
   * `false` adds none.
   */
  headers?: Readonly<Record<string, string | null>> | false;
  /**
   * Answers `GET /sitemap.xml` with `sitemap(content, collections, options)`
   * from `@mortar-kit/core`. `origin` defaults to the request's; set it
   * behind a proxy (e.g. from `MORTAR_BASE_URL`).
   */
  sitemap?: { content: ContentSource; collections: readonly AnyCollection[] } & Omit<SitemapOptions, 'origin'> & { origin?: string };
  /**
   * Answers `GET /robots.txt`. `true` lets crawlers in everywhere but
   * the auth's protected paths (`/admin`) and points them at the sitemap
   * when `sitemap` is set; a string is the whole file. Default: not served.
   */
  robots?: boolean | string;
  /** Development: no CSP by default. Default Vite's `import.meta.env.DEV`. */
  dev?: boolean;
}

// Vite replaces `import.meta.env` in the app's build (dev server: DEV true;
// production build: false). Typed by vite/client in the workspace, not in
// the package build, hence the ts-ignore.
// @ts-ignore
const VITE_DEV: boolean = import.meta.env?.DEV === true;

const DEFAULT_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
};

const DEFAULT_CSP = "script-src 'nonce-{nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";
const isRead = (request: Request) => request.method === 'GET' || request.method === 'HEAD';

/**
 * The site's middleware: put it in `start.middleware`. Order: rate limit on
 * sign-in posts, then `auth.handle` (auth routes, the `/admin` guard), then
 * `/sitemap.xml` and `/robots.txt` when asked for, then uploaded files,
 * then the page (with a CSP) or server function. Every response gets the
 * `headers`.
 *
 * @example
 * ```ts
 * // src/middleware.ts (vite.config: solid({ start: { middleware: './src/middleware.ts' } }))
 * export default createMiddleware({ auth, blobs, sitemap: { content, collections }, robots: true });
 * ```
 */
export function createMiddleware(options: MiddlewareOptions): Middleware {
  const { auth, blobs } = options;
  const uploads = blobs ? blobs.url('') : undefined;
  if (uploads !== undefined && !uploads.startsWith('/')) {
    throw new Error(`Mortar: createMiddleware serves uploads only from a path on this site; blobs.url('') is "${uploads}".`);
  }
  const limit = options.rateLimit === undefined ? { max: 10, window: 600 } : options.rateLimit;
  const limiter = limit ? createLimiter(limit.max, limit.window * 1000) : undefined;
  const clientKey = options.clientKey ?? defaultClientKey;
  const dev = options.dev ?? VITE_DEV;
  const cspOption = options.csp ?? !dev;
  const csp = cspOption === true ? DEFAULT_CSP : cspOption || undefined;
  const authPrefix = `${auth.basePath}/`;
  const headers = options.headers === false ? {} : withoutNulls({ ...DEFAULT_HEADERS, ...lowerKeys(options.headers ?? {}) });
  const site = options.sitemap;
  const robots = options.robots;

  const handle = async (event: MiddlewareEvent, next: () => Promise<Response>): Promise<Response> => {
    const { request } = event;
    const url = new URL(request.url);
    const path = url.pathname;
    const lower = path.toLowerCase();
    if (limiter && request.method === 'POST' && lower.startsWith(authPrefix) && lower !== `${authPrefix}sign-out`) {
      const key = clientKey(request);
      // Sending a code or link and trying one are separate buckets.
      const bucket = lower.endsWith('/callback') ? 'try' : 'send';
      const wait = key === undefined ? 0 : limiter(`${bucket} ${key}`);
      if (wait > 0) {
        return new Response('Too many sign-in attempts. Try again later.', {
          status: 429,
          headers: { 'retry-after': String(Math.ceil(wait / 1000)), 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    }
    const handled = await auth.handle(request);
    if (handled) return handled;
    if (isRead(request) && site && path === '/sitemap.xml') {
      const { content, collections, origin, ...rest } = site;
      const xml = await sitemap(content, collections, { ...rest, origin: origin ?? url.origin });
      return new Response(request.method === 'HEAD' ? null : xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
    }
    if (isRead(request) && robots && path === '/robots.txt') {
      const text = typeof robots === 'string' ? robots : robotsTxt(site ? new URL('/sitemap.xml', site.origin ?? url.origin).href : undefined);
      return new Response(request.method === 'HEAD' ? null : text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (uploads !== undefined && blobs && isRead(request) && path.startsWith(uploads)) {
      return serveBlob(blobs, path.slice(uploads.length), request);
    }
    if (!csp) return next();
    event.nonce ??= randomNonce();
    const response = await next();
    const nonce = typeof event.nonce === 'string' ? event.nonce : event.nonce.script || undefined;
    if (nonce && response.headers.get('content-type')?.startsWith('text/html') && !response.headers.has('content-security-policy')) {
      response.headers.set('content-security-policy', csp.replaceAll('{nonce}', nonce));
    }
    return response;
  };

  return async (event, next) => withHeaders(await handle(event, next), headers);
}

/** The default robots.txt: everything but the admin, and the sitemap if there is one. */
function robotsTxt(sitemapUrl: string | undefined): string {
  return `User-agent: *\nDisallow: /admin\n${sitemapUrl ? `\nSitemap: ${sitemapUrl}\n` : ''}`;
}

/** `response` with `headers` it doesn't have yet (copied first when its headers are immutable, as `Response.redirect`'s are). */
function withHeaders(response: Response, headers: Readonly<Record<string, string>>): Response {
  const missing = Object.entries(headers).filter(([name]) => !response.headers.has(name));
  if (missing.length === 0) return response;
  try {
    for (const [name, value] of missing) response.headers.set(name, value);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    for (const [name, value] of missing) copy.headers.set(name, value);
    return copy;
  }
}

function lowerKeys<V>(record: Readonly<Record<string, V>>): Record<string, V> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k.toLowerCase(), v]));
}

function withoutNulls(record: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => entry[1] !== null));
}

function defaultClientKey(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || undefined;
}

/** 16 random bytes, base64. */
function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * A fixed-window counter per key: returns 0 while the key is under `max`
 * hits in the current window, else the milliseconds until it resets.
 * Expired windows are swept as it goes, so memory stays bounded by the
 * clients seen in one window.
 */
export function createLimiter(max: number, windowMs: number, now: () => number = Date.now): (key: string) => number {
  const windows = new Map<string, { start: number; hits: number }>();
  let swept = now();
  return (key) => {
    const t = now();
    if (t - swept > windowMs) {
      for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
      swept = t;
    }
    let w = windows.get(key);
    if (!w || t - w.start >= windowMs) windows.set(key, (w = { start: t, hits: 0 }));
    w.hits += 1;
    return w.hits > max ? w.start + windowMs - t : 0;
  };
}
