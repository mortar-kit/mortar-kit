// The session storage store: changes on top of the baseline, kept in one
// storage item, and gone after clear(). Run through createContent too, as
// the docs site uses it.
import { createContent, type Doc } from '@mortar-kit/core';
import { describe, expect, it } from 'vitest';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { createSessionStorageStore } from './session-store.ts';

/** A Storage over a Map, as session storage behaves. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

const guide = (slug: string, title: string, order = 1): Doc => ({
  id: slug,
  slug,
  fields: { title, description: '', section: 'start', order },
  entries: [],
});

const baseline = { docs: [guide('intro', 'Intro'), guide('install', 'Install', 2)] };

describe('createSessionStorageStore', () => {
  it('reads the baseline until something changes', async () => {
    const store = createSessionStorageStore({ baseline, storage: memoryStorage() });
    expect((await store.list('docs')).map((d) => (d as Doc).slug)).toEqual(['intro', 'install']);
    expect(await store.get('docs', 'intro')).toEqual(baseline.docs[0]);
    expect(await store.get('docs', 'nope')).toBeUndefined();
    expect(await store.list('pages')).toEqual([]);
    expect(store.hasChanges()).toBe(false);
  });

  it('keeps saves and deletions over the baseline, without touching it', async () => {
    const storage = memoryStorage();
    const store = createSessionStorageStore({ baseline, storage });
    await store.put('docs', guide('intro', 'Edited intro'));
    await store.put('docs', guide('new', 'New guide'));
    await store.remove('docs', 'install');
    expect(((await store.get('docs', 'intro')) as Doc).fields.title).toBe('Edited intro');
    expect(await store.get('docs', 'install')).toBeUndefined();
    expect((await store.list('docs')).map((d) => (d as Doc).slug).sort()).toEqual(['intro', 'new']);
    expect(store.hasChanges()).toBe(true);
    expect(baseline.docs[0]!.fields.title).toBe('Intro');
    // A second store over the same storage (the preview iframe) sees the same.
    const other = createSessionStorageStore({ baseline, storage });
    expect(((await other.get('docs', 'intro')) as Doc).fields.title).toBe('Edited intro');
  });

  it('forgets a document made and deleted in this tab, and everything on clear()', async () => {
    const store = createSessionStorageStore({ baseline, storage: memoryStorage() });
    await store.put('docs', guide('temp', 'Temp'));
    await store.remove('docs', 'temp');
    expect(store.hasChanges()).toBe(false);
    await store.remove('docs', 'intro');
    expect(store.hasChanges()).toBe(true);
    store.clear();
    expect(store.hasChanges()).toBe(false);
    expect(await store.get('docs', 'intro')).toEqual(baseline.docs[0]);
  });

  it('reads unreadable storage as no changes', async () => {
    const storage = memoryStorage();
    storage.setItem('mortar:changes', '{not json');
    const store = createSessionStorageStore({ baseline, storage });
    expect(store.hasChanges()).toBe(false);
    expect(await store.list('docs')).toHaveLength(2);
  });

  it('works behind createContent: renames keep the id and leave no copy', async () => {
    const store = createSessionStorageStore({ baseline, storage: memoryStorage() });
    const content = createContent({ store, collections, bricks });
    const intro = await content.get('docs', { slug: 'intro' });
    expect(await content.save('docs', { ...intro, slug: 'introduction' })).toEqual({ ok: true });
    expect(await content.get('docs', { slug: 'intro' })).toBeNull();
    expect((await content.get('docs', { id: 'intro' }))?.slug).toBe('introduction');
    const taken = await content.save('docs', { ...guide('other', 'Other'), slug: 'install' });
    expect(taken.ok).toBe(false);
  });
});
