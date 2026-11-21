// Page stores: the in-memory store, the JSON-file store (real I/O against a
// temp dir) and the load/save helpers that normalize and validate.
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createJsonFileStore } from './server.ts';
import { createMemoryStore, isValidSlug, loadPage, savePage } from './store.ts';
import { bricks, page } from './test/bricks.ts';

describe('isValidSlug', () => {
  it('accepts lowercase words joined by dashes and rejects everything else', () => {
    expect(['home', 'about-us', 'page-2'].every(isValidSlug)).toBe(true);
    expect(['', 'Home', '../etc/passwd', 'a/b', 'a--b', '-a', 'a-', 'a.json', 'a b'].some(isValidSlug)).toBe(false);
  });
});

describe('createMemoryStore', () => {
  it('copies pages in and out', async () => {
    const source = page();
    const store = createMemoryStore({ home: source });
    source.entries.length = 0;
    const loaded = await store.load('home');
    expect(loaded?.entries).toHaveLength(2);
    loaded!.entries.length = 0;
    expect((await store.load('home'))?.entries).toHaveLength(2);
    expect(await store.load('missing')).toBeUndefined();
    await store.save('about', page());
    expect(await store.list?.()).toEqual(['about', 'home']);
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

  it('round-trips pages as pretty-printed JSON files', async () => {
    const store = createJsonFileStore({ dir: join(dir, 'pages') });
    expect(await store.load('home')).toBeUndefined();
    expect(await store.list?.()).toEqual([]);

    await store.save('home', page());
    expect(await store.load('home')).toEqual(page());
    const text = await readFile(join(dir, 'pages', 'home.json'), 'utf8');
    expect(text).toBe(`${JSON.stringify(page(), null, 2)}\n`);
  });

  it('replaces atomically and leaves no temp files behind', async () => {
    const store = createJsonFileStore({ dir });
    await store.save('home', page());
    await store.save('home', { entries: [] });
    expect(await store.load('home')).toEqual({ entries: [] });
    expect(await readdir(dir)).toEqual(['home.json']);
  });

  it('lists stored slugs, ignoring other files', async () => {
    const store = createJsonFileStore({ dir });
    await store.save('home', page());
    await store.save('about', page());
    await writeFile(join(dir, 'notes.txt'), '');
    await writeFile(join(dir, 'Bad Name.json'), '{}');
    expect(await store.list?.()).toEqual(['about', 'home']);
  });

  it('rejects slugs that could escape the directory', async () => {
    const store = createJsonFileStore({ dir });
    await expect(store.load('../secret')).rejects.toThrow('invalid page slug');
    await expect(store.save('a/b', page())).rejects.toThrow('invalid page slug');
  });

  it('surfaces malformed JSON', async () => {
    await writeFile(join(dir, 'home.json'), '{ nope');
    await expect(createJsonFileStore({ dir }).load('home')).rejects.toThrow(SyntaxError);
  });
});

describe('loadPage / savePage', () => {
  it('normalizes on load', async () => {
    const store = createMemoryStore({ home: page() });
    expect((await loadPage(store, bricks, 'home'))?.entries[0]?.data).toEqual({ text: 'First', size: 2 });
    expect(await loadPage(store, bricks, 'missing')).toBeUndefined();
    expect(await loadPage(store, bricks, '../x')).toBeUndefined();
  });

  it('saves only valid pages and reports issues otherwise', async () => {
    const store = createMemoryStore();
    const bad = { entries: [{ brick: 'heading', id: 'a', data: { text: '' } }] };
    expect(await savePage(store, bricks, 'home', bad)).toEqual({
      ok: false,
      issues: [{ entryId: 'a', path: ['text'], message: 'Text is required' }],
    });
    expect(await store.load('home')).toBeUndefined();

    expect(await savePage(store, bricks, 'home', page())).toEqual({ ok: true });
    expect((await store.load('home'))?.entries[0]?.data).toEqual({ text: 'First', size: 2 });
    expect(await savePage(store, bricks, 'Bad', page())).toEqual({ ok: false, issues: [{ path: [], message: 'Invalid page slug "Bad"' }] });
  });
});
