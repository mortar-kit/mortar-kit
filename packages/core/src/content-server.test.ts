// createContentServer and contentClient: reads open, writes behind auth
// (checked against the request in flight), uploads as form data, list
// options that arrive as null (a GET sends a trailing undefined as null),
// and the client dropping cached reads only after writes that went through.
import { createRequestEvent, isResponseEnvelope } from '@solidjs/web';
import { provideRequestEvent } from '@solidjs/web/storage';
import { describe, expect, it, vi } from 'vitest';

import { createMemoryBlobStore } from './assets.ts';
import { defineCollection } from './collection.ts';
import { contentClient } from './content-client.ts';
import { createContentServer, type ContentServer } from './content-server.ts';
import { fields } from './fields.ts';
import { createContent, createMemoryStore, type ListOptions } from './store.ts';

const posts = defineCollection({ name: 'posts', label: 'Posts', fields: { title: fields.text({ label: 'Title' }) }, sort: { field: 'title' } });

function setup() {
  const content = createContent({ store: createMemoryStore(), blobs: createMemoryBlobStore(), collections: [posts], bricks: [] });
  const auth = {
    async require(request: Request) {
      if (request.headers.get('cookie') !== 'session=ok') throw new Response('Sign in required', { status: 401 });
      return { email: 'admin@example.com' };
    },
  };
  return { content, server: createContentServer({ content, auth }) };
}

/**
 * Runs `fn` as if handling a request, signed in or not, and unwraps the
 * value a write answers with (`respond` wraps it with its headers).
 */
const as = async <T>(signedIn: boolean, fn: () => Promise<T>): Promise<T> => {
  const request = new Request('http://site.test/_server', { headers: signedIn ? { cookie: 'session=ok' } : {} });
  const result: unknown = await provideRequestEvent(createRequestEvent(request), fn);
  return (isResponseEnvelope(result) ? result.value : result) as T;
};

const doc = (title: string, slug = title.toLowerCase()) => ({ id: `p-${title.toLowerCase()}`, slug, fields: { title } });

describe('createContentServer', () => {
  it('saves for a signed-in editor and refuses anyone else', async () => {
    const { server } = setup();
    await expect(as(false, () => server.save('posts', doc('Hello')))).rejects.toMatchObject({ status: 401 });
    await expect(server.save('posts', doc('Hello'))).rejects.toMatchObject({ status: 401 }); // no request at all
    expect(await server.list('posts')).toEqual([]);
    const saved = await as(true, () => server.save('posts', doc('Hello')));
    expect(saved.ok).toBe(true);
    expect((await server.list('posts')).map((d) => d.slug)).toEqual(['hello']);
  });

  it('reads without signing in, and takes null list options', async () => {
    const { server } = setup();
    await as(true, () => server.save('posts', doc('B')));
    await as(true, () => server.save('posts', doc('A')));
    expect((await server.list('posts', null as unknown as ListOptions)).map((d) => d.slug)).toEqual(['a', 'b']);
    expect((await server.list('posts', { limit: 1 })).map((d) => d.slug)).toEqual(['a']);
    expect((await server.get('posts', { slug: 'b' }))?.fields.title).toBe('B');
  });

  it('uploads a file sent as form data, with its details', async () => {
    const { server } = setup();
    const form = new FormData();
    form.set('file', new File([new Uint8Array(4)], 'Photo.png', { type: 'image/png' }));
    form.set('alt', 'A photo');
    await expect(as(false, () => server.uploadAsset(form))).rejects.toMatchObject({ status: 401 });
    const result = await as(true, () => server.uploadAsset(form));
    expect(result.ok).toBe(true);
    const [asset] = await server.listAssets();
    expect(asset?.alt).toBe('A photo');
    expect(await as(true, () => server.uploadAsset(new FormData()))).toEqual({ ok: false, message: 'Not a file' });
  });

  it('asks canWrite about each write, with the user and what it touches', async () => {
    const content = createContent({ store: createMemoryStore(), blobs: createMemoryBlobStore(), collections: [posts], bricks: [] });
    const seen: unknown[] = [];
    const server = createContentServer({
      content,
      auth: { require: async () => ({ email: 'ed@example.com', role: 'editor' }) },
      canWrite: ({ user, ...write }) => {
        seen.push(write);
        return user.role === 'owner' || write.collection !== 'posts';
      },
    });
    await expect(as(true, () => server.save('posts', doc('Hello')))).rejects.toMatchObject({ status: 403 });
    expect(await server.list('posts')).toEqual([]);
    await expect(as(true, () => server.remove('posts', 'p-x'))).rejects.toMatchObject({ status: 403 });
    await expect(as(true, () => server.removeAssetFolder('f1'))).resolves.toBeUndefined();
    expect(seen).toEqual([
      { action: 'save', collection: 'posts', id: 'p-hello', doc: doc('Hello'), stored: null },
      { action: 'remove', collection: 'posts', id: 'p-x', stored: null },
      { action: 'removeAssetFolder', id: 'f1' },
    ]);
    const refused = await as(true, () => server.save('posts', doc('Hello'))).catch((error: Response) => error.text());
    expect(refused).toBe('Not allowed');
  });

  it("checks the collection's own canWrite too, with the stored document", async () => {
    const projects = defineCollection({
      name: 'projects',
      fields: { title: fields.text({ label: 'Title' }), members: fields.text({ label: 'Members' }) },
      canWrite: ({ user, stored, doc: sent }) => {
        const mine = (fields: Record<string, unknown>) => String(fields.members).split(',').includes(user.email);
        return (!stored || mine(stored.fields)) && (!sent || mine(sent.fields));
      },
    });
    const content = createContent({ store: createMemoryStore(), collections: [projects, posts], bricks: [] });
    let serverAllows = true;
    const server = createContentServer({
      content,
      auth: { require: async () => ({ email: 'ada' }) },
      canWrite: () => serverAllows,
    });
    const project = (members: string) => ({ id: 'pr1', slug: 'roof', fields: { title: 'Roof', members } });
    expect((await as(true, () => server.save('projects', project('ada,bo')))).ok).toBe(true);
    // Someone else's project, or taking ada out of hers, is refused.
    await expect(as(true, () => server.save('projects', { ...project('bo'), id: 'pr2', slug: 'shed' }))).rejects.toMatchObject({ status: 403 });
    await expect(as(true, () => server.save('projects', project('bo')))).rejects.toMatchObject({ status: 403 });
    expect((await as(true, () => server.save('projects', project('ada,cy')))).ok).toBe(true);
    // Both must allow: the server's rule refuses even her own project.
    serverAllows = false;
    await expect(as(true, () => server.remove('projects', 'pr1'))).rejects.toMatchObject({ status: 403 });
    serverAllows = true;
    expect((await as(true, () => server.remove('projects', 'pr1'))).ok).toBe(true);
    // Collections without a rule follow the server's alone.
    expect((await as(true, () => server.save('posts', doc('Hi')))).ok).toBe(true);
  });

  it('leaves writes open with auth: false', async () => {
    const content = createContent({ store: createMemoryStore(), collections: [posts], bricks: [] });
    const server = createContentServer({ content, auth: false });
    expect((await server.save('posts', doc('Open'))).ok).toBe(true);
    expect(await server.listAssets()).toEqual([]);
    expect(await server.listAssetFolders()).toEqual([]);
  });
});

describe('contentClient', () => {
  it('wraps reads, caches the source and drops the cache after writes that went through', async () => {
    const { server } = setup();
    const signedInServer = Object.fromEntries(
      Object.entries(server).map(([name, fn]) => [name, (...args: never[]) => as(true, () => (fn as (...a: never[]) => Promise<unknown>)(...args))]),
    ) as unknown as ContentServer;
    const read = vi.fn((fn: unknown) => fn);
    const cache = vi.fn((fn: unknown, _key: string) => fn);
    const onWrite = vi.fn();
    const client = contentClient(signedInServer, { read, cache, onWrite });
    expect(read).toHaveBeenCalledTimes(4); // list, get, listAssets, listAssetFolders
    expect(cache.mock.calls.map((call) => call[1])).toEqual(['mortar-docs', 'mortar-doc']);

    expect((await client.content.save('posts', doc('Hi'))).ok).toBe(true);
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect((await client.content.save('posts', doc('Again', 'hi'))).ok).toBe(false); // slug taken
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect((await client.source.list('posts')).map((d) => d.slug)).toEqual(['hi']);

    const upload = await client.content.assets?.upload(new File([new Uint8Array(4)], 'a.png', { type: 'image/png' }), { title: 'A' });
    expect(upload?.ok).toBe(true);
    expect(onWrite).toHaveBeenCalledTimes(2);
    expect((await client.freshSource.list('posts', { limit: 1 })).length).toBe(1);
  });
});
