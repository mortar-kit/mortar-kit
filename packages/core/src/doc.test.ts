// normalizeDoc (forgiving, for loading) and validateDoc (strict, for saving).
import { describe, expect, it } from 'vitest';

import { isValidDocId, isValidSlug, normalizeDoc, validateDoc } from './doc.ts';
import { bricks, categories, posts } from './test/bricks.ts';

describe('normalizeDoc', () => {
  it('fills fields and entries without touching the source', () => {
    const source = { id: 'p1', slug: 'hello', fields: { title: 'Hello', extra: { a: 1 } }, entries: [{ brick: 'heading', id: 'h', data: {} }] };
    const doc = normalizeDoc(posts, bricks, source);
    expect(doc).toEqual({
      id: 'p1',
      slug: 'hello',
      fields: { title: 'Hello', date: '', extra: { a: 1 } },
      entries: [{ brick: 'heading', id: 'h', data: { text: 'Hello', size: 2 } }],
    });
    expect(doc.fields.extra).not.toBe(source.fields.extra);
    expect(source.entries[0]?.data).toEqual({});
  });

  it('falls back to the slug for a missing or invalid id', () => {
    expect(normalizeDoc(categories, bricks, { slug: 'mugs', fields: { name: 'Mugs' } }).id).toBe('mugs');
    expect(normalizeDoc(categories, bricks, { id: 'no spaces', slug: 'mugs' }).id).toBe('mugs');
  });

  it('gives a body an entries list, and keeps stored entries of a collection without one', () => {
    expect(normalizeDoc(posts, bricks, { id: 'p', slug: 'p' }).entries).toEqual([]);
    expect(normalizeDoc(categories, bricks, { id: 'c', slug: 'c' })).not.toHaveProperty('entries');
    const kept = normalizeDoc(categories, bricks, { id: 'c', slug: 'c', entries: [{ brick: 'gone', id: 'x', data: { a: 1 } }] });
    expect(kept.entries).toEqual([{ brick: 'gone', id: 'x', data: { a: 1 } }]);
  });

  it('copes with junk', () => {
    expect(normalizeDoc(posts, bricks, null)).toEqual({ id: '', slug: '', fields: { title: 'Untitled', date: '' }, entries: [] });
    expect(normalizeDoc(posts, bricks, { slug: 3, fields: 'x', entries: 'y' })).toEqual({ id: '', slug: '', fields: { title: 'Untitled', date: '' }, entries: [] });
  });
});

describe('validateDoc', () => {
  const valid = () => ({ id: 'p1', slug: 'hello', fields: { title: 'Hello', date: '2026-11-22' }, entries: [{ brick: 'heading', id: 'h', data: { text: 'Hi' } }] });

  it('returns the cleaned document', () => {
    expect(validateDoc(posts, bricks, { ...valid(), junk: 1 })).toEqual({
      success: true,
      doc: { id: 'p1', slug: 'hello', fields: { title: 'Hello', date: '2026-11-22' }, entries: [{ brick: 'heading', id: 'h', data: { text: 'Hi', size: 2 } }] },
    });
  });

  it('reports id, slug, field and entry problems by path', () => {
    const result = validateDoc(posts, bricks, { id: '', slug: 'Not OK', fields: { title: '', date: 'soon' }, entries: [{ brick: 'heading', id: 'h', data: { text: '' } }, 'x'] });
    expect(!result.success && result.issues.map((i) => [i.entryId, i.path])).toEqual([
      [undefined, ['id']],
      [undefined, ['slug']],
      [undefined, ['fields', 'title']],
      [undefined, ['fields', 'date']],
      ['h', ['text']],
      [undefined, ['entries', 1]],
    ]);
  });

  it('rejects reserved slugs and non-objects', () => {
    const result = validateDoc(posts, bricks, { ...valid(), slug: 'admin' });
    expect(!result.success && result.issues).toEqual([{ path: ['slug'], message: 'The slug "admin" is reserved' }]);
    expect(validateDoc(posts, bricks, []).success).toBe(false);
  });

  it('keeps stored entries of a collection without a body, if they are plain JSON', () => {
    const doc = { id: 'c', slug: 'c', fields: { name: 'Mugs' }, entries: [{ brick: 'x', id: 'y', data: {} }] };
    expect(validateDoc(categories, bricks, doc)).toEqual({ success: true, doc });
    const bad = validateDoc(categories, bricks, { ...doc, entries: [{ data: () => 1 }] });
    expect(!bad.success && bad.issues[0]?.path).toEqual(['entries']);
    const badFields = validateDoc(categories, bricks, { ...doc, fields: { name: 'M', when: new Date() } });
    expect(!badFields.success && badFields.issues[0]?.path).toEqual(['fields']);
  });
});

describe('ids and slugs', () => {
  it('accepts UUIDs and simple ids, and slugs up to 100 characters', () => {
    expect(isValidDocId(crypto.randomUUID())).toBe(true);
    expect(isValidDocId('cat-mugs')).toBe(true);
    expect(isValidDocId('a/b')).toBe(false);
    expect(isValidDocId('x'.repeat(65))).toBe(false);
    expect(isValidSlug('a'.repeat(100))).toBe(true);
    expect(isValidSlug('a'.repeat(101))).toBe(false);
  });
});
