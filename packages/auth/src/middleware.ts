// createMiddleware: the request middleware a Mortar site needs, in one
// function: the auth routes and the /admin guard, uploaded files, a limit
// on sign-in attempts, and a Content-Security-Policy for pages. Shaped for
// `start.middleware` (`(event, next) => Response`) but typed structurally,
// so it doesn't depend on the vite plugin.
import { serveBlob, type BlobStore } from '@mortar-kit/core';

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
   * in each `window` of seconds, then 429 with Retry-After. Default
   * `{ max: 10, window: 600 }`; `false` turns it off. Kept in memory, per
   * server process.
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
   * to `renderToStream` (the plugin's generated entries do).
   */
  csp?: boolean | string;
}

const DEFAULT_CSP = "script-src 'nonce-{nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";
const isRead = (request: Request) => request.method === 'GET' || request.method === 'HEAD';

/**
 * The site's middleware: put it in `start.middleware`. Order: rate limit on
 * sign-in posts, then `auth.handle` (auth routes, the `/admin` guard), then
 * uploaded files, then the page (with a CSP) or server function.
 *
 * @example
 * ```ts
 * // src/middleware.ts (vite.config: solid({ start: { middleware: './src/middleware.ts' } }))
 * export default createMiddleware({ auth, blobs });
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
  const csp = options.csp === undefined || options.csp === true ? DEFAULT_CSP : options.csp || undefined;
  const authPrefix = `${auth.basePath}/`;

  return async (event, next) => {
    const { request } = event;
    const path = new URL(request.url).pathname;
    if (limiter && request.method === 'POST' && path.toLowerCase().startsWith(authPrefix)) {
      const key = clientKey(request);
      const wait = key === undefined ? 0 : limiter(key);
      if (wait > 0) {
        return new Response('Too many sign-in attempts. Try again later.', {
          status: 429,
          headers: { 'retry-after': String(Math.ceil(wait / 1000)), 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    }
    const handled = await auth.handle(request);
    if (handled) return handled;
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
