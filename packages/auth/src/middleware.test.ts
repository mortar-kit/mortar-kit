// createMiddleware: order (rate limit, auth, uploads, pages), the sign-in
// rate limit, uploads served from the blob store, and the CSP with its nonce.
import { createMemoryBlobStore } from '@mortar-kit/core';
import { describe, expect, it } from 'vitest';

import { allowEmails } from './allow.ts';
import { createAuth } from './auth.ts';
import { createLimiter, createMiddleware, type MiddlewareEvent, type MiddlewareOptions } from './middleware.ts';

const ORIGIN = 'http://site.test';
const auth = createAuth({ methods: [], authorize: allowEmails(['ada@example.com']), secret: 'a-test-secret-that-is-long-enough-123' });
const page = async () => new Response('<!doctype html><p>hi</p>', { headers: { 'content-type': 'text/html; charset=utf-8' } });

function run(options: Partial<MiddlewareOptions>, request: Request, next = page) {
  const event: MiddlewareEvent = { request };
  return { event, response: createMiddleware({ auth, ...options })(event, next) };
}

describe('createMiddleware', () => {
  it('lets auth guard the admin first', async () => {
    const response = await run({}, new Request(`${ORIGIN}/admin`)).response;
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/admin/sign-in`);
  });

  it('serves uploads from the blob store at its url path', async () => {
    const blobs = createMemoryBlobStore();
    await blobs.put('cat-abc123.png', new Blob(['png'], { type: 'image/png' }));
    const response = await run({ blobs }, new Request(`${ORIGIN}${blobs.url('cat-abc123.png')}`)).response;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('png');
    expect((await run({ blobs }, new Request(`${ORIGIN}${blobs.url('missing-abc123.png')}`)).response).status).toBe(404);
  });

  it('puts a nonce on the event and a matching CSP on pages', async () => {
    const { event, response } = run({}, new Request(`${ORIGIN}/about`));
    const csp = (await response).headers.get('content-security-policy')!;
    expect(typeof event.nonce).toBe('string');
    expect(csp).toContain(`'nonce-${event.nonce}'`);
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it('takes a custom policy, or none', async () => {
    const custom = run({ csp: "script-src 'nonce-{nonce}'" }, new Request(`${ORIGIN}/`));
    expect((await custom.response).headers.get('content-security-policy')).toBe(`script-src 'nonce-${custom.event.nonce}'`);
    const none = run({ csp: false }, new Request(`${ORIGIN}/`));
    expect((await none.response).headers.has('content-security-policy')).toBe(false);
    expect(none.event.nonce).toBeUndefined();
  });

  it('leaves non-HTML responses without a CSP', async () => {
    const json = async () => Response.json({ ok: true });
    expect((await run({}, new Request(`${ORIGIN}/_server`), json).response).headers.has('content-security-policy')).toBe(false);
  });

  it('limits sign-in posts per client', async () => {
    const middleware = createMiddleware({ auth, rateLimit: { max: 2, window: 60 } });
    const attempt = (ip: string) =>
      middleware({ request: new Request(`${ORIGIN}/admin/auth/email`, { method: 'POST', headers: { origin: ORIGIN, 'x-forwarded-for': `${ip}, 10.0.0.1` } }) }, page);
    expect((await attempt('1.1.1.1')).status).toBe(404);
    expect((await attempt('1.1.1.1')).status).toBe(404);
    const limited = await attempt('1.1.1.1');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await attempt('2.2.2.2')).status).toBe(404);
  });
});

describe('createLimiter', () => {
  it('counts per key in fixed windows', () => {
    let t = 0;
    const hit = createLimiter(2, 1000, () => t);
    expect([hit('a'), hit('a'), hit('a')]).toEqual([0, 0, 1000]);
    t = 400;
    expect(hit('a')).toBe(600);
    expect(hit('b')).toBe(0);
    t = 1000;
    expect(hit('a')).toBe(0);
  });
});
