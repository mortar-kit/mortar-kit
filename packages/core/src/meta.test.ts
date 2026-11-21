// definePageMeta, and page metadata going through normalizePage,
// validatePage and the load/save helpers.
import { describe, expect, it } from 'vitest';

import { normalizePage, validatePage } from './page.ts';
import { createMemoryStore, loadPage, savePage } from './store.ts';
import { bricks, page, pageMeta } from './test/bricks.ts';

describe('definePageMeta', () => {
  it('fills defaults and keeps keys outside the schema', () => {
    expect(pageMeta.defaults()).toEqual({ title: 'Untitled', description: '' });
    expect(pageMeta.normalize({ title: 4, og: { image: '/a.png' } })).toEqual({ title: 'Untitled', description: '', og: { image: '/a.png' } });
    expect(pageMeta.validate({ title: 'Home', og: 1 })).toEqual({ success: true, data: { title: 'Home', description: '', og: 1 } });
  });

  it('reports issues by path', () => {
    expect(pageMeta.validate({ title: '', description: 'far too long' })).toEqual({
      success: false,
      issues: [
        { path: ['title'], message: 'Title is required' },
        { path: ['description'], message: expect.stringContaining('Description') },
      ],
    });
  });
});

describe('pages with a meta schema', () => {
  it('normalizes metadata, adding it when missing, without touching the source', () => {
    const source = { ...page(), meta: { title: 'Home', extra: { a: 1 } } };
    const out = normalizePage(bricks, source, pageMeta);
    expect(out.meta).toEqual({ title: 'Home', description: '', extra: { a: 1 } });
    (out.meta!.extra as { a: number }).a = 2;
    expect(source.meta).toEqual({ title: 'Home', extra: { a: 1 } });
    expect(normalizePage(bricks, page(), pageMeta).meta).toEqual({ title: 'Untitled', description: '' });
    expect(normalizePage(bricks, { ...page(), meta: 'bad' }, pageMeta).meta).toEqual({ title: 'Untitled', description: '' });
  });

  it('validates metadata with paths under meta', () => {
    const result = validatePage(bricks, { entries: [{ brick: 'heading', id: 'a', data: { text: '' } }], meta: { title: '' } }, pageMeta);
    expect(result).toEqual({
      success: false,
      issues: [
        { path: ['meta', 'title'], message: 'Title is required' },
        { entryId: 'a', path: ['text'], message: 'Text is required' },
      ],
    });
    expect(validatePage(bricks, page(), pageMeta)).toMatchObject({ success: true, page: { meta: { title: 'Untitled', description: '' } } });
    expect(validatePage(bricks, { ...page(), meta: [] }, pageMeta)).toEqual({
      success: false,
      issues: [{ path: ['meta'], message: 'Page metadata must be an object' }],
    });
  });

  it('normalizes on load and validates on save', async () => {
    const store = createMemoryStore({ home: { ...page(), meta: { title: 'Home' } } });
    expect((await loadPage(store, bricks, 'home', { meta: pageMeta }))?.meta).toEqual({ title: 'Home', description: '' });
    const bad = await savePage(store, bricks, 'home', { ...page(), meta: { title: '' } }, { meta: pageMeta });
    expect(bad).toEqual({ ok: false, issues: [{ path: ['meta', 'title'], message: 'Title is required' }] });
    expect((await store.load('home'))?.meta).toEqual({ title: 'Home' });
    expect(await savePage(store, bricks, 'home', { ...page(), meta: { title: 'New' } }, { meta: pageMeta })).toEqual({ ok: true });
    expect((await store.load('home'))?.meta).toEqual({ title: 'New', description: '' });
  });
});

describe('savePage with values JSON cannot hold', () => {
  it('returns issues rather than throwing, and stores nothing', async () => {
    const store = createMemoryStore();
    const result = await savePage(store, bricks, 'home', { ...page(), meta: { title: 'x', wait: Promise.resolve(1) } }, { meta: pageMeta });
    expect(result).toEqual({ ok: false, issues: [{ path: ['meta'], message: expect.stringContaining('plain JSON') }] });
    expect(await store.load('home')).toBeUndefined();
  });
});
