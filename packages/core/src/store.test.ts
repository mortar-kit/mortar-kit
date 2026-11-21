// Content stores: the in-memory store and the JSON-file store (real I/O
// against a temp dir). The rules on top are in content.test.ts.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isValidSlug, type Doc } from './doc.ts';
import { createJsonFileStore } from './server.ts';
import { createMemoryStore } from './store.ts';

const doc = (slug = 'home'): Doc => ({ id: `id-${slug}`, slug, fields: { title: 'Home' }, entries: [{ brick: 'heading', id: 'a', data: { text: 'Hi' } }] });

describe('isValidSlug', () => {
  it('accepts lowercase words joined by dashes and rejects everything else', () => {
    expect(['home', 'about-us', 'page-2'].every(isValidSlug)).toBe(true);
    expect(['', 'Home', '../etc/passwd', 'a/b', 'a--b', '-a', 'a-', 'a.json', 'a b'].some(isValidSlug)).toBe(false);
  });
});

describe('createMemoryStore', () => {
  it('copies documents in and out, per collection', async () => {
    const source = doc();
    const store = createMemoryStore({ pages: [source] });
    source.fields.title = 'Changed';
    const got = (await store.get('pages', 'home')) as Doc;
    expect(got.fields.title).toBe('Home');
    got.fields.title = 'Changed';
    expect(((await store.get('pages', 'home')) as Doc).fields.title).toBe('Home');
    expect(await store.get('pages', 'missing')).toBeUndefined();
    expect(await store.list('posts')).toEqual([]);
    await store.put('pages', doc('about'));
    expect(((await store.list('pages')) as Doc[]).map((d) => d.slug).sort()).toEqual(['about', 'home']);
    await store.remove('pages', 'home');
    await store.remove('pages', 'never');
    expect(((await store.list('pages')) as Doc[]).map((d) => d.slug)).toEqual(['about']);
  });
});

describe('createJsonFileStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mortar-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps one pretty-printed file per document, without the slug inside', async () => {
    const store = createJsonFileStore({ dir });
    expect(await store.get('pages', 'home')).toBeUndefined();
    expect(await store.list('pages')).toEqual([]);
    await store.put('pages', doc());
    const { slug: _, ...stored } = doc();
    expect(await readFile(join(dir, 'pages', 'home.json'), 'utf8')).toBe(`${JSON.stringify(stored, null, 2)}\n`);
    expect(await store.get('pages', 'home')).toEqual(doc());
    expect(await store.list('pages')).toEqual([doc()]);
  });

  it('takes the slug from the file name', async () => {
    await mkdir(join(dir, 'pages'));
    await writeFile(join(dir, 'pages', 'about.json'), JSON.stringify({ slug: 'other', fields: {} }));
    expect(await createJsonFileStore({ dir }).get('pages', 'about')).toEqual({ slug: 'about', fields: {} });
  });

  it('replaces atomically, removes, and leaves no temp files behind', async () => {
    const store = createJsonFileStore({ dir });
    await store.put('pages', doc());
    await store.put('pages', { ...doc(), fields: { title: 'Again' } });
    expect(((await store.get('pages', 'home')) as Doc).fields.title).toBe('Again');
    expect(await readdir(join(dir, 'pages'))).toEqual(['home.json']);
    await store.remove('pages', 'home');
    await store.remove('pages', 'home');
    expect(await readdir(join(dir, 'pages'))).toEqual([]);
  });

  it('lists valid slugs only, and skips a file it cannot parse', async () => {
    const store = createJsonFileStore({ dir });
    await store.put('pages', doc('home'));
    await store.put('pages', doc('about'));
    await writeFile(join(dir, 'pages', 'notes.txt'), '');
    await writeFile(join(dir, 'pages', 'Bad Name.json'), '{}');
    await writeFile(join(dir, 'pages', 'broken.json'), '{ nope');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(((await store.list('pages')) as Doc[]).map((d) => d.slug)).toEqual(['about', 'home']);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
    await expect(store.get('pages', 'broken')).rejects.toThrow(SyntaxError);
  });

  it('rejects collection names and slugs that could escape the directory', async () => {
    const store = createJsonFileStore({ dir });
    await expect(store.get('pages', '../secret')).rejects.toThrow('invalid slug');
    await expect(store.put('pages', doc('a/b'))).rejects.toThrow('invalid slug');
    await expect(store.list('../etc')).rejects.toThrow('invalid collection name');
    await expect(store.remove('Pages', 'home')).rejects.toThrow('invalid collection name');
  });
});
