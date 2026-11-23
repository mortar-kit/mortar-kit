// Collection URL patterns: urlOf, resolveUrl (most specific wins, home),
// taken slugs enforced on save, and the sitemap.
import { describe, expect, it } from 'vitest';

import { defineCollection } from './collection.ts';
import { fields } from './fields.ts';
import { createContent, createMemoryStore } from './store.ts';
import { resolveUrl, sitemap } from './urls.ts';

const title = { title: fields.text({ label: 'Title' }) };
const pages = defineCollection({ name: 'pages', fields: title, body: true, url: '/:slug', home: 'home', reservedSlugs: ['admin'] });
const posts = defineCollection({ name: 'posts', fields: title, url: '/posts/:slug' });
const docs = defineCollection({ name: 'docs', fields: title, url: '/docs/:slug/view' });
const notes = defineCollection({ name: 'notes', fields: title });
const collections = [pages, posts, docs, notes];

describe('collection url', () => {
  it('gives each document its path, the home document its prefix', () => {
    expect(posts.urlOf({ slug: 'hello' })).toBe('/posts/hello');
    expect(pages.urlOf({ slug: 'about' })).toBe('/about');
    expect(pages.urlOf({ slug: 'home' })).toBe('/');
    expect(notes.urlOf({ slug: 'x' })).toBeUndefined();
  });

  it('rejects patterns without exactly one :slug segment', () => {
    for (const url of ['posts/:slug', '/posts', '/:slug/:slug', '/:id', '/a:slug']) {
      expect(() => defineCollection({ name: 'bad', fields: {}, url })).toThrow(/one ":slug" segment/);
    }
    expect(() => defineCollection({ name: 'bad', fields: {}, home: 'home' })).toThrow(/home needs a url/);
  });
});

describe('resolveUrl', () => {
  it('maps paths to documents, the most specific pattern first', () => {
    expect(resolveUrl(collections, '/posts/hello')).toEqual({ collection: 'posts', slug: 'hello' });
    expect(resolveUrl(collections, '/about/')).toEqual({ collection: 'pages', slug: 'about' });
    expect(resolveUrl(collections, '/')).toEqual({ collection: 'pages', slug: 'home' });
    expect(resolveUrl(collections, new URL('https://site.test/Docs/intro/view?x=1'))).toEqual({ collection: 'docs', slug: 'intro' });
  });

  it('is undefined for paths no pattern matches', () => {
    expect(resolveUrl(collections, '/posts/a/b')).toBeUndefined();
    expect(resolveUrl(collections, '/a/b')).toBeUndefined();
    expect(resolveUrl([posts], '/posts')).toBeUndefined();
  });
});

describe('taken slugs', () => {
  it("refuses a slug another collection's URLs start with", async () => {
    const content = createContent({ store: createMemoryStore(), collections, bricks: [] });
    const page = (slug: string) => ({ id: `p-${slug}`, slug, fields: { title: slug }, entries: [] });
    expect(await content.save('pages', page('posts'))).toMatchObject({ ok: false, issues: [{ path: ['slug'], message: expect.stringContaining('taken') }] });
    expect(await content.save('pages', page('docs'))).toMatchObject({ ok: false });
    expect(await content.save('pages', page('admin'))).toMatchObject({ ok: false });
    expect(await content.save('pages', page('about'))).toMatchObject({ ok: true });
    expect(await content.save('posts', { id: 'x', slug: 'posts', fields: {} })).toMatchObject({ ok: true });
  });
});

describe('sitemap', () => {
  it('lists every document with a URL, escaped, plus extra paths', async () => {
    const content = createContent({
      store: createMemoryStore({
        pages: [{ id: 'h', slug: 'home', fields: {} }, { id: 'a', slug: 'about', fields: {} }],
        posts: [{ id: 'p', slug: 'a-b', fields: {} }],
        notes: [{ id: 'n', slug: 'secret', fields: {} }],
      }),
      collections,
      bricks: [],
    });
    const xml = await sitemap(content, collections, { origin: 'https://site.test/ignored', extra: ['/posts?x=1&y=2'] });
    expect(xml).toContain('<loc>https://site.test/posts?x=1&#38;y=2</loc>');
    expect(xml).toContain('<loc>https://site.test/</loc>');
    expect(xml).toContain('<loc>https://site.test/about</loc>');
    expect(xml).toContain('<loc>https://site.test/posts/a-b</loc>');
    expect(xml).not.toContain('secret');
    const filtered = await sitemap(content, collections, { origin: 'https://site.test', include: (_c, doc) => doc.slug !== 'about' });
    expect(filtered).not.toContain('/about');
  });
});
