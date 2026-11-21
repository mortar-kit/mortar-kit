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
