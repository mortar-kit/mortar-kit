// Editor store: path-addressed writes, list operations, the slug, the
// document's fields and seeding. (A client test: the server build of Solid
// runs computations once, so re-seeding can only be observed here.)
import type { AnyCollection, Doc } from '@mortar-kit/core';
import { createRoot, createSignal, flush, snapshot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createEditorStore, FIELDS } from './state.ts';
import { author, authors, bricks, doc, pages } from './test/bricks.tsx';

function setup(source: Doc = doc(), collection: AnyCollection = pages) {
  return createRoot(() => {
    const editor = createEditorStore(
      () => bricks,
      () => collection,
      () => source,
    );
    flush();
    return editor;
  });
}

/** The body's entries (always present for `pages`). */
const entriesOf = (editor: ReturnType<typeof setup>) => editor.state.doc.entries ?? [];

describe('createEditorStore', () => {
  it('selects the first entry', () => {
    expect(setup().state.selected).toBe('h');
  });

  it('sets nested values by path', () => {
    const editor = setup();
    editor.setValue('t', ['items', 1, 'name'], 'B');
    editor.setValue('h', ['text'], 'Hi');
    flush();
    expect(snapshot(entriesOf(editor)[1]?.data)).toEqual({ items: [{ name: 'a' }, { name: 'B' }] });
    expect(entriesOf(editor)[0]?.data.text).toBe('Hi');
  });

  it('inserts, moves and removes list items', () => {
    const editor = setup();
    editor.insertItem('t', ['items'], 2, { name: 'c' });
    flush();
    editor.moveItem('t', ['items'], 2, 0);
    flush();
    expect(snapshot(entriesOf(editor)[1]?.data.items)).toEqual([{ name: 'c' }, { name: 'a' }, { name: 'b' }]);
    editor.removeItem('t', ['items'], 1);
    flush();
    expect(snapshot(entriesOf(editor)[1]?.data.items)).toEqual([{ name: 'c' }, { name: 'b' }]);
  });

  it('ignores moves past either end and unknown entries', () => {
    const editor = setup();
    editor.moveItem('t', ['items'], 0, -1);
    editor.moveItem('t', ['items'], 1, 2);
    editor.setValue('nope', ['text'], 'x');
    flush();
    expect(snapshot(entriesOf(editor)[1]?.data.items)).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  it('never writes through to the source document', () => {
    const source = doc();
    const editor = setup(source);
    editor.setValue('t', ['items', 0, 'name'], 'changed');
    editor.setValue(FIELDS, ['title'], 'changed');
    editor.setSlug('changed');
    flush();
    expect(source).toEqual(doc());
  });

  it('adds entries with default data and selects them', () => {
    const editor = setup();
    const id = editor.addEntry('heading', 1);
    flush();
    expect(id).toMatch(/^heading-[0-9a-f-]{36}$/);
    expect(entriesOf(editor).map((e) => e.id)).toEqual(['h', id, 't']);
    expect(snapshot(entriesOf(editor)[1]?.data)).toEqual({ text: 'Hello', size: 2, tone: 'plain', shown: true });
    expect(editor.state.selected).toBe(id);

    const last = editor.addEntry('tags');
    flush();
    expect(entriesOf(editor).at(-1)?.id).toBe(last);
    expect(editor.addEntry('nope')).toBeUndefined();
  });

  it('keeps edits when selecting and adding entries', () => {
    const editor = setup();
    editor.setValue('h', ['text'], 'edited');
    flush();
    editor.select('t');
    editor.addEntry('tags');
    flush();
    expect(entriesOf(editor)[0]?.data.text).toBe('edited');
  });

  it('removes entries and selects a neighbour, then the details', () => {
    const editor = setup();
    editor.addEntry('tags');
    flush();
    const [, , third] = entriesOf(editor).map((e) => e.id);
    editor.select('t');
    editor.removeEntry('t');
    flush();
    expect(editor.state.selected).toBe(third);
    editor.removeEntry(third!);
    flush();
    expect(editor.state.selected).toBe('h');
    editor.removeEntry('h');
    flush();
    expect(editor.state.doc.entries).toEqual([]);
    expect(editor.state.selected).toBe(FIELDS);
  });

  it('keeps the selection when another entry is removed', () => {
    const editor = setup();
    editor.removeEntry('t');
    flush();
    expect(editor.state.selected).toBe('h');
  });

  it('moves entries, ignoring moves past either end', () => {
    const editor = setup();
    const first = entriesOf(editor)[0];
    editor.moveEntry('h', 1);
    flush();
    expect(entriesOf(editor).map((e) => e.id)).toEqual(['t', 'h']);
    expect(entriesOf(editor)[1]).toBe(first);
    editor.moveEntry('h', 2);
    editor.moveEntry('t', -1);
    flush();
    expect(entriesOf(editor).map((e) => e.id)).toEqual(['t', 'h']);
  });

  it('duplicates an entry with a new id and an independent copy of its data', () => {
    const editor = setup();
    editor.setValue('t', ['items', 0, 'name'], 'edited');
    const id = editor.duplicateEntry('t');
    flush();
    expect(entriesOf(editor).map((e) => e.id)).toEqual(['h', 't', id]);
    expect(editor.state.selected).toBe(id);
    expect(snapshot(entriesOf(editor)[2]?.data)).toEqual({ items: [{ name: 'edited' }, { name: 'b' }] });
    editor.setValue(id!, ['items', 0, 'name'], 'copy');
    flush();
    expect(entriesOf(editor)[1]?.data).toEqual({ items: [{ name: 'edited' }, { name: 'b' }] });
    expect(editor.duplicateEntry('nope')).toBeUndefined();
  });

  it('re-seeds when the source document changes', () => {
    const [source, setSource] = createSignal(doc());
    const editor = createRoot(() =>
      createEditorStore(
        () => bricks,
        () => pages,
        source,
      ),
    );
    flush();
    editor.setValue('h', ['text'], 'edited');
    flush();
    setSource({ id: 'other-id', slug: 'other', fields: {}, entries: [{ brick: 'heading', id: 'other', data: {} }] });
    flush();
    expect(entriesOf(editor).map((e) => e.id)).toEqual(['other']);
    expect(editor.state.doc.slug).toBe('other');
    expect(editor.state.selected).toBe('other');
  });

  it('selects the details when the body is empty', () => {
    expect(setup({ ...doc(), entries: [] }).state.selected).toBe(FIELDS);
  });
});

describe('createEditorStore: slug and fields', () => {
  it('sets the slug', () => {
    const editor = setup();
    editor.setSlug('about-us');
    flush();
    expect(editor.state.doc.slug).toBe('about-us');
    expect(editor.state.doc.id).toBe('home-id');
  });

  it('normalizes the fields and writes to them through FIELDS', () => {
    const editor = setup({ ...doc(), fields: {} });
    expect(editor.state.doc.fields).toEqual({ title: 'Untitled' });
    editor.select(FIELDS);
    editor.setValue(FIELDS, ['title'], 'About');
    flush();
    expect(editor.state.selected).toBe(FIELDS);
    expect(snapshot(editor.state.doc.fields)).toEqual({ title: 'About' });
  });

  it('keeps the details selected on re-seed', () => {
    const [source, setSource] = createSignal(doc());
    const editor = createRoot(() =>
      createEditorStore(
        () => bricks,
        () => pages,
        source,
      ),
    );
    flush();
    editor.select(FIELDS);
    flush();
    setSource({ ...doc(), fields: { title: 'Other' } });
    flush();
    expect(editor.state.selected).toBe(FIELDS);
    expect(editor.state.doc.fields).toEqual({ title: 'Other' });
  });

  it('falls back to the first entry when the selected entry goes away on re-seed', () => {
    const [source, setSource] = createSignal(doc());
    const editor = createRoot(() =>
      createEditorStore(
        () => bricks,
        () => pages,
        source,
      ),
    );
    flush();
    editor.select('t');
    flush();
    setSource({ ...doc(), entries: [{ brick: 'heading', id: 'x', data: {} }] });
    flush();
    expect(editor.state.selected).toBe('x');
  });
});

describe('createEditorStore without a body', () => {
  it('selects the details and has no entries to edit', () => {
    const editor = setup(author(), authors);
    expect(editor.state.selected).toBe(FIELDS);
    expect(editor.state.doc.entries).toBeUndefined();
    expect(editor.addEntry('heading')).toBeUndefined();
    flush();
    expect(editor.state.doc.entries).toBeUndefined();
    expect(editor.state.selected).toBe(FIELDS);
  });

  it('keeps stored entries untouched and never selects them', () => {
    const stored = { ...author(), entries: [{ brick: 'heading', id: 'h', data: { text: 'Kept' } }] };
    const editor = setup(stored, authors);
    expect(editor.state.selected).toBe(FIELDS);
    editor.removeEntry('h');
    editor.moveEntry('h', 0);
    expect(editor.duplicateEntry('h')).toBeUndefined();
    flush();
    expect(snapshot(editor.state.doc.entries)).toEqual(stored.entries);
  });

  it('edits the fields', () => {
    const editor = setup(author(), authors);
    editor.setValue(FIELDS, ['bio'], 'Mathematician');
    flush();
    expect(snapshot(editor.state.doc.fields)).toEqual({ name: 'Ada', bio: 'Mathematician' });
  });
});
