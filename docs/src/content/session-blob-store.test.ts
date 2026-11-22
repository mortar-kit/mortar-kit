// The session storage blob store: files kept as data URLs under one key,
// read back with their types, blob: URLs for the page, and gone after
// clear(). Run through createContent too, as the docs site uses it.
import { createContent, createMemoryStore } from '@mortar-kit/core';
import { describe, expect, it } from 'vitest';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { createSessionStorageBlobStore } from './session-blob-store.ts';

/** A Storage over a Map, as session storage behaves, refusing items over `limit` characters. */
function memoryStorage(limit = Infinity): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => {
      if (String(value).length > limit) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      items.set(key, String(value));
    },
  };
}

const bytes = (n: number) => new Uint8Array(n).map((_, i) => i % 256);

describe('createSessionStorageBlobStore', () => {
  it('keeps files under one key and reads them back', async () => {
    const storage = memoryStorage();
    const blobs = createSessionStorageBlobStore({ key: 'files', storage });
    expect(blobs.hasFiles()).toBe(false);
    await blobs.put('a-abc123.png', new Blob([bytes(70000)]));
    expect(storage.length).toBe(1);
    expect(storage.getItem('files')).toContain('data:image/png;base64,');
    expect(await blobs.list()).toEqual([{ key: 'a-abc123.png', size: 70000, modified: expect.any(String) }]);
    const got = await blobs.get('a-abc123.png');
    expect(got?.type).toBe('image/png');
    expect([...new Uint8Array(await (got as Blob).arrayBuffer())].slice(0, 300)).toEqual([...bytes(300)]);
    // Another store over the same storage (the preview iframe) sees it.
    expect(await createSessionStorageBlobStore({ key: 'files', storage }).get('a-abc123.png')).toBeDefined();
    const url = blobs.url('a-abc123.png');
    expect(url).toMatch(/^blob:/);
    expect(blobs.url('a-abc123.png')).toBe(url);
    expect(blobs.url('gone-abc123.png')).toBe('');
    await blobs.remove('a-abc123.png');
    expect(await blobs.get('a-abc123.png')).toBeUndefined();
    await blobs.put('b-abc123.png', new Blob([bytes(3)]));
    blobs.clear();
    expect(blobs.hasFiles()).toBe(false);
    expect(storage.getItem('files')).toBeNull();
  });

  it('says so when storage is full', async () => {
    const blobs = createSessionStorageBlobStore({ storage: memoryStorage(1000) });
    await expect(blobs.put('a-abc123.png', new Blob([bytes(5000)]))).rejects.toThrow('Session storage is full');
  });

  it('backs createContent assets', async () => {
    const content = createContent({ store: createMemoryStore(), blobs: createSessionStorageBlobStore({ storage: memoryStorage() }), collections, bricks });
    const result = await content.assets!.upload(new File([bytes(10)], 'Diagram.png'));
    expect(result.ok && result.asset.src).toMatch(/^blob:/);
    expect((await content.assets!.list()).map((a) => a.name)).toEqual(['diagram.png']);
  });
});
