// seed: fills empty collections through createContent, leaves the rest.
import { describe, expect, it } from 'vitest';

import { createContent, createMemoryStore } from './store.ts';
import { seed } from './seed.ts';
import { categories, posts } from './test/bricks.ts';

describe('seed', () => {
  it('fills empty collections, in order, and skips ones with documents', async () => {
    const store = createMemoryStore({ posts: [{ id: 'p1', slug: 'old', fields: { title: 'Old', date: '2026-01-01' } }] });
    const content = createContent({ store, collections: [categories, posts], bricks: [] });
    const result = await seed(content, {
      categories: [{ id: 'c1', slug: 'news', fields: { name: 'News' } }, { slug: 'misc', fields: { name: 'Misc' } }],
      posts: [{ slug: 'new', fields: { title: 'New', date: '2026-02-01' } }],
    });
    expect(result).toEqual({ seeded: ['categories'], skipped: ['posts'] });
    expect((await content.list('categories')).map((d) => d.slug).sort()).toEqual(['misc', 'news']);
    expect((await content.list('posts')).map((d) => d.slug)).toEqual(['old']);
    expect(await seed(content, { categories: [{ slug: 'again' }] })).toEqual({ seeded: [], skipped: ['categories'] });
  });

  it('throws on a document that does not validate', async () => {
    const content = createContent({ store: createMemoryStore(), collections: [categories], bricks: [] });
    await expect(seed(content, { categories: [{ slug: 'Bad Slug' }] })).rejects.toThrow(/categories\/Bad Slug: slug:/);
  });
});
