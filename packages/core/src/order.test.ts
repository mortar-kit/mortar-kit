// Manual ordering: an `orderable` collection lists documents in the order
// editors give them (`Content.move`), puts new documents at the end, keeps
// the order across saves and renames, and gives documents stored before it
// was orderable a place. Run over the memory store and the JSON-file store.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineCollection } from './collection.ts';
import type { Doc } from './doc.ts';
import { fields } from './fields.ts';
import { createJsonFileStore } from './server.ts';
import { createContent, createMemoryStore, type ContentStore } from './store.ts';

const photos = defineCollection({
  name: 'photos',
  label: 'Photos',
  fields: { caption: fields.text({ label: 'Caption', required: true }) },
  orderable: true,
});

const notes = defineCollection({
  name: 'notes',
  fields: { text: fields.text({ label: 'Text' }) },
});

const photo = (slug: string, position?: number): Doc => ({
  id: `id-${slug}`,
  slug,
  ...(position === undefined ? {} : { position }),
  fields: { caption: slug },
});

function setup(store: ContentStore) {
  const content = createContent({ store, collections: [photos, notes], bricks: [] });
  const slugs = async (options?: Parameters<typeof content.list>[1]) => (await content.list('photos', options)).map((d) => d.slug);
  return { content, slugs };
}

describe('defineCollection orderable', () => {
  it('is off unless asked for', () => {
    expect(photos.orderable).toBe(true);
    expect(notes.orderable).toBe(false);
  });
});

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mortar-order-'));
  dirs.push(dir);
  return dir;
};

describe.each([
  ['the memory store', async () => createMemoryStore()],
  ['the JSON-file store', async () => createJsonFileStore({ dir: await tempDir() })],
])('manual order over %s', (_, makeStore) => {
  let store: ContentStore;
  beforeEach(async () => {
    store = await makeStore();
  });

  it('puts new documents at the end and lists in manual order', async () => {
    const { content, slugs } = setup(store);
    for (const slug of ['zebra', 'apple', 'mango']) expect(await content.save('photos', photo(slug))).toEqual({ ok: true });
    expect(await slugs()).toEqual(['zebra', 'apple', 'mango']);
    expect((await content.list('photos')).map((d) => d.position)).toEqual([1, 2, 3]);
  });

  it('moves a document, writing only the documents whose position changes', async () => {
    const { content, slugs } = setup(store);
    for (const slug of ['a', 'b', 'c', 'd']) await content.save('photos', photo(slug));
    await content.move('photos', 'id-d', 0);
    expect(await slugs()).toEqual(['d', 'a', 'b', 'c']);
    const puts = vi.spyOn(store, 'put');
    await content.move('photos', 'id-a', 2);
    expect(await slugs()).toEqual(['d', 'b', 'a', 'c']);
    expect(puts.mock.calls.map(([, doc]) => [doc.slug, doc.position])).toEqual([
      ['b', 2],
      ['a', 3],
    ]);
    // Past either end: to that end.
    await content.move('photos', 'id-b', 99);
    await content.move('photos', 'id-c', -5);
    expect(await slugs()).toEqual(['c', 'd', 'a', 'b']);
  });

  it('keeps the stored position when a document is saved again, whatever the client sends', async () => {
    const { content, slugs } = setup(store);
    for (const slug of ['a', 'b', 'c']) await content.save('photos', photo(slug));
    await content.move('photos', 'id-c', 0);
    // A stale editor still holding the old position, and a rename.
    const stale = { ...photo('a', 1), slug: 'a-renamed', position: 1, fields: { caption: 'Renamed' } };
    expect(await content.save('photos', stale)).toEqual({ ok: true });
    expect(await slugs()).toEqual(['c', 'a-renamed', 'b']);
    expect((await content.get('photos', { id: 'id-a' }))?.position).toBe(2);
  });

  it('lets an explicit sort override the manual order', async () => {
    const { content, slugs } = setup(store);
    for (const slug of ['b', 'c', 'a']) await content.save('photos', photo(slug));
    expect(await slugs({ sort: { field: 'slug' } })).toEqual(['a', 'b', 'c']);
    expect(await slugs({ sort: { field: 'caption', order: 'desc' } })).toEqual(['c', 'b', 'a']);
    expect(await slugs({ limit: 2 })).toEqual(['b', 'c']);
  });

  it('gives documents stored without a position a place, in their current order, on the first save or move', async () => {
    for (const slug of ['c', 'a', 'b']) await store.put('photos', photo(slug));
    await store.put('photos', photo('z', 1));
    const { content, slugs } = setup(store);
    // Positioned first, then the rest by the collection's sort (the title field).
    expect(await slugs()).toEqual(['z', 'a', 'b', 'c']);
    // Editing one keeps its place.
    expect(await content.save('photos', { ...photo('b'), fields: { caption: 'B!' } })).toEqual({ ok: true });
    expect(await slugs()).toEqual(['z', 'a', 'b', 'c']);
    expect((await content.list('photos')).map((d) => d.position)).toEqual([1, 2, 3, 4]);
    // A new one goes last.
    await content.save('photos', photo('new'));
    expect(await slugs()).toEqual(['z', 'a', 'b', 'c', 'new']);
  });

  it('refuses to move in a collection that is not orderable, by a bad index or an unknown id', async () => {
    const { content } = setup(store);
    await content.save('photos', photo('a'));
    expect(() => content.move('notes', 'x', 0)).toThrow('notes is not orderable');
    expect(() => content.move('photos', 'id-a', 1.5)).toThrow('index must be an integer');
    await expect(content.move('photos', 'nope', 0)).rejects.toThrow('No document in Photos has the id "nope"');
  });

  it('leaves collections that are not orderable as they were', async () => {
    const { content } = setup(store);
    await content.save('notes', { id: 'n2', slug: 'second', fields: { text: 'B' } });
    await content.save('notes', { id: 'n1', slug: 'first', fields: { text: 'A' } });
    const listed = await content.list('notes');
    expect(listed.map((d) => d.slug)).toEqual(['first', 'second']);
    expect(listed.every((d) => d.position === undefined)).toBe(true);
  });
});

describe('manual order in JSON files', () => {
  it('stores the position in each file, so the order survives a restart and hand-written files fit in', async () => {
    const dir = await tempDir();
    const first = setup(createJsonFileStore({ dir }));
    for (const slug of ['a', 'b']) await first.content.save('photos', photo(slug));
    await first.content.move('photos', 'id-b', 0);
    const file = JSON.parse(await readFile(join(dir, 'photos', 'b.json'), 'utf8')) as Record<string, unknown>;
    expect(file).toEqual({ id: 'id-b', position: 1, fields: { caption: 'b' } });

    // A file added by hand, without a position, then a fresh process.
    await mkdir(join(dir, 'photos'), { recursive: true });
    await writeFile(join(dir, 'photos', 'hand.json'), JSON.stringify({ fields: { caption: 'By hand' } }));
    const second = setup(createJsonFileStore({ dir }));
    expect(await second.slugs()).toEqual(['b', 'a', 'hand']);
    await second.content.move('photos', 'hand', 0);
    expect(await second.slugs()).toEqual(['hand', 'b', 'a']);
    expect(JSON.parse(await readFile(join(dir, 'photos', 'hand.json'), 'utf8'))).toEqual({ fields: { caption: 'By hand' }, position: 1 });
  });
});
