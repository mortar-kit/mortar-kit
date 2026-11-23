// Islands in the browser: hydrateIslands finds the page's islands and, given
// loaders (lazyBricks), loads only the bricks they use before hydrating them.
// (Matching the server's markup is checked in a real browser: these tests
// compile without hydration keys.)
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defineBrick, type AnyBrick } from './brick.ts';
import { fields } from './fields.ts';
import { hasIslands, hydrateIslands, lazyBricks } from './islands.tsx';

const note = defineBrick({
  name: 'note',
  interactive: true,
  schema: { text: fields.text({ label: 'Text' }) },
  component: (props) => <p class="note">{props.data.text}</p>,
});
const other = defineBrick({ name: 'other', interactive: true, schema: {}, component: () => <p>other</p> });

function page(...bricks: string[]): HTMLElement {
  const root = document.createElement('main');
  bricks.forEach((brick, i) => {
    const island = document.createElement('div');
    island.setAttribute('data-mortar-island', JSON.stringify({ id: `mi${i + 1}-`, brick, data: { text: `note ${i + 1}` } }));
    root.append(island);
  });
  return root;
}

describe('hydrateIslands', () => {
  // The hydration bootstrap's state, marked done so islands render afresh
  // (these tests compile without hydration keys to claim).
  beforeEach(() => {
    Object.assign(globalThis, { _$HY: { events: [], completed: new WeakSet(), r: {}, fe() {}, done: true } });
  });

  it("loads only the bricks of the page's islands, each once", async () => {
    const loaders = { note: vi.fn(async () => note as AnyBrick), other: vi.fn(async () => other as AnyBrick) };
    const root = page('note', 'note');
    expect(hasIslands(root)).toBe(true);
    const dispose = await hydrateIslands({ bricks: loaders, root });
    expect(loaders.note).toHaveBeenCalledTimes(1);
    expect(loaders.other).not.toHaveBeenCalled();
    expect([...root.querySelectorAll('.note')].map((p) => p.textContent)).toEqual(['note 1', 'note 2']);
    dispose();
  });

  it('leaves an island alone when its brick is unknown or fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = page('missing', 'note');
    await hydrateIslands({ bricks: { note: () => Promise.reject(new Error('offline')) }, root });
    expect(root.querySelector('.note')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('takes the plain list of bricks too', async () => {
    const root = page('note');
    await hydrateIslands({ bricks: [note, other], root });
    expect(root.querySelector('.note')?.textContent).toBe('note 1');
    expect(hasIslands(document.createElement('div'))).toBe(false);
  });
});

describe('lazyBricks', () => {
  it('names each loader after its file and picks the brick of that name from the module', async () => {
    const loaders = lazyBricks({
      './bricks/note.tsx': async () => ({ helper: 1, other, note }),
      './bricks/other.tsx': async () => ({ other }),
    });
    expect(Object.keys(loaders)).toEqual(['note', 'other']);
    expect(await loaders.note!()).toBe(note);
  });

  it('fails clearly when a file has no brick of its name', async () => {
    const loaders = lazyBricks({ './bricks/notes.tsx': async () => ({ note }) });
    await expect(loaders.notes!()).rejects.toThrow('exports no brick named "notes"');
  });
});
