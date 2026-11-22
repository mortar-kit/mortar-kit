// createAuth end to end over Fetch requests: the guard, sessions, sign-out,
// the email method (code, link, tries, silence for strangers) and the
// Google method against a fake token endpoint.
import { createMemoryStore } from '@mortar-kit/core';
import { describe, expect, it, vi } from 'vitest';

import { allowEmails } from './allow.ts';
import { createAuth, type AuthOptions } from './auth.ts';
import { email, EMAIL_TOKENS_COLLECTION } from './email.ts';
import { google } from './google.ts';
import type { MailMessage } from './mailer.ts';
import { createSealer } from './seal.ts';

const SECRET = 'a-test-secret-that-is-long-enough-123';
const ORIGIN = 'http://site.test';

function setup(overrides: Partial<AuthOptions<unknown>> = {}) {
  const sent: MailMessage[] = [];
  const store = createMemoryStore();
  const tokenFetch = vi.fn<typeof fetch>();
  const auth = createAuth({
    methods: [
      google({ clientId: 'client-1', clientSecret: 'shh', fetch: tokenFetch }),
      email({ store, mailer: { send: async (m) => void sent.push(m) }, siteName: 'Test site' }),
    ],
    authorize: allowEmails(['ada@example.com', '*@team.test']),
    secret: SECRET,
    ...overrides,
  });
  return { auth, sent, store, tokenFetch };
}

const get = (path: string, cookie?: string) => new Request(ORIGIN + path, { headers: cookie ? { cookie } : {} });
const post = (path: string, form: Record<string, string> = {}, headers: Record<string, string> = {}) =>
  new Request(ORIGIN + path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, ...headers },
    body: new URLSearchParams(form),
  });

/** The `name=value` parts of a response's Set-Cookie headers, as a Cookie header. */
const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .filter((c) => !c.endsWith('='))
    .join('; ');
const location = (response: Response | null) => new URL(response!.headers.get('location')!, ORIGIN);

/** Signs in through the email code. */
async function signInByCode(s: ReturnType<typeof setup>, address = 'ada@example.com') {
  await s.auth.handle(post('/admin/auth/email', { email: address }));
  const code = /is (\d{6})/.exec(s.sent.at(-1)!.text)![1]!;
  return s.auth.handle(post('/admin/auth/email/callback', { email: address, code }));
}

describe('createAuth', () => {
  it('lists the methods for the sign-in page', () => {
    expect(setup().auth.methods).toEqual([
      { id: 'google', label: 'Continue with Google', input: 'button', action: '/admin/auth/google', callback: '/admin/auth/google/callback' },
      { id: 'email', label: 'Email me a sign-in link', input: 'email', action: '/admin/auth/email', callback: '/admin/auth/email/callback' },
    ]);
  });

  it('refuses short secrets and clashing method ids', () => {
    expect(() => setup({ secret: 'short' })).toThrow(/32 characters/);
    const store = createMemoryStore();
    const mailer = { send: async () => {} };
    expect(() => createAuth({ methods: [email({ store, mailer }), email({ store, mailer })], authorize: () => null, secret: SECRET })).toThrow(/two methods/);
  });

  it('redirects signed-out visits to protected pages to the sign-in page, and leaves the rest alone', async () => {
    const { auth } = setup();
    const response = await auth.handle(get('/Admin?collection=posts'));
    expect(response?.status).toBe(303);
    expect(location(response).pathname).toBe('/admin/sign-in');
    expect(location(response).searchParams.get('returnTo')).toBe('/Admin?collection=posts');
    expect(await auth.handle(get('/admin/sign-in'))).toBeNull();
    expect(await auth.handle(get('/posts/hello'))).toBeNull();
    expect(await auth.handle(get('/administrator'))).toBeNull();
    expect((await auth.handle(post('/admin/preview')))?.status).toBe(401);
  });

  it('signs in with an emailed code, then lets the user through', async () => {
    const s = setup();
    const response = await signInByCode(s);
    expect(response?.status).toBe(303);
    expect(location(response).pathname).toBe('/admin');
    const [session] = response!.headers.getSetCookie();
    expect(session).toMatch(/^mortar_session=.+; Path=\/; Max-Age=1209600; HttpOnly; SameSite=Lax$/);

    const cookie = cookiesOf(response!);
    expect(await s.auth.handle(get('/admin', cookie))).toBeNull();
    expect(await s.auth.user(get('/admin', cookie))).toEqual({ email: 'ada@example.com' });
    expect(await s.auth.require(post('/_server', {}, { cookie }))).toEqual({ email: 'ada@example.com' });
    // The code works once.
    expect(await s.store.list(EMAIL_TOKENS_COLLECTION)).toEqual([]);
  });

  it('asks authorize again on every request, so removed users are out at once', async () => {
    let allowed = true;
    const s = setup({ authorize: ({ identity }) => (allowed ? { email: identity.email } : null) });
    const cookie = cookiesOf((await signInByCode(s))!);
    expect(await s.auth.user(get('/admin', cookie))).not.toBeNull();
    allowed = false;
    expect(await s.auth.user(get('/admin', cookie))).toBeNull();
    expect((await s.auth.handle(get('/admin', cookie)))?.status).toBe(303);
  });

  it('rejects tampered and foreign cookies', async () => {
    const s = setup();
    const cookie = cookiesOf((await signInByCode(s))!);
    const [name, value] = cookie.split('=') as [string, string];
    const [payload, mac] = value.split('.') as [string, string];
    const forged = btoa(JSON.stringify({ v: { email: 'eve@team.test', method: 'email' }, exp: 9e9 })).replace(/=+$/, '');
    expect(await s.auth.user(get('/admin', `${name}=${forged}.${mac}`))).toBeNull();
    expect(await s.auth.user(get('/admin', `${name}=${payload}.${mac.slice(1)}`))).toBeNull();
    const other = setup({ secret: 'another-secret-that-is-long-enough-456' });
    expect(await other.auth.user(get('/admin', cookie))).toBeNull();
  });

  it('accepts sessions signed with an older key while rotating', async () => {
    const s = setup();
    const cookie = cookiesOf((await signInByCode(s))!);
    const rotated = setup({ secret: ['the-new-secret-that-is-long-enough-789', SECRET] });
    expect(await rotated.auth.user(get('/admin', cookie))).toEqual({ email: 'ada@example.com' });
  });

  it('require throws 401 when signed out, 403 for cross-site posts', async () => {
    const s = setup();
    const cookie = cookiesOf((await signInByCode(s))!);
    await expect(s.auth.require(post('/_server'))).rejects.toMatchObject({ status: 401 });
    await expect(s.auth.require(post('/_server', {}, { cookie, origin: 'https://evil.test' }))).rejects.toMatchObject({ status: 403 });
    await expect(s.auth.require(post('/_server', {}, { cookie, origin: '', 'sec-fetch-site': 'cross-site' }))).rejects.toMatchObject({ status: 403 });
  });

  it('signs out by clearing the cookie', async () => {
    const s = setup();
    const response = await s.auth.handle(post('/admin/auth/sign-out'));
    expect(location(response).pathname).toBe('/admin/sign-in');
    expect(response!.headers.getSetCookie()[0]).toMatch(/^mortar_session=; Path=\/; Max-Age=0/);
    expect((await s.auth.handle(get('/admin/auth/sign-out')))?.status).toBe(405);
  });

  it('refuses cross-site posts to its routes', async () => {
    const s = setup();
    const response = await s.auth.handle(post('/admin/auth/email', { email: 'ada@example.com' }, { origin: 'https://evil.test' }));
    expect(response?.status).toBe(403);
    expect(s.sent).toEqual([]);
  });

  it('only returns to paths on this site', async () => {
    const s = setup();
    for (const [returnTo, expected] of [
      ['/admin?collection=posts', '/admin?collection=posts'],
      ['//evil.test/x', '/admin'],
      ['https://evil.test', '/admin'],
      ['/\\evil.test', '/admin'],
      ['/admin/auth/sign-out', '/admin'],
    ] as const) {
      await s.auth.handle(post('/admin/auth/email', { email: 'ada@example.com', returnTo }));
      const code = /is (\d{6})/.exec(s.sent.at(-1)!.text)![1]!;
      const response = await s.auth.handle(post('/admin/auth/email/callback', { email: 'ada@example.com', code, returnTo }));
      expect(location(response).pathname + location(response).search).toBe(expected);
      s.sent.length = 0;
      await s.store.remove(EMAIL_TOKENS_COLLECTION, (await s.store.list(EMAIL_TOKENS_COLLECTION) as { slug: string }[])[0]?.slug ?? '');
    }
  });
});

describe('email()', () => {
  it('sends one email with a code and a link to the sign-in page', async () => {
    const s = setup();
    const response = await s.auth.handle(post('/admin/auth/email', { email: ' Ada@Example.com ' }));
    expect(location(response).pathname).toBe('/admin/sign-in');
    expect(Object.fromEntries(location(response).searchParams)).toEqual({ method: 'email', sent: 'ada@example.com', returnTo: '/admin' });
    expect(s.sent).toHaveLength(1);
    const [message] = s.sent;
    expect(message!.to).toBe('ada@example.com');
    expect(message!.subject).toMatch(/^Your sign-in code for Test site: \d{6}$/);
    const link = new URL(/(http\S+)/.exec(message!.text)![1]!);
    expect(link.pathname).toBe('/admin/sign-in');
    expect(link.searchParams.get('email')).toBe('ada@example.com');
    expect(link.searchParams.get('token')).toMatch(/^[\w-]{43}$/);
    // Only hashes are stored.
    const stored = JSON.stringify(await s.store.list(EMAIL_TOKENS_COLLECTION));
    expect(stored).not.toContain(link.searchParams.get('token'));
    expect(stored).not.toContain('ada@example.com');
  });

  it('signs in with the link, once, when the page posts it', async () => {
    const s = setup();
    await s.auth.handle(post('/admin/auth/email', { email: 'ada@example.com' }));
    const link = new URL(/(http\S+)/.exec(s.sent[0]!.text)![1]!);
    const form = { email: link.searchParams.get('email')!, token: link.searchParams.get('token')! };
    // Opening the callback directly (a mail scanner) does nothing.
    expect(location(await s.auth.handle(get(`/admin/auth/email/callback?${new URLSearchParams(form)}`))).searchParams.get('error')).toBe('invalid');
    const response = await s.auth.handle(post('/admin/auth/email/callback', form));
    expect(response!.headers.getSetCookie()[0]).toMatch(/^mortar_session=/);
    const again = await s.auth.handle(post('/admin/auth/email/callback', form));
    expect(location(again).searchParams.get('error')).toBe('expired');
  });

  it("says the same to strangers but sends them nothing", async () => {
    const s = setup();
    const response = await s.auth.handle(post('/admin/auth/email', { email: 'eve@example.com' }));
    expect(location(response).searchParams.get('sent')).toBe('eve@example.com');
    expect(s.sent).toEqual([]);
  });

  it('rejects addresses that are not addresses', async () => {
    const s = setup();
    const response = await s.auth.handle(post('/admin/auth/email', { email: 'nope' }));
    expect(location(response).searchParams.get('error')).toBe('invalid-email');
  });

  it("doesn't resend within a minute", async () => {
    const s = setup();
    await s.auth.handle(post('/admin/auth/email', { email: 'ada@example.com' }));
    await s.auth.handle(post('/admin/auth/email', { email: 'ada@example.com' }));
    expect(s.sent).toHaveLength(1);
  });

  it('allows a few wrong codes, then drops the sign-in', async () => {
    const s = setup();
    await s.auth.handle(post('/admin/auth/email', { email: 'ada@example.com' }));
    const code = /is (\d{6})/.exec(s.sent[0]!.text)![1]!;
    const wrong = code === '000000' ? '111111' : '000000';
    const errors = [];
    for (let i = 0; i < 5; i++) errors.push(location(await s.auth.handle(post('/admin/auth/email/callback', { email: 'ada@example.com', code: wrong }))).searchParams.get('error'));
    expect(errors).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'expired']);
    const response = await s.auth.handle(post('/admin/auth/email/callback', { email: 'ada@example.com', code }));
    expect(location(response).searchParams.get('error')).toBe('expired');
  });

  it('expires codes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const s = setup();
      await s.auth.handle(post('/admin/auth/email', { email: 'ada@example.com' }));
      const code = /is (\d{6})/.exec(s.sent[0]!.text)![1]!;
      vi.setSystemTime(Date.now() + 16 * 60_000);
      const response = await s.auth.handle(post('/admin/auth/email/callback', { email: 'ada@example.com', code }));
      expect(location(response).searchParams.get('error')).toBe('expired');
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells the person when the email could not be sent', async () => {
    const store = createMemoryStore();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const auth = createAuth({
      methods: [email({ store, mailer: { send: () => Promise.reject(new Error('SMTP down')) } })],
      authorize: allowEmails(['ada@example.com']),
      secret: SECRET,
    });
    const response = await auth.handle(post('/admin/auth/email', { email: 'ada@example.com' }));
    expect(location(response).searchParams.get('error')).toBe('failed');
    expect(await store.list(EMAIL_TOKENS_COLLECTION)).toEqual([]);
    error.mockRestore();
  });
});

describe('google()', () => {
  const idToken = (claims: Record<string, unknown>) =>
    `x.${btoa(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'client-1', exp: Date.now() / 1000 + 600, email_verified: true, ...claims })).replace(/=+$/, '')}.sig`;

  /** Starts the flow; returns the state cookie and the authorize URL. */
  async function start(s: ReturnType<typeof setup>, returnTo?: string) {
    const response = await s.auth.handle(post('/admin/auth/google', returnTo ? { returnTo } : {}));
    return { cookie: cookiesOf(response!), url: location(response) };
  }

  it('redirects to Google with PKCE and a state', async () => {
    const s = setup();
    const { cookie, url } = await start(s);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('redirect_uri')).toBe('http://site.test/admin/auth/google/callback');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(cookie).toMatch(/^mortar_session_google=/);
  });

  it('swaps the code for an ID token and signs in', async () => {
    const s = setup();
    const { cookie, url } = await start(s, '/admin?collection=posts');
    s.tokenFetch.mockResolvedValue(Response.json({ id_token: idToken({ email: 'Grace@Team.test', name: 'Grace' }) }));
    const response = await s.auth.handle(get(`/admin/auth/google/callback?code=abc&state=${url.searchParams.get('state')}`, cookie));
    expect(location(response).pathname + location(response).search).toBe('/admin?collection=posts');
    const body = s.tokenFetch.mock.calls[0]![1]!.body as URLSearchParams;
    expect(body.get('code')).toBe('abc');
    expect(body.get('code_verifier')).toHaveLength(64);
    expect(await s.auth.user(get('/admin', cookiesOf(response!)))).toEqual({ email: 'grace@team.test', name: 'Grace' });
  });

  it('refuses a wrong state, a missing cookie, unverified emails and strangers', async () => {
    const s = setup();
    const { cookie, url } = await start(s);
    const state = url.searchParams.get('state');
    const error = async (query: string, c = cookie) => location(await s.auth.handle(get(`/admin/auth/google/callback?${query}`, c))).searchParams.get('error');
    expect(await error('code=abc&state=wrong')).toBe('invalid');
    expect(await error(`code=abc&state=${state}`, '')).toBe('expired');
    expect(await error(`error=access_denied&state=${state}`)).toBe('denied');
    s.tokenFetch.mockResolvedValueOnce(Response.json({ id_token: idToken({ email: 'ada@example.com', email_verified: false }) }));
    expect(await error(`code=abc&state=${state}`)).toBe('denied');
    s.tokenFetch.mockResolvedValueOnce(Response.json({ id_token: idToken({ email: 'ada@example.com', aud: 'someone-else' }) }));
    expect(await error(`code=abc&state=${state}`)).toBe('denied');
    s.tokenFetch.mockResolvedValueOnce(Response.json({ id_token: idToken({ email: 'eve@example.com' }) }));
    expect(await error(`code=abc&state=${state}`)).toBe('denied');
  });
});

describe('createSealer', () => {
  it('opens what it sealed until it expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const sealer = createSealer(SECRET);
      const token = await sealer.seal({ a: 1 }, 60);
      expect(await sealer.open(token)).toEqual({ a: 1 });
      vi.setSystemTime(Date.now() + 61_000);
      expect(await sealer.open(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores junk', async () => {
    const sealer = createSealer(SECRET);
    for (const junk of ['', 'a', 'a.b', 'a.b.c', '!!.??']) expect(await sealer.open(junk)).toBeNull();
  });
});

describe('allowEmails', () => {
  it('matches addresses and domains, ignoring case', () => {
    const authorize = allowEmails(['Ada@Example.com', '*@team.test']);
    const check = (address: string) => authorize({ identity: { email: address, method: 'x' }, request: get('/') });
    expect(check('ADA@example.com')).toEqual({ email: 'ada@example.com' });
    expect(check('grace@team.test')).toEqual({ email: 'grace@team.test' });
    expect(check('eve@example.com')).toBeNull();
    expect(check('eve@evilteam.test')).toBeNull();
    expect(() => allowEmails(['*.example.com'])).toThrow();
  });
});
