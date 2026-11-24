// createMiddleware: order (rate limit, auth, uploads, pages), the sign-in
// rate limit, uploads served from the blob store, and the CSP with its nonce.
import { createContent, createMemoryBlobStore, createMemoryStore, defineCollection, fields } from '@mortar-kit/core';
import { describe, expect, it } from 'vitest';

import { allowEmails } from './allow.ts';
import { createAuth } from './auth.ts';
import { createLimiter, createMiddleware, type MiddlewareEvent, type MiddlewareOptions } from './middleware.ts';

const ORIGIN = 'http://site.test';
const auth = createAuth({ methods: [], authorize: allowEmails(['ada@example.com']), secret: 'a-test-secret-that-is-long-enough-123' });
const page = async () => new Response('<!doctype html><p>hi</p>', { headers: { 'content-type': 'text/html; charset=utf-8' } });

function run(options: Partial<MiddlewareOptions>, request: Request, next = page) {
  const event: MiddlewareEvent = { request };
  return { event, response: createMiddleware({ auth, dev: false, ...options })(event, next) };
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

  it('sends no CSP on the dev server unless asked', async () => {
    const dev = run({ dev: true }, new Request(`${ORIGIN}/`));
    expect((await dev.response).headers.has('content-security-policy')).toBe(false);
    expect(dev.event.nonce).toBeUndefined();
    expect((await run({ dev: true, csp: true }, new Request(`${ORIGIN}/`)).response).headers.has('content-security-policy')).toBe(true);
  });

  it('adds security headers to every response, yours merged in', async () => {
    const response = await run({}, new Request(`${ORIGIN}/`)).response;
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    // A redirect's headers are immutable; it still gets them.
    const redirect = await run({}, new Request(`${ORIGIN}/`), async () => Response.redirect(`${ORIGIN}/x`, 302)).response;
    expect(redirect.headers.get('x-content-type-options')).toBe('nosniff');
    expect(redirect.headers.get('location')).toBe(`${ORIGIN}/x`);
    const custom = await run({ headers: { 'X-Frame-Options': null, 'Permissions-Policy': 'camera=()' } }, new Request(`${ORIGIN}/`)).response;
    expect(custom.headers.has('x-frame-options')).toBe(false);
    expect(custom.headers.get('permissions-policy')).toBe('camera=()');
    const kept = await run({}, new Request(`${ORIGIN}/`), async () => new Response('', { headers: { 'referrer-policy': 'no-referrer' } })).response;
    expect(kept.headers.get('referrer-policy')).toBe('no-referrer');
    expect((await run({ headers: false }, new Request(`${ORIGIN}/`)).response).headers.has('x-content-type-options')).toBe(false);
  });

  it('answers /sitemap.xml and /robots.txt when asked to', async () => {
    const posts = defineCollection({ name: 'posts', fields: { title: fields.text({ label: 'Title' }) }, url: '/posts/:slug' });
    const content = createContent({ store: createMemoryStore({ posts: [{ id: 'p', slug: 'hi', fields: {} }] }), collections: [posts], bricks: [] });
    const site = { content, collections: [posts], origin: 'https://example.com' };
    const map = await run({ sitemap: site }, new Request(`${ORIGIN}/sitemap.xml`)).response;
    expect(map.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(await map.text()).toContain('<loc>https://example.com/posts/hi</loc>');
    const robots = await run({ sitemap: site, robots: true }, new Request(`${ORIGIN}/robots.txt`)).response;
    expect(await robots.text()).toBe('User-agent: *\nDisallow: /admin\n\nSitemap: https://example.com/sitemap.xml\n');
    expect(await (await run({ robots: 'User-agent: *\nDisallow: /\n' }, new Request(`${ORIGIN}/robots.txt`)).response).text()).toBe('User-agent: *\nDisallow: /\n');
    // Not asked: the app answers.
    expect(await (await run({}, new Request(`${ORIGIN}/robots.txt`)).response).text()).toContain('<p>hi</p>');
    expect(await (await run({}, new Request(`${ORIGIN}/sitemap.xml`)).response).text()).toContain('<p>hi</p>');
  });

  it('counts sending a code and trying one separately', async () => {
    const middleware = createMiddleware({ auth, dev: false, rateLimit: { max: 1, window: 60 } });
    const post = (path: string) =>
      middleware({ request: new Request(`${ORIGIN}/admin/auth${path}`, { method: 'POST', headers: { origin: ORIGIN, 'x-forwarded-for': '3.3.3.3' } }) }, page);
    expect((await post('/email')).status).not.toBe(429);
    expect((await post('/email')).status).toBe(429);
    expect((await post('/email/callback')).status).not.toBe(429);
    expect((await post('/email/callback')).status).toBe(429);
    expect((await post('/sign-out')).status).not.toBe(429);
  });

  it('limits sign-in posts per client', async () => {
    const middleware = createMiddleware({ auth, dev: false, rateLimit: { max: 2, window: 60 } });
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
