// Assets: keys, the blob stores (memory, and the folder store with real I/O
// against a temp dir), serving files, image and file fields, and the rules
// createContent applies (uploads, URLs filled in on read, deletes refused
// while documents use an asset).
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assetExtensions, assetInfo, assetKeyFor, createMemoryBlobStore, isValidAssetKey, serveBlob, type BlobStore } from './assets.ts';
import { defineBrick } from './brick.ts';
import { defineCollection } from './collection.ts';
import { assetsIn, fields } from './fields.ts';
import { createFileBlobStore } from './server.ts';
import { createContent, createMemoryStore } from './store.ts';

const png = (name = 'Hero Photo.PNG', size = 4) => new File([new Uint8Array(size).fill(7)], name, { type: 'image/png' });

describe('asset keys', () => {
  it('makes a URL-safe key from a file name, with a random suffix', () => {
    const key = assetKeyFor('Hero Photo.PNG') as string;
    expect(key).toMatch(/^hero-photo-[a-z0-9]{6}\.png$/);
    expect(isValidAssetKey(key)).toBe(true);
    expect(assetKeyFor('Hero Photo.PNG')).not.toBe(key);
    expect(assetKeyFor('Crème brûlée!.jpg')).toMatch(/^creme-brulee-[a-z0-9]{6}\.jpg$/);
    expect(assetKeyFor('.webm')).toMatch(/^file-[a-z0-9]{6}\.webm$/);
  });

  it('refuses types outside the allowlist (SVG can carry script)', () => {
    expect(assetKeyFor('logo.svg')).toBeUndefined();
    expect(assetKeyFor('page.html')).toBeUndefined();
    expect(assetKeyFor('noext')).toBeUndefined();
    expect(assetExtensions(['video'])).toEqual(['mp4', 'webm', 'mov']);
  });

  it('reads type, kind and name from a key', () => {
    expect(assetInfo('hero-photo-abc123.png')).toEqual({ type: 'image/png', kind: 'image', name: 'hero-photo.png' });
    expect(assetInfo('talk-abc123.mp4')?.kind).toBe('video');
    for (const bad of ['', 'x.png', '../a-abc123.png', 'a-abc123.svg', 'A-abc123.png', 'a-abc123.png/x']) expect(isValidAssetKey(bad)).toBe(false);
  });
});

describe('createMemoryBlobStore', () => {
  it('keeps files by key and gives URLs under its base', async () => {
    const blobs = createMemoryBlobStore({ baseUrl: 'https://cdn.example.com/' });
    await blobs.put('a-abc123.png', png());
    expect(await blobs.list()).toEqual([{ key: 'a-abc123.png', size: 4, modified: expect.any(String) }]);
    const got = await blobs.get('a-abc123.png');
    expect(got?.type).toBe('image/png');
    expect(got?.size).toBe(4);
    expect(blobs.url('a-abc123.png')).toBe('https://cdn.example.com/a-abc123.png');
    await blobs.remove('a-abc123.png');
    expect(await blobs.get('a-abc123.png')).toBeUndefined();
    await expect(blobs.put('../x.png', png())).rejects.toThrow('invalid asset key');
  });
});

describe('createFileBlobStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mortar-blobs-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stores files named by key, atomically, and lists only asset keys', async () => {
    const blobs = createFileBlobStore({ dir: join(dir, 'uploads') });
    expect(await blobs.list()).toEqual([]);
    await blobs.put('a-abc123.png', png('a.png', 10));
    await writeFile(join(dir, 'uploads', 'notes.txt'), 'x');
    expect(await readdir(join(dir, 'uploads'))).toEqual(['a-abc123.png', 'notes.txt']);
    expect(await blobs.list()).toEqual([{ key: 'a-abc123.png', size: 10, modified: expect.any(String) }]);
    const got = await blobs.get('a-abc123.png');
    expect(got?.type).toBe('image/png');
    expect(new Uint8Array(await (got as Blob).arrayBuffer())[0]).toBe(7);
    expect(blobs.url('a-abc123.png')).toBe('/uploads/a-abc123.png');
    await blobs.remove('a-abc123.png');
    expect(await blobs.get('a-abc123.png')).toBeUndefined();
    expect(await blobs.get('../../etc/passwd')).toBeUndefined();
    await expect(blobs.put('../a-abc123.png', png())).rejects.toThrow('invalid asset key');
  });
});

describe('serveBlob', () => {
  const blobs = createMemoryBlobStore();
  beforeEach(async () => {
    await blobs.put('clip-abc123.mp4', new Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])]));
  });

  it('serves a file with its type, nosniff and a long cache', async () => {
    const res = await serveBlob(blobs, 'clip-abc123.mp4');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('content-length')).toBe('10');
    expect((await res.arrayBuffer()).byteLength).toBe(10);
  });

  it('answers byte ranges', async () => {
    const get = (range: string) => serveBlob(blobs, 'clip-abc123.mp4', new Request('http://x/', { headers: { range } }));
    const mid = await get('bytes=2-4');
    expect(mid.status).toBe(206);
    expect(mid.headers.get('content-range')).toBe('bytes 2-4/10');
    expect([...new Uint8Array(await mid.arrayBuffer())]).toEqual([2, 3, 4]);
    expect([...new Uint8Array(await (await get('bytes=8-')).arrayBuffer())]).toEqual([8, 9]);
    expect([...new Uint8Array(await (await get('bytes=-3')).arrayBuffer())]).toEqual([7, 8, 9]);
    expect((await get('bytes=20-')).status).toBe(416);
  });

  it('404s for a missing file or an invalid key', async () => {
    expect((await serveBlob(blobs, 'gone-abc123.mp4')).status).toBe(404);
    expect((await serveBlob(blobs, '../secret')).status).toBe(404);
  });
});

describe('image and file fields', () => {
  const brick = defineBrick({
    name: 'media',
    schema: {
      image: fields.image({ label: 'Image', required: true }),
      video: fields.file({ label: 'Video', accept: ['video'] }),
      gallery: fields.list({ label: 'Gallery', of: fields.image({ label: 'Photo' }) }),
    },
    component: () => null,
  });

  it('accepts an uploaded asset of an accepted kind, or a URL', () => {
    expect(brick.validate({ image: { asset: 'a-abc123.png', alt: 'A' } }).success).toBe(true);
    expect(brick.validate({ image: { src: '/a.png' } }).success).toBe(true);
    expect(brick.validate({ image: { src: '/a.png' }, video: { asset: 'a-abc123.png' } }).success).toBe(false);
    expect(brick.validate({ image: { src: '/a.png' }, video: { asset: 'talk-abc123.webm' } }).success).toBe(true);
  });

  it('requires a URL or an asset, at src', () => {
    const result = brick.validate({ image: { src: '', asset: '' } });
    expect(result.success).toBe(false);
    expect(!result.success && result.issues[0]?.path).toEqual(['image', 'src']);
  });

  it('allows a blob: src only beside an asset (a browser-only blob store hands those out)', () => {
    expect(brick.validate({ image: { src: 'blob:http://x/1', asset: 'a-abc123.png' } }).success).toBe(true);
    expect(brick.validate({ image: { src: 'blob:http://x/1' } }).success).toBe(false);
  });

  it('finds the assets data uses, through lists', () => {
    const data = brick.normalize({ image: { asset: 'a-abc123.png' }, gallery: [{ src: '/x.png' }, { asset: 'b-abc123.jpg' }] });
    expect(assetsIn(brick.schema, data)).toEqual([
      { path: ['image'], key: 'a-abc123.png' },
      { path: ['gallery', 1], key: 'b-abc123.jpg' },
    ]);
  });
});

describe('createContent with a blob store', () => {
  const hero = defineBrick({ name: 'hero', schema: { image: fields.image({ label: 'Image' }) }, component: () => null });
  const pages = defineCollection({ name: 'pages', label: 'Pages', fields: { cover: fields.image({ label: 'Cover' }) }, body: true });
  const notes = defineCollection({ name: 'notes', label: 'Notes', fields: { text: fields.text({ label: 'Text' }) } });
  let blobs: BlobStore;
  const setup = (maxAssetSize?: number) => {
    blobs = createMemoryBlobStore({ baseUrl: 'https://cdn.example.com/' });
    const store = createMemoryStore();
    return { store, content: createContent({ store, blobs, collections: [pages, notes], bricks: [hero], maxAssetSize }) };
  };

  it('has no assets without a blob store', () => {
    expect(createContent({ store: createMemoryStore(), collections: [pages], bricks: [hero] }).assets).toBeUndefined();
  });

  it('uploads allowed files under fresh keys and lists them', async () => {
    const { content } = setup(100);
    const result = await content.assets!.upload(png());
    expect(result.ok).toBe(true);
    const asset = result.ok ? result.asset : undefined;
    expect(asset).toMatchObject({ name: 'hero-photo.png', kind: 'image', type: 'image/png', size: 4 });
    expect(asset?.src).toBe(`https://cdn.example.com/${asset?.key}`);
    expect((await content.assets!.list()).map((a) => a.key)).toEqual([asset?.key]);
    expect(await content.assets!.upload(png('x.svg'))).toEqual({ ok: false, message: expect.stringContaining("isn't a file type") });
    expect(await content.assets!.upload(png('big.png', 101))).toEqual({ ok: false, message: expect.stringContaining('larger than') });
    expect(await content.assets!.upload(png('empty.png', 0))).toEqual({ ok: false, message: expect.stringContaining('empty') });
    expect(await content.assets!.upload('x' as unknown as File)).toEqual({ ok: false, message: 'Not a file' });
  });

  it('stores asset keys without URLs and fills URLs in on read', async () => {
    const { store, content } = setup();
    const doc = {
      id: 'home',
      slug: 'home',
      fields: { cover: { src: 'blob:http://x/1', alt: 'Cover', asset: 'cover-abc123.jpg' } },
      entries: [{ brick: 'hero', id: 'e1', data: { image: { src: 'https://elsewhere.com/x.png', alt: '', asset: '' } } }],
    };
    expect(await content.save('pages', doc)).toEqual({ ok: true });
    const stored = (await store.get('pages', 'home')) as typeof doc;
    expect(stored.fields.cover).toEqual({ src: '', alt: 'Cover', title: '', asset: 'cover-abc123.jpg' });
    expect(stored.entries[0]?.data.image.src).toBe('https://elsewhere.com/x.png');
    const read = await content.get('pages', { slug: 'home' });
    expect(read?.fields.cover).toEqual({ src: 'https://cdn.example.com/cover-abc123.jpg', alt: 'Cover', title: '', asset: 'cover-abc123.jpg' });
    expect((await content.get('pages', { id: 'home' }))?.fields.cover).toMatchObject({ src: 'https://cdn.example.com/cover-abc123.jpg' });
    expect((await content.list('pages'))[0]?.fields.cover).toMatchObject({ src: 'https://cdn.example.com/cover-abc123.jpg' });
  });

  it('refuses to delete an asset documents use, and says where', async () => {
    const { content } = setup();
    const uploaded = await content.assets!.upload(png('cover.jpg'));
    const key = uploaded.ok ? uploaded.asset.key : '';
    await content.save('pages', {
      id: 'home',
      slug: 'home',
      fields: { cover: { asset: key } },
      entries: [{ brick: 'hero', id: 'e1', data: { image: { asset: key } } }],
    });
    const refused = await content.assets!.remove(key);
    expect(refused).toEqual({
      ok: false,
      referencedBy: [
        { collection: 'pages', id: 'home', slug: 'home', title: 'home', path: ['fields', 'cover'] },
        { collection: 'pages', id: 'home', slug: 'home', title: 'home', entryId: 'e1', path: ['image'] },
      ],
    });
    await content.save('pages', { id: 'home', slug: 'home', fields: {}, entries: [] });
    expect(await content.assets!.remove(key)).toEqual({ ok: true });
    expect(await content.assets!.list()).toEqual([]);
    expect(await content.assets!.remove('../nope')).toEqual({ ok: true });
  });

  it('keeps default titles and alt text, and finds no details for an asset without any', async () => {
    const { store, content } = setup();
    const assets = content.assets!;
    const uploaded = await assets.upload(png('cover.jpg'));
    const key = uploaded.ok ? uploaded.asset.key : '';
    expect(uploaded.ok && uploaded.asset).toMatchObject({ title: '', alt: '', folder: '' });
    expect(await store.get('mortar-assets', 'library')).toBeUndefined();
    const updated = await assets.update(key, { title: '  Harbour at dusk ', alt: 'Boats moored at dusk' });
    expect(updated).toEqual({ ok: true, asset: expect.objectContaining({ key, title: 'Harbour at dusk', alt: 'Boats moored at dusk', folder: '' }) });
    expect((await assets.list())[0]).toMatchObject({ title: 'Harbour at dusk', alt: 'Boats moored at dusk' });
    // A part left out stays; an empty one clears it.
    await assets.update(key, { title: '' });
    expect((await assets.list())[0]).toMatchObject({ title: '', alt: 'Boats moored at dusk' });
    expect(await assets.update(key, { alt: 'x'.repeat(1001) })).toEqual({ ok: false, message: 'Alt text is at most 1000 characters' });
    expect(await assets.update(key, { title: 3 as unknown as string })).toEqual({ ok: false, message: 'title must be a string' });
    expect(await assets.update('missing-abc123.png', { title: 'x' })).toEqual({ ok: false, message: 'There is no asset "missing-abc123.png"' });
    // Deleting the file drops its details.
    await assets.remove(key);
    expect(((await store.get('mortar-assets', 'library')) as { fields: unknown }).fields).toEqual({ folders: [], files: {} });
  });

  it('keeps folders: create, rename, upload into one, move files, delete it (files stay)', async () => {
    const { content } = setup();
    const assets = content.assets!;
    const created = await assets.saveFolder({ name: ' Team   photos ' });
    if (!created.ok) throw new Error(created.message);
    const team = created.folder;
    expect(team.name).toBe('Team photos');
    expect(await assets.saveFolder({ name: 'team PHOTOS' })).toEqual({ ok: false, message: 'There is already a folder named "Team photos"' });
    expect(await assets.saveFolder({ name: '  ' })).toEqual({ ok: false, message: 'A folder needs a name' });
    const other = await assets.saveFolder({ name: 'Archive' });
    expect((await assets.folders()).map((f) => f.name)).toEqual(['Archive', 'Team photos']);
    expect(await assets.saveFolder({ id: team.id, name: 'People' })).toEqual({ ok: true, folder: { id: team.id, name: 'People' } });
    expect(await assets.saveFolder({ id: 'gone12', name: 'X' })).toEqual({ ok: false, message: 'That folder no longer exists' });

    const a = await assets.upload(png('a.png'), { folder: team.id });
    const b = await assets.upload(png('b.png'));
    expect(a.ok && a.asset.folder).toBe(team.id);
    expect(b.ok && b.asset.folder).toBe('');
    expect(await assets.upload(png('c.png'), { folder: 'nope12' })).toEqual({ ok: false, message: 'That folder no longer exists' });
    expect((await assets.list()).length).toBe(2);
    const bKey = b.ok ? b.asset.key : '';
    expect(await assets.update(bKey, { folder: other.ok ? other.folder.id : '' })).toMatchObject({ ok: true, asset: { folder: other.ok && other.folder.id } });

    await assets.removeFolder(team.id);
    expect((await assets.folders()).map((f) => f.name)).toEqual(['Archive']);
    const byName = Object.fromEntries((await assets.list()).map((x) => [x.name, x.folder]));
    expect(byName).toEqual({ 'a.png': '', 'b.png': other.ok && other.folder.id });
  });

  it('reads a malformed library document as no details, and reserves its collection name', async () => {
    const { store, content } = setup();
    const uploaded = await content.assets!.upload(png('cover.jpg'));
    const key = uploaded.ok ? uploaded.asset.key : '';
    await store.put('mortar-assets', {
      id: 'mortar-assets',
      slug: 'library',
      fields: { folders: [{ id: 'f1' }, 'x', { id: 'f2', name: 'Kept' }], files: { [key]: { title: 5, alt: 'Ok', folder: 'f1' }, '../x': { title: 'no' } } },
    });
    expect(await content.assets!.folders()).toEqual([{ id: 'f2', name: 'Kept' }]);
    expect((await content.assets!.list())[0]).toMatchObject({ title: '', alt: 'Ok', folder: '' });
    const reserved = defineCollection({ name: 'mortar-assets', label: 'X', fields: {} });
    expect(() => createContent({ store, blobs, collections: [reserved], bricks: [] })).toThrow('reserved');
  });
});
