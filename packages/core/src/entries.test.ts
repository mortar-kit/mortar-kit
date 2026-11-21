// normalizeEntries (forgiving, for loading), validateEntries (strict, for
// saving) and the plain-JSON copy of data Mortar keeps as it is.
import { describe, expect, it } from 'vitest';

import { normalizeEntries, validateEntries, type EntryIssue } from './entries.ts';
import { bricks } from './test/bricks.ts';

const entries = () => [
  { brick: 'heading', id: 'a', data: { text: 'First' } },
  { brick: 'heading', id: 'b', data: { text: 'Second', size: 3 } },
];

describe('normalizeEntries', () => {
  it('fills defaults without touching the source', () => {
    const source = entries();
    expect(normalizeEntries(bricks, source)[0]?.data).toEqual({ text: 'First', size: 2 });
    expect(source[0]?.data).toEqual({ text: 'First' });
  });

  it('keeps entries of unknown bricks as copies', () => {
    const source = [{ brick: 'gone', id: 'x', data: { a: { b: 1 } } }];
    const out = normalizeEntries(bricks, source);
    expect(out).toEqual(source);
    expect(out[0]?.data.a).not.toBe(source[0]?.data.a);
  });

  it('drops malformed and duplicate entries instead of crashing', () => {
    expect(normalizeEntries(bricks, null)).toEqual([]);
    expect(normalizeEntries(bricks, [null, { id: 'no-brick' }, { brick: 'heading', id: 'a', data: 'oops' }, { brick: 'heading', id: 'a', data: {} }])).toEqual([
      { brick: 'heading', id: 'a', data: { text: 'Hello', size: 2 } },
    ]);
  });
});

describe('validateEntries', () => {
  it('returns the cleaned entries when valid', () => {
    const issues: EntryIssue[] = [];
    expect(validateEntries(bricks, entries(), issues)).toEqual([
      { brick: 'heading', id: 'a', data: { text: 'First', size: 2 } },
      { brick: 'heading', id: 'b', data: { text: 'Second', size: 3 } },
    ]);
    expect(issues).toEqual([]);
  });

  it('reports data issues by entry id, and shape problems and duplicate ids', () => {
    const issues: EntryIssue[] = [];
    validateEntries(
      bricks,
      [{ brick: 'heading', id: 'a', data: { text: '' } }, { brick: 'heading', id: 'b', data: { text: 'ok', size: 9 } }, { brick: 'heading', id: 'b', data: {} }, { brick: 'heading' }],
      issues,
    );
    expect(issues).toEqual([
      { entryId: 'a', path: ['text'], message: 'Text is required' },
      { entryId: 'b', path: ['size'], message: 'Size must be at most 6' },
      { entryId: 'b', path: [], message: 'Two entries share the id "b"' },
      { path: ['entries', 3], message: 'An entry needs a brick name, an id and a data object' },
    ]);
  });

  it('keeps entries of unknown bricks as copies', () => {
    const source = [{ brick: 'gone', id: 'x', data: { a: { b: 1 } } }];
    const out = validateEntries(bricks, source, []);
    expect(out).toEqual(source);
    expect(out[0]?.data.a).not.toBe(source[0]?.data.a);
  });
});

describe('kept data', () => {
  const odd = () => ({ ok: 1, fn: () => 1, when: new Date(0), wait: Promise.resolve(1), list: [1, () => 2, Number.NaN] });

  it('validation reports values JSON cannot hold instead of throwing', () => {
    const issues: EntryIssue[] = [];
    validateEntries(bricks, [{ brick: 'gone', id: 'x', data: odd() }], issues);
    expect(issues.map((i) => [i.entryId, i.path])).toEqual([['x', []]]);
  });

  it('normalizing drops values JSON cannot hold, as JSON.stringify does, and cycles', () => {
    expect(normalizeEntries(bricks, [{ brick: 'gone', id: 'x', data: odd() }])[0]?.data).toEqual({ ok: 1, list: [1, null, null] });
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(normalizeEntries(bricks, [{ brick: 'gone', id: 'x', data: cyclic }])[0]?.data).toEqual({ a: 1 });
  });
});
