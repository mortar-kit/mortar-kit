// authFromEnv (what it builds from which variables, and what it refuses in
// production), resendMailer's request, and allowMembers over a collection.
import { createContent, createMemoryStore, defineCollection, fields } from '@mortar-kit/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthorizeInput } from './auth.ts';
import { authFromEnv } from './env.ts';
import { allowMembers } from './members.ts';
import { resendMailer } from './resend.ts';

const SECRET = 'a-test-secret-that-is-long-enough-123';
const identity = (email: string, name?: string): AuthorizeInput => ({
  identity: { email, method: 'email', ...(name ? { name } : {}) },
  request: new Request('http://site.test/admin'),
});

describe('authFromEnv', () => {
  it('builds Google and email sign-in from the environment', () => {
    const auth = authFromEnv({
      dev: false,
      store: createMemoryStore(),
      env: {
        MORTAR_AUTH_SECRET: SECRET,
        MORTAR_ADMINS: 'ada@example.com',
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'shh',
        RESEND_API_KEY: 're_test',
        MORTAR_EMAIL_FROM: 'Site <admin@example.com>',
      },
    });
    expect(auth.methods.map((m) => m.id)).toEqual(['google', 'email']);
  });

  it('falls back to a dev secret, admin and console mailer in development', async () => {
    const auth = authFromEnv({ dev: true, store: createMemoryStore(), env: {} });
    expect(auth.methods.map((m) => m.id)).toEqual(['email']);
  });

  it('refuses to start in production without a secret, admins or a method', () => {
    const store = createMemoryStore();
    expect(() => authFromEnv({ dev: false, store, env: { MORTAR_ADMINS: 'a@b.co' } })).toThrow(/MORTAR_AUTH_SECRET/);
    expect(() => authFromEnv({ dev: false, store, env: { MORTAR_AUTH_SECRET: SECRET } })).toThrow(/MORTAR_ADMINS/);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => authFromEnv({ dev: false, store, env: { MORTAR_AUTH_SECRET: SECRET, MORTAR_ADMINS: 'a@b.co' } })).toThrow(/no way to sign in/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('email sign-in is off'));
    warn.mockRestore();
  });

  it('catches half-set variable pairs', () => {
    const env = { MORTAR_AUTH_SECRET: SECRET, MORTAR_ADMINS: 'a@b.co' };
    expect(() => authFromEnv({ dev: false, env: { ...env, GOOGLE_CLIENT_ID: 'id' } })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(() => authFromEnv({ dev: false, store: createMemoryStore(), env: { ...env, RESEND_API_KEY: 're_x' } })).toThrow(/MORTAR_EMAIL_FROM/);
  });

  it('lets options win over the environment', async () => {
    const authorize = vi.fn(() => ({ id: 1 }));
    const auth = authFromEnv({ dev: false, secret: SECRET, authorize, mailer: { send: async () => {} }, store: createMemoryStore(), env: {} });
    expect(auth.methods.map((m) => m.id)).toEqual(['email']);
    expect(await auth.user(new Request('http://site.test/'))).toBeNull();
  });
});

describe('resendMailer', () => {
  it('posts the message to Resend', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{"id":"1"}'));
    await resendMailer({ apiKey: 're_key', from: 'Site <a@example.com>', fetch }).send({ to: 'ada@example.com', subject: 'Hi', text: 'Hello' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer re_key');
    expect(JSON.parse(init!.body as string)).toEqual({ from: 'Site <a@example.com>', to: ['ada@example.com'], subject: 'Hi', text: 'Hello' });
  });

  it('sends replyTo as reply_to', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{"id":"1"}'));
    await resendMailer({ apiKey: 'k', from: 'f', fetch }).send({ to: 'a@b.co', subject: 's', text: 't', replyTo: 'ada@example.com' });
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toMatchObject({ reply_to: 'ada@example.com' });
  });

  it('throws when Resend refuses', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('bad from', { status: 422 }));
    await expect(resendMailer({ apiKey: 'k', from: 'f', fetch }).send({ to: 'a@b.co', subject: 's', text: 't' })).rejects.toThrow(/422.*bad from/);
  });
});

describe('allowMembers', () => {
  const members = defineCollection({
    name: 'members',
    label: 'Members',
    fields: { email: fields.text({ label: 'Email' }), name: fields.text({ label: 'Name' }) },
  });

  it('lets in addresses found in the collection, with their stored name', async () => {
    const content = createContent({ store: createMemoryStore(), collections: [members], bricks: [] });
    await content.save('members', { id: 'm1', slug: 'ada', fields: { email: ' Ada@Example.com ', name: 'Ada L.' } });
    const authorize = allowMembers({ content, collection: 'members' });
    expect(await authorize(identity('ada@example.com', 'Ada'))).toEqual({ email: 'ada@example.com', name: 'Ada L.' });
    expect(await authorize(identity('eve@example.com'))).toBeNull();
  });

  it('puts the fields asked for on the user', async () => {
    const content = createContent({ store: createMemoryStore(), collections: [members], bricks: [] });
    await content.save('members', { id: 'm1', slug: 'ada', fields: { email: 'ada@example.com', role: 'owner' } });
    await content.save('members', { id: 'm2', slug: 'bo', fields: { email: 'bo@example.com' } });
    const authorize = allowMembers({ content, collection: 'members', fields: ['role'] });
    const ada = await authorize(identity('ada@example.com'));
    expect(ada).toEqual({ email: 'ada@example.com', role: 'owner' });
    expect(ada?.role).toBe('owner');
    expect(await authorize(identity('bo@example.com', 'Bo'))).toEqual({ email: 'bo@example.com', name: 'Bo' });
  });
});
