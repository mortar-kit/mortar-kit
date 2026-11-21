// Editor store: path-addressed writes, list operations and seeding. (A client
// test: the server build of Solid runs computations once, so re-seeding
// can only be observed here.)
import { createRoot, createSignal, flush, snapshot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createEditorStore, normalizePage } from './state.ts';
import { bricks, page } from './test/bricks.tsx';

function setup(source = page()) {
  return createRoot(() => {
    const editor = createEditorStore(() => bricks, () => source);
    flush();
    return editor;
  });
}

describe('normalizePage', () => {
  it('fills defaults without touching the source page', () => {
    const source = page();
    const out = normalizePage(bricks, source);
    expect(out[0]?.data).toEqual({ text: 'Welcome', size: 2, tone: 'plain', shown: true });
    expect(source[0]?.data).toEqual({ text: 'Welcome' });
  });

  it('keeps entries of unknown bricks', () => {
    expect(normalizePage(bricks, [{ brick: 'gone', id: 'x', data: { a: 1 } }])).toEqual([{ brick: 'gone', id: 'x', data: { a: 1 } }]);
  });
});

describe('createEditorStore', () => {
  it('selects the first entry', () => {
    expect(setup().state.selected).toBe('h');
  });

  it('sets nested values by path', () => {
    const editor = setup();
    editor.setValue('t', ['items', 1, 'name'], 'B');
    editor.setValue('h', ['text'], 'Hi');
    flush();
    expect(snapshot(editor.state.page[1]?.data)).toEqual({ items: [{ name: 'a' }, { name: 'B' }] });
    expect(editor.state.page[0]?.data.text).toBe('Hi');
  });

  it('inserts, moves and removes list items', () => {
    const editor = setup();
    editor.insertItem('t', ['items'], 2, { name: 'c' });
    flush();
    editor.moveItem('t', ['items'], 2, 0);
    flush();
    expect(snapshot(editor.state.page[1]?.data.items)).toEqual([{ name: 'c' }, { name: 'a' }, { name: 'b' }]);
    editor.removeItem('t', ['items'], 1);
    flush();
    expect(snapshot(editor.state.page[1]?.data.items)).toEqual([{ name: 'c' }, { name: 'b' }]);
  });

  it('ignores moves past either end and unknown entries', () => {
    const editor = setup();
    editor.moveItem('t', ['items'], 0, -1);
    editor.moveItem('t', ['items'], 1, 2);
    editor.setValue('nope', ['text'], 'x');
    flush();
    expect(snapshot(editor.state.page[1]?.data.items)).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  it('never writes through to the source page', () => {
    const source = page();
    const editor = setup(source);
    editor.setValue('t', ['items', 0, 'name'], 'changed');
    flush();
    expect(source[1]?.data).toEqual({ items: [{ name: 'a' }, { name: 'b' }] });
  });

  it('adds entries with default data and selects them', () => {
    const editor = setup();
    const id = editor.addEntry('heading', 1);
    flush();
    expect(id).toMatch(/^heading-[0-9a-f-]{36}$/);
    expect(editor.state.page.map((e) => e.id)).toEqual(['h', id, 't']);
    expect(snapshot(editor.state.page[1]?.data)).toEqual({ text: 'Hello', size: 2, tone: 'plain', shown: true });
    expect(editor.state.selected).toBe(id);

    const last = editor.addEntry('tags');
    flush();
    expect(editor.state.page.at(-1)?.id).toBe(last);
    expect(editor.addEntry('nope')).toBeUndefined();
  });

  it('keeps edits when selecting and adding entries', () => {
    const editor = setup();
    editor.setValue('h', ['text'], 'edited');
    flush();
    editor.select('t');
    editor.addEntry('tags');
    flush();
    expect(editor.state.page[0]?.data.text).toBe('edited');
  });

  it('removes entries and selects a neighbour', () => {
    const editor = setup();
    editor.addEntry('tags');
    flush();
    const [, , third] = editor.state.page.map((e) => e.id);
    editor.select('t');
    editor.removeEntry('t');
    flush();
    expect(editor.state.selected).toBe(third);
    editor.removeEntry(third!);
    flush();
    expect(editor.state.selected).toBe('h');
    editor.removeEntry('h');
    flush();
    expect(editor.state.page).toEqual([]);
    expect(editor.state.selected).toBeNull();
  });

  it('keeps the selection when another entry is removed', () => {
    const editor = setup();
    editor.removeEntry('t');
    flush();
    expect(editor.state.selected).toBe('h');
  });

  it('moves entries, ignoring moves past either end', () => {
    const editor = setup();
    const first = editor.state.page[0];
    editor.moveEntry('h', 1);
    flush();
    expect(editor.state.page.map((e) => e.id)).toEqual(['t', 'h']);
    expect(editor.state.page[1]).toBe(first);
    editor.moveEntry('h', 2);
    editor.moveEntry('t', -1);
    flush();
    expect(editor.state.page.map((e) => e.id)).toEqual(['t', 'h']);
  });

  it('duplicates an entry with a new id and an independent copy of its data', () => {
    const editor = setup();
    editor.setValue('t', ['items', 0, 'name'], 'edited');
    const id = editor.duplicateEntry('t');
    flush();
    expect(editor.state.page.map((e) => e.id)).toEqual(['h', 't', id]);
    expect(editor.state.selected).toBe(id);
    expect(snapshot(editor.state.page[2]?.data)).toEqual({ items: [{ name: 'edited' }, { name: 'b' }] });
    editor.setValue(id!, ['items', 0, 'name'], 'copy');
    flush();
    expect(editor.state.page[1]?.data).toEqual({ items: [{ name: 'edited' }, { name: 'b' }] });
    expect(editor.duplicateEntry('nope')).toBeUndefined();
  });

  it('re-seeds when the source page changes', () => {
    const [source, setSource] = createSignal(page());
    const editor = createRoot(() => createEditorStore(() => bricks, source));
    flush();
    editor.setValue('h', ['text'], 'edited');
    flush();
    setSource([{ brick: 'heading', id: 'other', data: {} }]);
    flush();
    expect(editor.state.page.map((e) => e.id)).toEqual(['other']);
    expect(editor.state.selected).toBe('other');
  });
});
