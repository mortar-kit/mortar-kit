// normalizePage (forgiving, for loading) and validatePage (strict, for saving).
import { describe, expect, it } from 'vitest';

import { normalizePage, validatePage } from './page.ts';
import { bricks, page } from './test/bricks.ts';

describe('normalizePage', () => {
  it('fills defaults without touching the source page', () => {
    const source = page();
    const out = normalizePage(bricks, source);
    expect(out.entries[0]?.data).toEqual({ text: 'First', size: 2 });
    expect(source.entries[0]?.data).toEqual({ text: 'First' });
  });

  it('keeps metadata and entries of unknown bricks', () => {
    const source = { entries: [{ brick: 'gone', id: 'x', data: { a: { b: 1 } } }], meta: { title: { text: 'Home' } } };
    const out = normalizePage(bricks, source);
    expect(out).toEqual(source);
    // Copies, so editing the result never reaches the source.
    expect(out.entries[0]?.data.a).not.toBe(source.entries[0]?.data.a);
    expect(out.meta?.title).not.toBe(source.meta.title);
  });

  it('drops malformed and duplicate entries instead of crashing', () => {
    expect(normalizePage(bricks, null)).toEqual({ entries: [] });
    expect(normalizePage(bricks, [])).toEqual({ entries: [] });
    const out = normalizePage(bricks, {
      entries: [null, { id: 'no-brick' }, { brick: 'heading', id: 'a', data: 'oops' }, { brick: 'heading', id: 'a', data: {} }],
      meta: 'not an object',
    });
    expect(out).toEqual({ entries: [{ brick: 'heading', id: 'a', data: { text: 'Hello', size: 2 } }] });
  });
});

describe('validatePage', () => {
  it('returns the cleaned page when valid', () => {
    const result = validatePage(bricks, { ...page(), meta: { title: 'Home' } });
    expect(result).toEqual({
      success: true,
      page: {
        entries: [
          { brick: 'heading', id: 'a', data: { text: 'First', size: 2 } },
          { brick: 'heading', id: 'b', data: { text: 'Second', size: 3 } },
        ],
        meta: { title: 'Home' },
      },
    });
  });

  it('reports data issues by entry id and path', () => {
    const result = validatePage(bricks, {
      entries: [
        { brick: 'heading', id: 'a', data: { text: '' } },
        { brick: 'heading', id: 'b', data: { text: 'ok', size: 9 } },
      ],
    });
    expect(result).toEqual({
      success: false,
      issues: [
        { entryId: 'a', path: ['text'], message: 'Text is required' },
        { entryId: 'b', path: ['size'], message: 'Size must be at most 6' },
      ],
    });
  });

  it('reports shape problems and duplicate ids', () => {
    expect(validatePage(bricks, [])).toEqual({ success: false, issues: [{ path: ['entries'], message: 'A page must have an entries list' }] });
    const result = validatePage(bricks, {
      entries: [{ brick: 'heading', id: 'a', data: {} }, { brick: 'heading', id: 'a', data: {} }, { brick: 'heading' }],
      meta: 3,
    });
    expect(result.success).toBe(false);
    expect(!result.success && result.issues.map((i) => i.message)).toEqual([
      'Page metadata must be an object',
      'Two entries share the id "a"',
      'An entry needs a brick name, an id and a data object',
    ]);
  });

  it('keeps entries of unknown bricks as they are', () => {
    const result = validatePage(bricks, { entries: [{ brick: 'gone', id: 'x', data: { a: 1 } }] });
    expect(result).toEqual({ success: true, page: { entries: [{ brick: 'gone', id: 'x', data: { a: 1 } }] } });
  });
});

describe('kept data', () => {
  const odd = () => ({ ok: 1, fn: () => 1, when: new Date(0), wait: Promise.resolve(1), list: [1, () => 2, Number.NaN] });

  it('validatePage returns copies of unknown-brick data and metadata', () => {
    const source = { entries: [{ brick: 'gone', id: 'x', data: { a: { b: 1 } } }], meta: { og: { image: '/a.png' } } };
    const result = validatePage(bricks, source);
    if (!result.success) throw new Error('expected success');
    expect(result.page).toEqual(source);
    expect(result.page.entries[0]?.data.a).not.toBe(source.entries[0]?.data.a);
    expect(result.page.meta?.og).not.toBe(source.meta.og);
  });

  it('validatePage reports values JSON cannot hold instead of throwing', () => {
    const result = validatePage(bricks, { entries: [{ brick: 'gone', id: 'x', data: odd() }], meta: odd() });
    expect(result.success).toBe(false);
    expect(!result.success && result.issues.map((i) => [i.entryId, i.path])).toEqual([
      [undefined, ['meta']],
      ['x', []],
    ]);
  });

  it('normalizePage drops values JSON cannot hold, as JSON.stringify does', () => {
    const out = normalizePage(bricks, { entries: [{ brick: 'gone', id: 'x', data: odd() }], meta: odd() });
    expect(out.entries[0]?.data).toEqual({ ok: 1, list: [1, null, null] });
    expect(out.meta).toEqual({ ok: 1, list: [1, null, null] });
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(normalizePage(bricks, { entries: [], meta: cyclic }).meta).toEqual({ a: 1 });
  });
});
