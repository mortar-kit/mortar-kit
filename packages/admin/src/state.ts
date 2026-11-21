// Editor state: the page being edited plus the selected entry, held in one
// store. All writes go through the draft setter, addressed by entry id and a
// path into that entry's data (e.g. ['cards', 2, 'title']).
import { brickMap, type AnyBrick, type Page, type PageEntry } from '@mortar-kit/core';
import { createStore, snapshot } from 'solid-js';

/** A location inside an entry's data. */
export type Path = readonly (string | number)[];

export interface EditorState {
  page: Page;
  /** Id of the entry whose form is shown, or null. */
  selected: string | null;
}

/** The editor's state and the only ways to change it. */
export interface EditorStore {
  readonly state: EditorState;
  select(id: string | null): void;
  /** Sets the value at `path` in an entry's data. */
  setValue(entryId: string, path: Path, value: unknown): void;
  /** Inserts `value` into the list at `path`. */
  insertItem(entryId: string, path: Path, index: number, value: unknown): void;
  /** Removes item `index` from the list at `path`. */
  removeItem(entryId: string, path: Path, index: number): void;
  /** Moves an item of the list at `path` from one index to another. */
  moveItem(entryId: string, path: Path, from: number, to: number): void;
}

/**
 * Normalizes each entry of a known brick (missing fields get defaults) so
 * every form input has a value to bind. Unknown bricks are kept untouched.
 */
export function normalizePage(bricks: readonly AnyBrick[], page: Page): Page {
  const byName = brickMap(bricks);
  return page.map((entry): PageEntry => {
    const brick = byName.get(entry.brick);
    return brick ? { ...entry, data: brick.normalize(entry.data) } : { ...entry, data: snapshot(entry.data) };
  });
}

/**
 * Creates the editor store. It is seeded from `page()` (normalized; the source
 * is never modified) and re-seeded if `bricks()` or `page()` change, e.g. when
 * a different page is loaded. Edits live in the store until then.
 */
export function createEditorStore(bricks: () => readonly AnyBrick[], page: () => Page): EditorStore {
  const [state, setState] = createStore<EditorState>(
    (draft) => {
      const next = normalizePage(bricks(), page());
      draft.page = next;
      if (!next.some((e) => e.id === draft.selected)) draft.selected = next[0]?.id ?? null;
    },
    { page: [], selected: null },
  );

  /** Runs `fn` on the container at `path` inside the entry's data, in a draft. */
  function update(entryId: string, path: Path, fn: (container: Record<string | number, unknown>) => void) {
    setState((s) => {
      const entry = s.page.find((e) => e.id === entryId);
      if (!entry) return;
      let target: unknown = entry.data;
      for (const key of path) {
        if (typeof target !== 'object' || target === null) return;
        target = (target as Record<string | number, unknown>)[key];
      }
      if (typeof target === 'object' && target !== null) fn(target as Record<string | number, unknown>);
    });
  }

  function list(entryId: string, path: Path, fn: (items: unknown[]) => void) {
    update(entryId, path, (target) => {
      if (Array.isArray(target)) fn(target);
    });
  }

  return {
    state,
    select(id) {
      setState((s) => {
        s.selected = id;
      });
    },
    setValue(entryId, path, value) {
      const key = path.at(-1);
      if (key === undefined) return;
      update(entryId, path.slice(0, -1), (parent) => {
        parent[key] = value;
      });
    },
    insertItem(entryId, path, index, value) {
      list(entryId, path, (items) => {
        items.splice(index, 0, value);
      });
    },
    removeItem(entryId, path, index) {
      list(entryId, path, (items) => {
        items.splice(index, 1);
      });
    },
    moveItem(entryId, path, from, to) {
      list(entryId, path, (items) => {
        if (to < 0 || to >= items.length || from === to) return;
        const [item] = items.splice(from, 1);
        items.splice(to, 0, item);
      });
    },
  };
}
