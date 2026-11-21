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
    const out = normalizePage(bricks, { entries: [{ brick: 'gone', id: 'x', data: { a: 1 } }], meta: { title: 'Home' } });
    expect(out).toEqual({ entries: [{ brick: 'gone', id: 'x', data: { a: 1 } }], meta: { title: 'Home' } });
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
