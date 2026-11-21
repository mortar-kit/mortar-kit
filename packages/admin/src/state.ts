// Editor state: the document being edited plus what is selected (one of its
// entries, or its fields), held in one store. All writes go through the
// draft setter, addressed by a target (an entry id, or FIELDS) and a path
// into its data (e.g. ['cards', 2, 'title']).
import { normalizeDoc, type AnyBrick, type AnyCollection, type Doc, type PageEntry } from '@mortar-kit/core';
import { createStore, snapshot } from 'solid-js';

/** A location inside an entry's data (or the document's fields). */
export type Path = readonly (string | number)[];

/** Selects (and addresses writes to) the document's fields instead of an entry. */
export const FIELDS: unique symbol = Symbol('fields');

/** What a write is addressed to: an entry, by id, or the document's fields. */
export type Target = string | typeof FIELDS;

export interface EditorState {
  doc: Doc;
  /** Whose form is shown: an entry's id, FIELDS, or null. */
  selected: Target | null;
}

/** The editor's state and the only ways to change it. */
export interface EditorStore {
  readonly state: EditorState;
  select(target: Target | null): void;
  /** Sets the document's slug (checked when saving). */
  setSlug(slug: string): void;
  /**
   * Adds an entry of the named brick with its default data at `index`
   * (default: the end) and selects it. Returns the new id, or undefined if
   * no brick has that name or the collection has no body.
   */
  addEntry(brickName: string, index?: number): string | undefined;
  /** Removes an entry. If it was selected, a neighbour (or the fields) is selected. */
  removeEntry(id: string): void;
  /** Moves an entry to `toIndex`. Indexes past either end are ignored. */
  moveEntry(id: string, toIndex: number): void;
  /** Inserts a copy of an entry (new id, cloned data) after it and selects it. Returns the new id. */
  duplicateEntry(id: string): string | undefined;
  /** Sets the value at `path` in an entry's data or the document's fields. */
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
 * Creates the editor store. It is seeded from `doc()` (normalized, so every
 * form input has a value to bind; the source is never modified) and
 * re-seeded if `bricks()`, `collection()` or `doc()` change, e.g. when a
 * different document is loaded. Edits live in the store until then. The
 * first entry is selected, or the fields when there is no body.
 */
export function createEditorStore(bricks: () => readonly AnyBrick[], collection: () => AnyCollection, doc: () => Doc): EditorStore {
  const [state, setState] = createStore<EditorState>(
    (draft) => {
      const c = collection();
      const next = normalizeDoc(c, bricks(), doc());
      draft.doc = next;
      const entries = c.body ? (next.entries ?? []) : [];
      const keep = draft.selected === FIELDS || entries.some((e) => e.id === draft.selected);
      if (!keep) draft.selected = entries[0]?.id ?? FIELDS;
    },
    { doc: { id: '', slug: '', fields: {} }, selected: null },
  );

  /** The body's entries in a draft, created if missing; undefined without a body. */
  const body = (s: EditorState): PageEntry[] | undefined => (collection().body ? (s.doc.entries ??= []) : undefined);

  /** Runs `fn` on the container at `path` inside the target's data, in a draft. */
  function update(to: Target, path: Path, fn: (container: Record<string | number, unknown>) => void) {
    setState((s) => {
      let target: unknown = to === FIELDS ? s.doc.fields : s.doc.entries?.find((e) => e.id === to)?.data;
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
    setSlug(slug) {
      setState((s) => {
        s.doc.slug = slug;
      });
    },
    addEntry(brickName, index) {
      const brick = bricks().find((b) => b.name === brickName);
      if (!brick || !collection().body) return undefined;
      const entry: PageEntry = { brick: brick.name, id: newId(brick.name), data: brick.defaults() };
      setState((s) => {
        const entries = body(s)!;
        entries.splice(index ?? entries.length, 0, entry);
        s.selected = entry.id;
      });
      return entry.id;
    },
    removeEntry(id) {
      setState((s) => {
        const entries = body(s);
        const index = entries?.findIndex((e) => e.id === id) ?? -1;
        if (!entries || index === -1) return;
        entries.splice(index, 1);
        if (s.selected === id) s.selected = (entries[index] ?? entries[index - 1])?.id ?? FIELDS;
      });
    },
    moveEntry(id, toIndex) {
      setState((s) => {
        const entries = body(s);
        const from = entries?.findIndex((e) => e.id === id) ?? -1;
        if (!entries || from === -1 || toIndex < 0 || toIndex >= entries.length || from === toIndex) return;
        const [entry] = entries.splice(from, 1);
        entries.splice(toIndex, 0, entry!);
      });
    },
    duplicateEntry(id) {
      let copyId: string | undefined;
      setState((s) => {
        const entries = body(s);
        const index = entries?.findIndex((e) => e.id === id) ?? -1;
        const source = entries?.[index];
        if (!entries || !source) return;
        copyId = newId(source.brick);
        entries.splice(index + 1, 0, { brick: source.brick, id: copyId, data: structuredClone(snapshot(source.data)) });
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
