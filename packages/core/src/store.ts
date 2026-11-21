// Storage. A `ContentStore` is the small adapter that keeps raw documents
// by collection and slug (in memory here; JSON files in
// `@mortar-kit/core/server`, so `node:fs` never reaches a client bundle).
// `createContent` puts every document through the rules whichever store is
// used: normalize on read, validate and keep slugs unique on save, list
// with filters and order, and refuse to delete a document others reference.
// Writes through one `createContent` run one at a time, so those checks
// hold; several server processes sharing one store need it to lock.
import { brickMap, type AnyBrick } from './brick.ts';
import { collectionMap, type AnyCollection, type SortOrder } from './collection.ts';
import { isValidSlug, normalizeDoc, validateDoc, type Doc, type DocIssue, type DocRef, type DocSummary } from './doc.ts';
import { referencedCollections, referencesIn } from './fields.ts';

/**
 * Where documents live: raw data by collection name and slug. Implement it
 * to keep content anywhere (files, a database, an API). Deliberately dumb;
 * `createContent` applies every rule.
 */
export interface ContentStore {
  /** Every stored document of the collection, raw, each with `slug` set by the store (the key wins). [] if none. */
  list(collection: string): Promise<unknown[]>;
  /** The raw document under `slug` (with `slug` set), or undefined. Throws if it exists but can't be read. */
  get(collection: string, slug: string): Promise<unknown>;
  /** Stores `doc` under `doc.slug`, replacing any document there. */
  put(collection: string, doc: Doc): Promise<void>;
  /** Removes the document under `slug`; nothing happens if there is none. */
  remove(collection: string, slug: string): Promise<void>;
}

/** Options for listing documents. Plain JSON, so they can cross a server function. */
export interface ListOptions {
  /** Keep documents whose `id`, `slug` or top-level field equals each value. */
  where?: Record<string, string | number | boolean>;
  /** Order. Defaults to the collection's `sort`; ties are ordered by slug. */
  sort?: SortOrder;
  /** At most this many documents: an integer from 1 to 100. */
  limit?: number;
}

/** Reading documents by collection name: what bricks, layouts and routes need. */
export interface ContentSource {
  /** Documents of a collection, without their bodies. */
  list(collection: string, options?: ListOptions): Promise<DocSummary[]>;
  /** One document, or null if there is none. */
  get(collection: string, ref: DocRef): Promise<Doc | null>;
  /**
   * Called before each brick load, where reads are tracked: read a signal
   * here to make every load run again when it changes (the admin preview
   * does, after each save).
   */
  track?(): void;
}

/** Result of `Content.save`. */
export type SaveResult = { ok: true } | { ok: false; issues: DocIssue[] };

/** A document holding a reference, and where. With `entryId`, `path` is inside that entry's data; otherwise it starts with `'fields'`. */
export interface Referrer {
  collection: string;
  id: string;
  slug: string;
  title: string;
  entryId?: string;
  path: (string | number)[];
}

/** Result of `Content.remove`. */
export type RemoveResult = { ok: true } | { ok: false; referencedBy: Referrer[] };

/** Reading and writing documents: what the admin needs. */
export interface Content extends ContentSource {
  /**
   * Validates a document (from an untrusted client) and stores it. Problems
   * are returned, not thrown. Renaming its slug moves it. Writes through one
   * `Content` run one at a time.
   */
  save(collection: string, doc: unknown): Promise<SaveResult>;
  /** Deletes a document by id, unless other documents reference it (then they are returned). */
  remove(collection: string, id: string): Promise<RemoveResult>;
}

/** A store that keeps documents in memory (tests, demos). Documents are copied in and out. */
export function createMemoryStore(seed: Record<string, Doc[]> = {}): ContentStore {
  const data = new Map<string, Map<string, Doc>>();
  const folder = (collection: string) => {
    let map = data.get(collection);
    if (!map) data.set(collection, (map = new Map()));
    return map;
  };
  for (const [collection, docs] of Object.entries(seed)) for (const doc of docs) folder(collection).set(doc.slug, structuredClone(doc));
  return {
    async list(collection) {
      return [...folder(collection).values()].map((doc) => structuredClone(doc));
    },
    async get(collection, slug) {
      const doc = folder(collection).get(slug);
      return doc && structuredClone(doc);
    },
    async put(collection, doc) {
      if (!isValidSlug(doc.slug)) throw new Error(`Mortar: invalid slug "${doc.slug}"`);
      folder(collection).set(doc.slug, structuredClone(doc));
    },
    async remove(collection, slug) {
      folder(collection).delete(slug);
    },
  };
}

export interface ContentOptions {
  store: ContentStore;
  collections: readonly AnyCollection[];
  bricks: readonly AnyBrick[];
}

/**
 * The rules around a store. Collection names are checked on every call (a
 * server function receives them from the client): an unknown one throws.
 * Throws at creation if a reference field names an unknown collection.
 */
export function createContent(options: ContentOptions): Content {
  const { store, bricks } = options;
  const collections = collectionMap(options.collections);
  const byBrick = brickMap(bricks);
  for (const [where, schema] of [
    ...options.collections.map((c) => [`collection "${c.name}"`, c.fields] as const),
    ...bricks.map((b) => [`brick "${b.name}"`, b.schema] as const),
  ]) {
    for (const name of referencedCollections(schema)) {
      if (!collections.has(name)) throw new Error(`Mortar: ${where} references unknown collection "${name}"`);
    }
  }

  const need = (name: string): AnyCollection => {
    const c = typeof name === 'string' ? collections.get(name) : undefined;
    if (!c) throw new Error(`Unknown collection "${String(name)}"`);
    return c;
  };

  /** Every stored copy of every document, normalized, by slug. */
  async function copies(c: AnyCollection): Promise<Doc[]> {
    return (await store.list(c.name)).map((raw) => normalizeDoc(c, bricks, raw)).sort((a, b) => compare(a.slug, b.slug));
  }

  /**
   * Every document, normalized. Two copies share an id only after a rename
   * was cut short (a crash between writing the new file and removing the
   * old one): until the next save or delete of that document removes the
   * other copy, the first by slug is listed, which may be the older one.
   */
  async function all(c: AnyCollection): Promise<Doc[]> {
    const seen = new Set<string>();
    return (await copies(c)).filter((doc) => !seen.has(doc.id) && seen.add(doc.id));
  }

  // Writes run one at a time, so each check (a free slug, no references)
  // still holds when its write lands. Within this process only: several
  // processes sharing one store need the store to lock.
  let writes: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = writes.then(fn, fn);
    writes = run.catch(() => {});
    return run;
  };

  return {
    async list(name, listOptions = {}) {
      const c = need(name);
      const { where, sort, limit } = checkListOptions(c, listOptions);
      const docs = (await all(c)).filter((doc) => Object.entries(where).every(([key, value]) => valueOf(doc, key) === value));
      const direction = sort.order === 'desc' ? -1 : 1;
      docs.sort((a, b) => direction * compare(valueOf(a, sort.field), valueOf(b, sort.field)) || compare(a.slug, b.slug));
      return docs.slice(0, limit).map(withoutBody);
    },

    async get(name, ref) {
      const c = need(name);
      if ('slug' in ref) {
        if (typeof ref.slug !== 'string' || !isValidSlug(ref.slug)) return null;
        const raw = await store.get(c.name, ref.slug);
        return raw === undefined ? null : normalizeDoc(c, bricks, raw);
      }
      return (await all(c)).find((doc) => doc.id === ref.id) ?? null;
    },

    async save(name, raw) {
      const c = need(name);
      const result = validateDoc(c, bricks, raw);
      if (!result.success) return { ok: false, issues: result.issues };
      const doc = result.doc;
      return oneAtATime(async (): Promise<SaveResult> => {
        // Read the target slug itself, so an unreadable file there fails the save instead of being overwritten.
        const occupant = await store.get(c.name, doc.slug);
        if (occupant !== undefined && normalizeDoc(c, bricks, occupant).id !== doc.id) {
          return { ok: false, issues: [{ path: ['slug'], message: `Another document in ${c.label} already uses the slug "${doc.slug}"` }] };
        }
        await store.put(c.name, doc);
        // A rename moves the document: remove its old copy (and any a cut-short rename left).
        for (const old of await copies(c)) if (old.id === doc.id && old.slug !== doc.slug) await store.remove(c.name, old.slug);
        return { ok: true };
      });
    },

    remove(name, id) {
      const c = need(name);
      return oneAtATime(() => removeNow(c, id));
    },
  };

  async function removeNow(c: AnyCollection, id: string): Promise<RemoveResult> {
    const target = (await all(c)).find((doc) => doc.id === id);
    if (!target) return { ok: true };
    const referencedBy: Referrer[] = [];
    const bodyRefs = bricks.some((b) => referencedCollections(b.schema).has(c.name));
    for (const k of collections.values()) {
      const inFields = referencedCollections(k.fields).has(c.name);
      if (!inFields && !(k.body && bodyRefs)) continue;
      for (const doc of await all(k)) {
        if (k === c && doc.id === id) continue;
        const at = { collection: k.name, id: doc.id, slug: doc.slug, title: k.titleOf(doc) };
        for (const ref of referencesIn(k.fields, doc.fields)) {
          if (ref.collection === c.name && ref.id === id) referencedBy.push({ ...at, path: ['fields', ...ref.path] });
        }
        if (!k.body) continue;
        for (const entry of doc.entries ?? []) {
          const brick = byBrick.get(entry.brick);
          if (!brick) continue;
          for (const ref of referencesIn(brick.schema, entry.data)) {
            if (ref.collection === c.name && ref.id === id) referencedBy.push({ ...at, entryId: entry.id, path: ref.path });
          }
        }
      }
    }
    if (referencedBy.length > 0) return { ok: false, referencedBy };
    for (const copy of await copies(c)) if (copy.id === id) await store.remove(c.name, copy.slug);
    return { ok: true };
  }
}

/** Checks list options from an untrusted caller and fills in the defaults. Throws on bad options. */
function checkListOptions(c: AnyCollection, o: ListOptions): { where: Record<string, unknown>; sort: Required<SortOrder>; limit: number | undefined } {
  const known = (key: string) => key === 'id' || key === 'slug' || Object.hasOwn(c.fields, key);
  if (typeof o !== 'object' || o === null) throw new Error('List options must be an object');
  const where = o.where ?? {};
  if (typeof where !== 'object' || where === null) throw new Error('where must be an object');
  for (const [key, value] of Object.entries(where)) {
    if (!known(key)) throw new Error(`Cannot filter ${c.name} by unknown field "${key}"`);
    if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`where.${key} must be a string, number or boolean`);
  }
  const sort = o.sort ? { field: o.sort.field, order: o.sort.order ?? 'asc' } : c.sort;
  if (typeof sort.field !== 'string' || !known(sort.field)) throw new Error(`Cannot sort ${c.name} by unknown field "${String(sort.field)}"`);
  if (sort.order !== 'asc' && sort.order !== 'desc') throw new Error(`sort.order must be 'asc' or 'desc'`);
  if (o.limit !== undefined && !(Number.isInteger(o.limit) && o.limit >= 1 && o.limit <= 100)) throw new Error('limit must be an integer from 1 to 100');
  return { where, sort, limit: o.limit };
}

function valueOf(doc: Doc, key: string): unknown {
  return key === 'id' ? doc.id : key === 'slug' ? doc.slug : doc.fields[key];
}

/** Strings by locale, numbers and booleans by value; anything else after them. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if ((typeof a === 'number' || typeof a === 'boolean') && typeof a === typeof b) return Number(a) - Number(b);
  return rank(a) - rank(b);
}

function rank(value: unknown): number {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? 0 : 1;
}

function withoutBody(doc: Doc): DocSummary {
  const { entries: _, ...summary } = doc;
  return summary;
}
