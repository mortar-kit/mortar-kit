// defineCollection: options and their checks, defaults, titles, new documents.
import { describe, expect, it } from 'vitest';

import { collectionMap, defineCollection } from './collection.ts';
import { fields } from './fields.ts';

const posts = defineCollection({
  name: 'posts',
  label: 'Posts',
  fields: {
    date: fields.date({ label: 'Date' }),
    title: fields.text({ label: 'Title', required: true, default: 'Untitled' }),
    excerpt: fields.textarea({ label: 'Excerpt' }),
  },
  body: true,
  sort: { field: 'date', order: 'desc' },
});

describe('defineCollection', () => {
  it('fills in defaults for the options', () => {
    const notes = defineCollection({ name: 'notes', fields: { text: fields.textarea({ label: 'Text' }) } });
    expect(notes.label).toBe('notes');
    expect(notes.body).toBe(false);
    expect(notes.title).toBeUndefined();
    expect(notes.sort).toEqual({ field: 'slug', order: 'asc' });
    expect(notes.reservedSlugs).toEqual([]);
    expect(posts.title).toBe('title');
    expect(posts.sort).toEqual({ field: 'date', order: 'desc' });
  });

  it('rejects bad names, titles and sort fields', () => {
    expect(() => defineCollection({ name: 'Posts', fields: {} })).toThrow(/invalid name/);
    // @ts-expect-error -- not a field of the collection
    expect(() => defineCollection({ name: 'a', fields: { n: fields.number({ label: 'N' }) }, title: 'x' })).toThrow(/not a text field/);
    expect(() => defineCollection({ name: 'a', fields: { n: fields.number({ label: 'N' }) }, title: 'n' })).toThrow(/not a text field/);
    // @ts-expect-error -- not a field of the collection
    expect(() => defineCollection({ name: 'a', fields: {}, sort: { field: 'x' } })).toThrow(/unknown field "x"/);
  });

  it('normalizes and validates fields, keeping keys outside the schema', () => {
    expect(posts.defaults()).toEqual({ date: '', title: 'Untitled', excerpt: '' });
    expect(posts.normalize({ title: 3, legacy: { a: 1 } })).toEqual({ date: '', title: 'Untitled', excerpt: '', legacy: { a: 1 } });
    expect(posts.validate({ title: 'Hi', legacy: 1 })).toEqual({ success: true, data: { date: '', title: 'Hi', excerpt: '', legacy: 1 } });
    expect(posts.validate({ title: '' })).toEqual({ success: false, issues: [{ path: ['title'], message: 'Title is required' }] });
  });

  it('titles a document by its title field, or its slug', () => {
    expect(posts.titleOf({ slug: 'hello', fields: { title: 'Hello world' } })).toBe('Hello world');
    expect(posts.titleOf({ slug: 'hello', fields: { title: '  ' } })).toBe('hello');
    const notes = defineCollection({ name: 'notes', fields: {} });
    expect(notes.titleOf({ slug: 'n1', fields: {} })).toBe('n1');
  });

  it('creates new documents with fresh ids and default data', () => {
    const a = posts.create('first');
    const b = posts.create('second');
    expect(a).toEqual({ id: expect.any(String), slug: 'first', fields: posts.defaults(), entries: [] });
    expect(a.id).not.toBe(b.id);
    const categories = defineCollection({ name: 'categories', fields: { name: fields.text({ label: 'Name' }) } });
    expect(categories.create('mugs')).not.toHaveProperty('entries');
  });

  it('indexes collections by name and rejects duplicates', () => {
    expect(collectionMap([posts]).get('posts')).toBe(posts);
    expect(() => collectionMap([posts, posts])).toThrow(/two collections are named "posts"/);
  });
});
