// Editor state: the page being edited plus what is selected (an entry, or the
// page's metadata), held in one store. All writes go through the draft
// setter, addressed by a target (an entry id, or PAGE_META) and a path into
// its data (e.g. ['cards', 2, 'title']).
import { normalizePage, type AnyBrick, type Page, type PageEntry, type PageMeta } from '@mortar-kit/core';
import { createStore, snapshot } from 'solid-js';

/** A location inside an entry's data (or the page's metadata). */
export type Path = readonly (string | number)[];

/** Selects (and addresses writes to) the page's metadata instead of an entry. */
export const PAGE_META: unique symbol = Symbol('page meta');

/** What a write is addressed to: an entry, by id, or the page's metadata. */
export type Target = string | typeof PAGE_META;

export interface EditorState {
  page: Page;
  /** Whose form is shown: an entry's id, PAGE_META, or null. */
  selected: Target | null;
}

/** The editor's state and the only ways to change it. */
export interface EditorStore {
  readonly state: EditorState;
  select(target: Target | null): void;
  /**
   * Adds an entry of the named brick with its default data at `index`
   * (default: the end) and selects it. Returns the new id, or undefined if
   * no brick has that name.
   */
  addEntry(brickName: string, index?: number): string | undefined;
  /** Removes an entry. If it was selected, a neighbour (or nothing) is selected. */
  removeEntry(id: string): void;
  /** Moves an entry to `toIndex`. Indexes past either end are ignored. */
  moveEntry(id: string, toIndex: number): void;
  /** Inserts a copy of an entry (new id, cloned data) after it and selects it. Returns the new id. */
  duplicateEntry(id: string): string | undefined;
  /** Sets the value at `path` in an entry's data or the page's metadata. */
  setValue(target: Target, path: Path, value: unknown): void;
  /** Inserts `value` into the list at `path`. */
  insertItem(target: Target, path: Path, index: number, value: unknown): void;
  /** Removes item `index` from the list at `path`. */
  removeItem(target: Target, path: Path, index: number): void;
  /** Moves an item of the list at `path` from one index to another. */
  moveItem(target: Target, path: Path, from: number, to: number): void;
}

/** A new entry id, created when an entry is added (never during render). */
function newId(brickName: string): string {
  return `${brickName}-${crypto.randomUUID()}`;
}

/**
 * Creates the editor store. It is seeded from `page()` (normalized, so every
 * form input has a value to bind; the source is never modified) and
 * re-seeded if `bricks()`, `page()` or `meta()` change, e.g. when a
 * different page is loaded. Edits live in the store until then. With a
 * `meta()` schema the page's metadata is normalized too, and PAGE_META can
 * be selected.
 */
export function createEditorStore(
  bricks: () => readonly AnyBrick[],
  page: () => Page,
  meta: () => PageMeta | undefined = () => undefined,
): EditorStore {
  const [state, setState] = createStore<EditorState>(
    (draft) => {
      const schema = meta();
      const next = normalizePage(bricks(), page(), schema);
      draft.page = next;
      const keep = draft.selected === PAGE_META ? schema !== undefined : next.entries.some((e) => e.id === draft.selected);
      if (!keep) draft.selected = next.entries[0]?.id ?? null;
    },
    { page: { entries: [] }, selected: null },
  );

  /** Runs `fn` on the container at `path` inside the target's data, in a draft. */
  function update(to: Target, path: Path, fn: (container: Record<string | number, unknown>) => void) {
    setState((s) => {
      let target: unknown = to === PAGE_META ? (s.page.meta ??= {}) : s.page.entries.find((e) => e.id === to)?.data;
      for (const key of path) {
        if (typeof target !== 'object' || target === null) return;
        target = (target as Record<string | number, unknown>)[key];
      }
      if (typeof target === 'object' && target !== null) fn(target as Record<string | number, unknown>);
    });
  }

  function list(to: Target, path: Path, fn: (items: unknown[]) => void) {
    update(to, path, (target) => {
      if (Array.isArray(target)) fn(target);
    });
  }

  return {
    state,
    select(target) {
      setState((s) => {
        s.selected = target;
      });
    },
    addEntry(brickName, index) {
      const brick = bricks().find((b) => b.name === brickName);
      if (!brick) return undefined;
      const entry: PageEntry = { brick: brick.name, id: newId(brick.name), data: brick.defaults() };
      setState((s) => {
        s.page.entries.splice(index ?? s.page.entries.length, 0, entry);
        s.selected = entry.id;
      });
      return entry.id;
    },
    removeEntry(id) {
      setState((s) => {
        const index = s.page.entries.findIndex((e) => e.id === id);
        if (index === -1) return;
        s.page.entries.splice(index, 1);
        if (s.selected === id) s.selected = (s.page.entries[index] ?? s.page.entries[index - 1])?.id ?? null;
      });
    },
    moveEntry(id, toIndex) {
      setState((s) => {
        const from = s.page.entries.findIndex((e) => e.id === id);
        if (from === -1 || toIndex < 0 || toIndex >= s.page.entries.length || from === toIndex) return;
        const [entry] = s.page.entries.splice(from, 1);
        s.page.entries.splice(toIndex, 0, entry!);
      });
    },
    duplicateEntry(id) {
      let copyId: string | undefined;
      setState((s) => {
        const index = s.page.entries.findIndex((e) => e.id === id);
        const source = s.page.entries[index];
        if (!source) return;
        copyId = newId(source.brick);
        s.page.entries.splice(index + 1, 0, { brick: source.brick, id: copyId, data: structuredClone(snapshot(source.data)) });
        s.selected = copyId;
      });
      return copyId;
    },
    setValue(target, path, value) {
      const key = path.at(-1);
      if (key === undefined) return;
      update(target, path.slice(0, -1), (parent) => {
        parent[key] = value;
      });
    },
    insertItem(target, path, index, value) {
      list(target, path, (items) => {
        items.splice(index, 0, value);
      });
    },
    removeItem(target, path, index) {
      list(target, path, (items) => {
        items.splice(index, 1);
      });
    },
    moveItem(target, path, from, to) {
      list(target, path, (items) => {
        if (to < 0 || to >= items.length || from === to) return;
        const [item] = items.splice(from, 1);
        items.splice(to, 0, item);
      });
    },
  };
}
