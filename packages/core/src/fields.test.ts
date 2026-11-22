// Unit tests for fields.* and defineBrick: defaults, validation, UI metadata.
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { defineBrick } from './brick.ts';
import { defaultOf, defaultsOf, fieldInfo, fields, referencedCollections, referencesIn } from './fields.ts';

const card = fields.object({
  label: 'Card',
  fields: {
    title: fields.text({ label: 'Title', required: true }),
    image: fields.image({ label: 'Image' }),
  },
});

const brick = defineBrick({
  name: 'test-brick',
  schema: {
    heading: fields.text({ label: 'Heading', required: true, default: 'Hello' }),
    body: fields.textarea({ label: 'Body' }),
    count: fields.number({ label: 'Count', min: 1, max: 5 }),
    visible: fields.boolean({ label: 'Visible', default: true }),
    align: fields.select({ label: 'Align', options: { left: 'Left', right: 'Right' } }),
    link: fields.url({ label: 'Link' }),
    cards: fields.list({ label: 'Cards', of: card, max: 2 }),
  },
  component: () => null,
});

describe('defaults', () => {
  it('fills every field with its default', () => {
    expect(brick.defaults()).toEqual({
      heading: 'Hello',
      body: '',
      count: 1,
      visible: true,
      align: 'left',
      link: '',
      cards: [],
    });
  });

  it('never shares mutable defaults', () => {
    const a = brick.defaults();
    a.cards.push({ title: 'x', image: { src: '', alt: '', asset: '' } });
    expect(brick.defaults().cards).toEqual([]);
  });

  it('builds nested object defaults', () => {
    expect(defaultsOf({ card })).toEqual({ card: { title: '', image: { src: '', alt: '', asset: '' } } });
  });
});

describe('validate', () => {
  it('accepts valid data and fills missing fields', () => {
    const result = brick.validate({ heading: 'Hi', link: '/about' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.align).toBe('left');
  });

  it('reports issues with their path', () => {
    const result = brick.validate({
      heading: '',
      count: 9,
      align: 'middle',
      link: 'not a url',
      cards: [{ title: '' }],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const byPath = Object.fromEntries(result.issues.map((i) => [i.path.join('.'), i.message]));
    expect(byPath).toMatchObject({
      heading: 'Heading is required',
      count: 'Count must be at most 5',
      align: 'Align must be one of: left, right',
      link: 'Link must be an http(s) URL or a path starting with /',
      'cards.0.title': 'Title is required',
    });
  });

  it('accepts absolute URLs, paths, anchors and mailto links', () => {
    for (const link of ['https://example.com', '/x', '#top', 'mailto:a@b.c', '']) {
      expect(brick.validate({ link }).success).toBe(true);
    }
  });
});

describe('fieldInfo', () => {
  it('exposes the UI description of each field', () => {
    expect(fieldInfo(brick.schema.heading)).toMatchObject({ kind: 'text', label: 'Heading' });
    expect(fieldInfo(brick.schema.align)).toMatchObject({ kind: 'select', options: { left: 'Left', right: 'Right' } });
    const list = fieldInfo(brick.schema.cards);
    expect(list?.kind).toBe('list');
    expect(fieldInfo(list!.item!)).toMatchObject({ kind: 'object', label: 'Card' });
  });
});

describe('defineBrick', () => {
  it('rejects invalid names', () => {
    expect(() => defineBrick({ name: 'Hero Banner', schema: {}, component: () => null })).toThrow(/invalid name/);
  });

  it('defaults the label to the name', () => {
    expect(brick.label).toBe('test-brick');
  });
});

describe('links', () => {
  it('rejects script-capable and non-http schemes', () => {
    for (const link of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'ftp://x']) {
      expect(brick.validate({ link }).success, link).toBe(false);
    }
  });

  it('applies the same rule to image src', () => {
    const img = defineBrick({ name: 'img', schema: { image: fields.image({ label: 'Image' }) }, component: () => null });
    expect(img.validate({ image: { src: 'javascript:alert(1)', alt: '' } }).success).toBe(false);
    expect(img.validate({ image: { src: '/a.png', alt: 'A' } }).success).toBe(true);
  });
});

describe('field edge cases', () => {
  it('clamps number defaults into [min, max]', () => {
    expect(defaultsOf({ n: fields.number({ label: 'N', min: 3 }) })).toEqual({ n: 3 });
    expect(defaultsOf({ n: fields.number({ label: 'N', max: -2 }) })).toEqual({ n: -2 });
  });

  it('starts a list with `min` default items', () => {
    const tags = fields.list({ label: 'Tags', of: fields.text({ label: 'Tag', default: 'new' }), min: 2 });
    expect(defaultsOf({ tags })).toEqual({ tags: ['new', 'new'] });
  });

  it('rejects integer-like select values', () => {
    expect(() => fields.select({ label: 'Cols', options: { '2': 'Two', '3': 'Three' } })).toThrow(/integer-like/);
  });

  it('fills missing src/alt inside an image', () => {
    const img = defineBrick({ name: 'img', schema: { image: fields.image({ label: 'Image' }) }, component: () => null });
    const result = img.validate({ image: { src: '/a.png' } });
    expect(result.success && result.data.image).toEqual({ src: '/a.png', alt: '', asset: '' });
  });

  it('records required and maxLength for the form', () => {
    expect(fieldInfo(fields.text({ label: 'T', required: true, maxLength: 5 }))).toMatchObject({ required: true, maxLength: 5 });
    expect(fieldInfo(fields.url({ label: 'U', required: true }))).toMatchObject({ kind: 'url', required: true });
  });
});

describe('normalize', () => {
  it('fills missing fields and replaces wrongly typed ones with defaults', () => {
    const data = brick.normalize({ heading: 42, cards: 'nope', align: 'left', count: 3 });
    expect(data).toEqual({ heading: 'Hello', body: '', count: 3, visible: true, align: 'left', link: '', cards: [] });
  });

  it('keeps right-typed values that break rules, so previews show what was typed', () => {
    const data = brick.normalize({ heading: '', count: 99, link: 'not a url' });
    expect(data).toMatchObject({ heading: '', count: 99, link: 'not a url' });
  });

  it('copes with non-object data', () => {
    expect(brick.normalize(null)).toEqual(brick.defaults());
  });
});

describe('date', () => {
  const day = fields.date({ label: 'Day', required: true });
  const optional = fields.date({ label: 'Day' });
  const check = (f: typeof day, value: unknown) => v.safeParse(f, value).success;

  it('accepts real YYYY-MM-DD dates and rejects the rest', () => {
    expect(check(day, '2026-02-28')).toBe(true);
    expect(check(day, '2024-02-29')).toBe(true);
    expect(check(day, '2026-02-29')).toBe(false);
    expect(check(day, '2026-13-01')).toBe(false);
    expect(check(day, '2026-1-1')).toBe(false);
    expect(check(day, '1 Jan 2026')).toBe(false);
  });

  it("defaults to '' and is required only when asked", () => {
    expect(defaultOf(optional)).toBe('');
    expect(check(optional, '')).toBe(true);
    expect(check(day, '')).toBe(false);
    expect(fieldInfo(day)).toMatchObject({ kind: 'date', required: true });
  });
});

describe('reference', () => {
  const category = fields.reference({ label: 'Category', collection: 'categories', required: true });

  it("stores an id, defaults to '' and records its collection", () => {
    expect(defaultOf(category)).toBe('');
    expect(fieldInfo(category)).toMatchObject({ kind: 'reference', collection: 'categories', required: true });
    expect(v.safeParse(category, 'cat-mugs').success).toBe(true);
    const missing = v.safeParse(category, '');
    expect(!missing.success && missing.issues[0]?.message).toBe('Category is required');
  });

  it('finds references through objects and lists, and lists their collections', () => {
    const schema = {
      main: fields.reference({ label: 'Main', collection: 'categories' }),
      related: fields.list({ label: 'Related', of: fields.reference({ label: 'Post', collection: 'posts' }) }),
      extra: fields.object({ label: 'Extra', fields: { author: fields.reference({ label: 'Author', collection: 'people' }) } }),
      title: fields.text({ label: 'Title' }),
    };
    const data = { main: 'c1', related: ['p1', '', 'p2'], extra: { author: 'a1' }, title: 'x' };
    expect(referencesIn(schema, data)).toEqual([
      { path: ['main'], collection: 'categories', id: 'c1' },
      { path: ['related', 0], collection: 'posts', id: 'p1' },
      { path: ['related', 2], collection: 'posts', id: 'p2' },
      { path: ['extra', 'author'], collection: 'people', id: 'a1' },
    ]);
    expect(referencesIn(schema, null)).toEqual([]);
    expect([...referencedCollections(schema)].sort()).toEqual(['categories', 'people', 'posts']);
  });
});
