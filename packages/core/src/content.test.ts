// createContent: the rules around a store. Listing (filters, order,
// limits), getting by id or slug, saving (validation, unique slugs,
// renames) and deleting (refused while referenced).
import { describe, expect, it } from 'vitest';

import { defineBrick } from './brick.ts';
import { defineCollection } from './collection.ts';
import type { Doc } from './doc.ts';
import { fields } from './fields.ts';
import { createContent, createMemoryStore, type ContentStore } from './store.ts';
import { categories, heading, posts } from './test/bricks.ts';

const products = defineCollection({
  name: 'products',
  label: 'Products',
  fields: {
    name: fields.text({ label: 'Name', required: true }),
    price: fields.number({ label: 'Price' }),
    category: fields.reference({ label: 'Category', collection: 'categories' }),
    onSale: fields.boolean({ label: 'On sale' }),
  },
});

const pick = defineBrick({
  name: 'pick',
  schema: { category: fields.reference({ label: 'Category', collection: 'categories' }) },
  component: () => null,
});

const bricks = [heading, pick];

const seed = (): Record<string, Doc[]> => ({
  posts: [
    { id: 'p1', slug: 'first', fields: { title: 'First', date: '2026-01-01' }, entries: [] },
    { id: 'p2', slug: 'second', fields: { title: 'Second', date: '2026-03-01' }, entries: [{ brick: 'pick', id: 'e1', data: { category: 'c-posters' } }] },
    { id: 'p3', slug: 'third', fields: { title: 'Third', date: '2026-02-01' }, entries: [] },
  ],
  categories: [
    { id: 'c-mugs', slug: 'mugs', fields: { name: 'Mugs' } },
    { id: 'c-posters', slug: 'posters', fields: { name: 'Posters' } },
    { id: 'c-empty', slug: 'empty', fields: { name: 'Empty' } },
  ],
  products: [
    { id: 'x1', slug: 'blue-mug', fields: { name: 'Blue mug', price: 12, category: 'c-mugs' } },
    { id: 'x2', slug: 'red-mug', fields: { name: 'Red mug', price: 9, category: 'c-mugs', onSale: true } },
    { id: 'x3', slug: 'city', fields: { name: 'City poster', price: 20, category: 'c-posters' } },
  ],
});

function setup(store: ContentStore = createMemoryStore(seed())) {
  return { store, content: createContent({ store, collections: [posts, categories, products], bricks }) };
}

describe('createContent', () => {
  it('refuses references to unknown collections and unknown collection names', async () => {
    expect(() => createContent({ store: createMemoryStore(), collections: [products], bricks })).toThrow(
      'collection "products" references unknown collection "categories"',
    );
    const { content } = setup();
    await expect(content.list('nope')).rejects.toThrow('Unknown collection "nope"');
    await expect(content.save('nope', {})).rejects.toThrow('Unknown collection "nope"');
  });
});

describe('list', () => {
  it("orders by the collection's sort and leaves out bodies", async () => {
    const { content } = setup();
    const list = await content.list('posts');
    expect(list.map((d) => d.slug)).toEqual(['second', 'third', 'first']);
    expect(list[0]).toEqual({ id: 'p2', slug: 'second', fields: { title: 'Second', date: '2026-03-01' } });
  });

  it('filters, sorts and limits', async () => {
    const { content } = setup();
    const slugs = async (o: Parameters<typeof content.list>[1]) => (await content.list('products', o)).map((d) => d.slug);
    expect(await slugs({ where: { category: 'c-mugs' } })).toEqual(['blue-mug', 'red-mug']);
    expect(await slugs({ where: { onSale: true } })).toEqual(['red-mug']);
    expect(await slugs({ sort: { field: 'price', order: 'desc' } })).toEqual(['city', 'blue-mug', 'red-mug']);
    expect(await slugs({ sort: { field: 'price' }, limit: 2 })).toEqual(['red-mug', 'blue-mug']);
    expect(await slugs({ where: { slug: 'city' } })).toEqual(['city']);
  });

  it('rejects bad options', async () => {
    const { content } = setup();
    await expect(content.list('products', { where: { color: 'blue' } })).rejects.toThrow('unknown field "color"');
    await expect(content.list('products', { where: { name: { $ne: 1 } as never } })).rejects.toThrow('must be a string, number or boolean');
    await expect(content.list('products', { sort: { field: 'nope' } })).rejects.toThrow('unknown field "nope"');
    await expect(content.list('products', { limit: 0 })).rejects.toThrow('limit');
    await expect(content.list('products', { limit: 1.5 })).rejects.toThrow('limit');
  });

  it('keeps one of two documents sharing an id (a rename cut short)', async () => {
    const store = createMemoryStore(seed());
    await store.put('categories', { id: 'c-mugs', slug: 'cups', fields: { name: 'Cups' } });
    const { content } = setup(store);
    expect((await content.list('categories')).filter((d) => d.id === 'c-mugs').map((d) => d.slug)).toEqual(['cups']);
  });
});

describe('get', () => {
  it('finds a document by slug or by id, normalized', async () => {
    const { content } = setup();
    expect((await content.get('posts', { slug: 'second' }))?.entries).toEqual([{ brick: 'pick', id: 'e1', data: { category: 'c-posters' } }]);
    expect((await content.get('products', { id: 'x2' }))?.slug).toBe('red-mug');
    expect(await content.get('products', { id: 'nope' })).toBeNull();
    expect(await content.get('products', { slug: 'nope' })).toBeNull();
    expect(await content.get('products', { slug: '../x' })).toBeNull();
  });
});

describe('save', () => {
  it('stores valid documents and reports issues otherwise', async () => {
    const { content, store } = setup();
    expect(await content.save('categories', { id: 'c-new', slug: 'new', fields: { name: '' } })).toEqual({
      ok: false,
      issues: [{ path: ['fields', 'name'], message: 'Name is required' }],
    });
    expect(await store.get('categories', 'new')).toBeUndefined();
    expect(await content.save('categories', { id: 'c-new', slug: 'new', fields: { name: 'New' } })).toEqual({ ok: true });
    expect(await store.get('categories', 'new')).toEqual({ id: 'c-new', slug: 'new', fields: { name: 'New' } });
  });

  it('refuses a slug another document uses, and a reserved one', async () => {
    const { content } = setup();
    expect(await content.save('categories', { id: 'c-new', slug: 'mugs', fields: { name: 'Cups' } })).toEqual({
      ok: false,
      issues: [{ path: ['slug'], message: 'Another document in Categories already uses the slug "mugs"' }],
    });
    const reserved = await content.save('posts', { id: 'p9', slug: 'admin', fields: { title: 'A' } });
    expect(!reserved.ok && reserved.issues[0]?.path).toEqual(['slug']);
  });

  it('moves a renamed document, keeping its id', async () => {
    const { content, store } = setup();
    expect(await content.save('categories', { id: 'c-mugs', slug: 'cups', fields: { name: 'Cups' } })).toEqual({ ok: true });
    expect(await store.get('categories', 'mugs')).toBeUndefined();
    expect((await content.get('categories', { id: 'c-mugs' }))?.slug).toBe('cups');
  });

  it('fails instead of overwriting a document it cannot read', async () => {
    const store = createMemoryStore(seed());
    const broken: ContentStore = {
      ...store,
      get: async (collection, slug) => {
        if (slug === 'locked') throw new SyntaxError('bad JSON');
        return store.get(collection, slug);
      },
    };
    const { content } = setup(broken);
    await expect(content.save('categories', { id: 'c-new', slug: 'locked', fields: { name: 'X' } })).rejects.toThrow('bad JSON');
  });
});

describe('remove', () => {
  it('deletes an unreferenced document, and does nothing for an unknown id', async () => {
    const { content, store } = setup();
    expect(await content.remove('categories', 'c-empty')).toEqual({ ok: true });
    expect(await store.get('categories', 'empty')).toBeUndefined();
    expect(await content.remove('categories', 'nope')).toEqual({ ok: true });
  });

  it('refuses while documents reference it, in fields or in brick data', async () => {
    const { content, store } = setup();
    expect(await content.remove('categories', 'c-mugs')).toEqual({
      ok: false,
      referencedBy: [
        { collection: 'products', id: 'x1', slug: 'blue-mug', title: 'Blue mug', path: ['fields', 'category'] },
        { collection: 'products', id: 'x2', slug: 'red-mug', title: 'Red mug', path: ['fields', 'category'] },
      ],
    });
    expect(await content.remove('categories', 'c-posters')).toEqual({
      ok: false,
      referencedBy: [
        { collection: 'posts', id: 'p2', slug: 'second', title: 'Second', entryId: 'e1', path: ['category'] },
        { collection: 'products', id: 'x3', slug: 'city', title: 'City poster', path: ['fields', 'category'] },
      ],
    });
    expect(await store.get('categories', 'mugs')).toBeDefined();
  });
});
