// Storage. A `ContentStore` is the small adapter that keeps raw documents
// by collection and slug (in memory here; JSON files in
// `@mortar-kit/core/server`, so `node:fs` never reaches a client bundle).
// `createContent` puts every document through the rules whichever store is
// used: normalize on read, validate and keep slugs unique on save, list
// with filters and order, keep orderable collections in their manual order,
// and refuse to delete a document others reference.
// Writes through one `createContent` run one at a time, so those checks
// hold; several server processes sharing one store need it to lock. With a
// `BlobStore` it also keeps assets: uploads are checked, documents store
// an asset's key (its URL is filled in on read), and an asset documents
// use can't be deleted. Asset details (default title and alt text, folder)
// and folders are one document in the content store (`ASSET_LIBRARY`), so
// every blob store gets them with no change.
import {
  assetInfo,
  assetKeyFor,
  isValidAssetKey,
  randomSuffix,
  type Asset,
  type AssetDetails,
  type AssetFolder,
  type BlobStore,
} from './assets.ts';
import { brickMap, type AnyBrick } from './brick.ts';
import { collectionMap, type AnyCollection, type SortOrder } from './collection.ts';
import { isValidSlug, normalizeDoc, validateDoc, type Doc, type DocIssue, type DocRef, type DocSummary } from './doc.ts';
import { assetsIn, assetValuesIn, hasAssetFields, referencedCollections, referencesIn, type Fields } from './fields.ts';

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
  /**
   * Order. Defaults to the collection's manual order when it is
   * `orderable`, otherwise its `sort`; ties are ordered by slug.
   */
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

/** Result of `Assets.upload`. */
export type UploadResult = { ok: true; asset: Asset } | { ok: false; message: string };

/** Result of `Assets.update`. */
export type UpdateAssetResult = { ok: true; asset: Asset } | { ok: false; message: string };

/** Result of `Assets.saveFolder`. */
export type FolderResult = { ok: true; folder: AssetFolder } | { ok: false; message: string };

/**
 * Uploaded files: what the admin's library and pickers need. The methods
 * marked optional are always there from `createContent`; an app wrapping
 * them (in server functions) may leave them out, and the admin then hides
 * what needs them (details, folders).
 */
export interface Assets {
  /** Every uploaded file, newest first. */
  list(): Promise<Asset[]>;
  /**
   * Checks a file (type by its name's extension, size) and stores it under
   * a fresh key, with `details` (e.g. the folder to put it in). Problems are
   * returned, not thrown.
   */
  upload(file: File, details?: AssetDetails): Promise<UploadResult>;
  /** Deletes a file by key, unless documents use it (then they are returned). Its details go with it. */
  remove(key: string): Promise<RemoveResult>;
  /** Sets a file's default title, alt text or folder. Problems are returned, not thrown. */
  update?(key: string, details: AssetDetails): Promise<UpdateAssetResult>;
  /** Every folder, by name. */
  folders?(): Promise<AssetFolder[]>;
  /** Creates a folder (no `id`) or renames one. Names are unique, ignoring case. */
  saveFolder?(folder: { id?: string; name: string }): Promise<FolderResult>;
  /** Deletes a folder; its files stay, in no folder. */
  removeFolder?(id: string): Promise<void>;
}

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
  /**
   * Moves a document of an `orderable` collection to `index` (from 0) in
   * its manual order; an index past either end moves it to that end.
   * Throws for a collection that isn't orderable, a bad index or an
   * unknown id. Optional for custom implementations: without it the admin
   * shows no reorder controls.
   */
  move?(collection: string, id: string, index: number): Promise<void>;
  /** Uploaded files; only when content has a blob store. */
  assets?: Assets;
}

/**
 * The content store collection holding asset details and folders, as one
 * document (slug `library`). No site collection may use this name.
 */
export const ASSET_LIBRARY = 'mortar-assets';

/** What the asset library document keeps (its `fields`). */
interface LibraryData {
  folders: AssetFolder[];
  /** Details by asset key; only assets that have any. */
  files: Record<string, { title?: string; alt?: string; folder?: string }>;
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
  /** Where uploaded files live. Without it there are no `assets`, and asset URLs aren't filled in on read. */
  blobs?: BlobStore;
  /** Largest upload in bytes. Default 25 MB. (A server function's own body limit applies too.) */
  maxAssetSize?: number;
}

const DEFAULT_MAX_ASSET_SIZE = 25 * 1024 * 1024;

/**
 * The rules around a store. Collection names are checked on every call (a
 * server function receives them from the client): an unknown one throws.
 * Throws at creation if a reference field names an unknown collection.
 */
export function createContent(options: ContentOptions): Content & Pick<Required<Content>, 'move'> & { assets?: Required<Assets> } {
  const { store, bricks, blobs } = options;
  const maxAssetSize = options.maxAssetSize ?? DEFAULT_MAX_ASSET_SIZE;
  const collections = collectionMap(options.collections);
  if (collections.has(ASSET_LIBRARY)) throw new Error(`Mortar: the collection name "${ASSET_LIBRARY}" is reserved for asset details`);
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

  /** Calls `fn` for each image and file value in a document (fields, then body entries). */
  function eachAssetValue(c: AnyCollection, doc: Doc, fn: (value: { src: string; asset: string }) => void) {
    for (const { value } of assetValuesIn(c.fields, doc.fields)) fn(value);
    if (!c.body) return;
    for (const entry of doc.entries ?? []) {
      const brick = byBrick.get(entry.brick);
      if (brick) for (const { value } of assetValuesIn(brick.schema, entry.data)) fn(value);
    }
  }

  /** Fills in the URL of every uploaded asset a (normalized, unshared) document uses. */
  function withUrls<D extends Doc>(c: AnyCollection, doc: D): D {
    if (blobs) {
      eachAssetValue(c, doc, (value) => {
        if (value.asset !== '') value.src = blobs.url(value.asset);
      });
    }
    return doc;
  }

  /**
   * Every document, normalized. Two copies share an id only after a rename
   * was cut short (a crash between writing the new file and removing the
   * old one): until the next save or delete of that document removes the
   * other copy, the first by slug is listed, which may be the older one.
   */
  async function all(c: AnyCollection): Promise<Doc[]> {
    return uniqueById(await copies(c));
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
      docs.sort(sort ? bySort(sort) : manualOrder(c));
      return docs.slice(0, limit).map((doc) => withUrls(c, withoutBody(doc)));
    },

    async get(name, ref) {
      const c = need(name);
      if ('slug' in ref) {
        if (typeof ref.slug !== 'string' || !isValidSlug(ref.slug)) return null;
        const raw = await store.get(c.name, ref.slug);
        return raw === undefined ? null : withUrls(c, normalizeDoc(c, bricks, raw));
      }
      const doc = (await all(c)).find((d) => d.id === ref.id);
      return doc ? withUrls(c, doc) : null;
    },

    async save(name, raw) {
      const c = need(name);
      const result = validateDoc(c, bricks, raw);
      if (!result.success) return { ok: false, issues: result.issues };
      const doc = result.doc;
      // An asset's URL is filled in on read, so a move to another bucket or domain never leaves stale links.
      eachAssetValue(c, doc, (value) => {
        if (value.asset !== '') value.src = '';
      });
      return oneAtATime(async (): Promise<SaveResult> => {
        // Read the target slug itself, so an unreadable file there fails the save instead of being overwritten.
        const occupant = await store.get(c.name, doc.slug);
        if (occupant !== undefined && normalizeDoc(c, bricks, occupant).id !== doc.id) {
          return { ok: false, issues: [{ path: ['slug'], message: `Another document in ${c.label} already uses the slug "${doc.slug}"` }] };
        }
        const stored = await copies(c);
        // The stored position wins over the client's, so a stale editor never undoes a move.
        const position = stored.find((old) => old.id === doc.id)?.position;
        if (position !== undefined) doc.position = position;
        else if (c.orderable) doc.position = await placeFor(c, uniqueById(stored), doc.id);
        await store.put(c.name, doc);
        // A rename moves the document: remove its old copy (and any a cut-short rename left).
        for (const old of stored) if (old.id === doc.id && old.slug !== doc.slug) await store.remove(c.name, old.slug);
        return { ok: true };
      });
    },

    remove(name, id) {
      const c = need(name);
      return oneAtATime(() => removeNow(c, id));
    },

    move(name, id, index) {
      const c = need(name);
      if (!c.orderable) throw new Error(`${c.label} is not orderable`);
      if (!Number.isInteger(index)) throw new Error('index must be an integer');
      return oneAtATime(async () => {
        const docs = (await all(c)).sort(manualOrder(c));
        const from = docs.findIndex((doc) => doc.id === id);
        if (from === -1) throw new Error(`No document in ${c.label} has the id "${String(id)}"`);
        const [moved] = docs.splice(from, 1);
        docs.splice(Math.max(0, Math.min(index, docs.length)), 0, moved as Doc);
        await renumber(c, docs);
      });
    },

    assets: blobs && {
      async list() {
        const [files, library] = await Promise.all([blobs.list(), readLibrary()]);
        const valid = files.filter((file) => isValidAssetKey(file.key));
        valid.sort((a, b) => compare(b.modified ?? '', a.modified ?? '') || compare(a.key, b.key));
        return valid.map((file) => toAsset(blobs, library, file.key, file.size, file.modified));
      },
      async upload(file, details = {}) {
        if (typeof file !== 'object' || file === null || typeof (file as File).name !== 'string' || typeof (file as File).size !== 'number') {
          return { ok: false, message: 'Not a file' };
        }
        const key = assetKeyFor(file.name);
        if (!key) return { ok: false, message: `"${file.name}" isn't a file type the site accepts (images, video, audio or PDF)` };
        if (file.size === 0) return { ok: false, message: `"${file.name}" is empty` };
        if (file.size > maxAssetSize) return { ok: false, message: `"${file.name}" is larger than ${formatSize(maxAssetSize)}` };
        return oneAtATime(async (): Promise<UploadResult> => {
          const library = await readLibrary();
          const problem = applyDetails(library, key, details);
          if (problem) return { ok: false, message: problem };
          await blobs.put(key, file);
          if (library.files[key]) await writeLibrary(library);
          return { ok: true, asset: toAsset(blobs, library, key, file.size, new Date().toISOString()) };
        });
      },
      remove(key) {
        if (!isValidAssetKey(key)) return Promise.resolve({ ok: true } as const);
        return oneAtATime(async (): Promise<RemoveResult> => {
          const referencedBy = await usesOf(
            (schema) => hasAssetFields(schema),
            (schema, data) => assetsIn(schema, data).filter((found) => found.key === key),
          );
          if (referencedBy.length > 0) return { ok: false, referencedBy };
          await blobs.remove(key);
          const library = await readLibrary();
          if (Object.hasOwn(library.files, key)) {
            delete library.files[key];
            await writeLibrary(library);
          }
          return { ok: true };
        });
      },
      update(key, details) {
        return oneAtATime(async (): Promise<UpdateAssetResult> => {
          const file = isValidAssetKey(key) ? (await blobs.list()).find((f) => f.key === key) : undefined;
          if (!file) return { ok: false, message: `There is no asset "${String(key)}"` };
          const library = await readLibrary();
          const problem = applyDetails(library, key, details);
          if (problem) return { ok: false, message: problem };
          await writeLibrary(library);
          return { ok: true, asset: toAsset(blobs, library, key, file.size, file.modified) };
        });
      },
      async folders() {
        return (await readLibrary()).folders;
      },
      saveFolder(folder) {
        return oneAtATime(async (): Promise<FolderResult> => {
          if (typeof folder !== 'object' || folder === null) return { ok: false, message: 'Not a folder' };
          const name = typeof folder.name === 'string' ? folder.name.trim().replace(/\s+/g, ' ') : '';
          if (name === '') return { ok: false, message: 'A folder needs a name' };
          if (name.length > 60) return { ok: false, message: 'Folder names are at most 60 characters' };
          const library = await readLibrary();
          const clash = library.folders.find((f) => f.id !== folder.id && f.name.toLowerCase() === name.toLowerCase());
          if (clash) return { ok: false, message: `There is already a folder named "${clash.name}"` };
          let saved: AssetFolder;
          if (folder.id === undefined) {
            saved = { id: randomSuffix(), name };
            library.folders.push(saved);
          } else {
            const existing = library.folders.find((f) => f.id === folder.id);
            if (!existing) return { ok: false, message: 'That folder no longer exists' };
            existing.name = name;
            saved = existing;
          }
          await writeLibrary(library);
          return { ok: true, folder: { ...saved } };
        });
      },
      removeFolder(id) {
        return oneAtATime(async () => {
          const library = await readLibrary();
          if (!library.folders.some((f) => f.id === id)) return;
          library.folders = library.folders.filter((f) => f.id !== id);
          for (const [key, details] of Object.entries(library.files)) {
            if (details.folder === id) {
              delete details.folder;
              if (Object.keys(details).length === 0) delete library.files[key];
            }
          }
          await writeLibrary(library);
        });
      },
    },
  };

  /** The asset library document's data, checked (anything malformed in it is dropped). Folders by name. */
  async function readLibrary(): Promise<LibraryData> {
    const raw = await store.get(ASSET_LIBRARY, 'library');
    const fields = typeof raw === 'object' && raw !== null ? (raw as { fields?: unknown }).fields : undefined;
    const data = typeof fields === 'object' && fields !== null ? (fields as Partial<Record<keyof LibraryData, unknown>>) : {};
    const folders: AssetFolder[] = [];
    for (const f of Array.isArray(data.folders) ? data.folders : []) {
      if (typeof f?.id === 'string' && typeof f?.name === 'string' && !folders.some((g) => g.id === f.id)) folders.push({ id: f.id, name: f.name });
    }
    folders.sort((a, b) => compare(a.name, b.name));
    const files: LibraryData['files'] = {};
    const stored = typeof data.files === 'object' && data.files !== null ? (data.files as Record<string, unknown>) : {};
    for (const [key, value] of Object.entries(stored)) {
      if (!isValidAssetKey(key) || typeof value !== 'object' || value === null) continue;
      const details: LibraryData['files'][string] = {};
      for (const part of ['title', 'alt', 'folder'] as const) {
        const v = (value as Record<string, unknown>)[part];
        if (typeof v === 'string' && v !== '') details[part] = v;
      }
      if (details.folder !== undefined && !folders.some((f) => f.id === details.folder)) delete details.folder;
      if (Object.keys(details).length > 0) files[key] = details;
    }
    return { folders, files };
  }

  async function writeLibrary(library: LibraryData): Promise<void> {
    await store.put(ASSET_LIBRARY, { id: ASSET_LIBRARY, slug: 'library', fields: { folders: library.folders, files: library.files } });
  }

  /**
   * Every place a document uses something: `find` lists the matching paths
   * in some data; `relevant` says whether a schema could hold any (to skip
   * collections that can't). `skip` leaves out one document.
   */
  async function usesOf(
    relevant: (schema: Fields) => boolean,
    find: (schema: Fields, data: unknown) => { path: (string | number)[] }[],
    skip?: { collection: string; id: string },
  ): Promise<Referrer[]> {
    const found: Referrer[] = [];
    const inBodies = bricks.some((b) => relevant(b.schema));
    for (const k of collections.values()) {
      if (!relevant(k.fields) && !(k.body && inBodies)) continue;
      for (const doc of await all(k)) {
        if (skip && k.name === skip.collection && doc.id === skip.id) continue;
        const at = { collection: k.name, id: doc.id, slug: doc.slug, title: k.titleOf(doc) };
        for (const use of find(k.fields, doc.fields)) found.push({ ...at, path: ['fields', ...use.path] });
        if (!k.body) continue;
        for (const entry of doc.entries ?? []) {
          const brick = byBrick.get(entry.brick);
          if (!brick) continue;
          for (const use of find(brick.schema, entry.data)) found.push({ ...at, entryId: entry.id, path: use.path });
        }
      }
    }
    return found;
  }

  /**
   * Stores positions 1, 2, 3… in the given order, writing only documents
   * whose position changes. Each is written from its raw stored copy, so
   * nothing else in it changes. Positions only order documents, so a write
   * cut short leaves ties (ordered by slug), which the next move clears.
   */
  async function renumber(c: AnyCollection, ordered: readonly Doc[], skip?: string): Promise<void> {
    for (const [i, doc] of ordered.entries()) {
      if (doc.position === i + 1 || doc.id === skip) continue;
      const raw = await store.get(c.name, doc.slug);
      if (raw === undefined || typeof raw !== 'object' || raw === null) continue;
      await store.put(c.name, { ...(raw as Doc), slug: doc.slug, position: i + 1 });
    }
  }

  /**
   * The position for a document of an orderable collection that has none
   * (`id`, about to be saved): a new one goes after every other. When some
   * documents have no position yet (stored before the collection was
   * orderable, or written by hand), every document is given one in its
   * current order first, so a new one is really last and an existing one
   * keeps its place. `docs` is every stored document.
   */
  async function placeFor(c: AnyCollection, docs: Doc[], id: string): Promise<number> {
    const isNew = !docs.some((doc) => doc.id === id);
    if (isNew && docs.every((doc) => doc.position !== undefined)) return Math.max(0, ...docs.map((doc) => doc.position as number)) + 1;
    const ordered = docs.sort(manualOrder(c));
    // The saved document is written by the save itself.
    await renumber(c, ordered, id);
    return isNew ? ordered.length + 1 : ordered.findIndex((doc) => doc.id === id) + 1;
  }

  async function removeNow(c: AnyCollection, id: string): Promise<RemoveResult> {
    const target = (await all(c)).find((doc) => doc.id === id);
    if (!target) return { ok: true };
    const referencedBy = await usesOf(
      (schema) => referencedCollections(schema).has(c.name),
      (schema, data) => referencesIn(schema, data).filter((ref) => ref.collection === c.name && ref.id === id),
      { collection: c.name, id },
    );
    if (referencedBy.length > 0) return { ok: false, referencedBy };
    for (const copy of await copies(c)) if (copy.id === id) await store.remove(c.name, copy.slug);
    return { ok: true };
  }
}

function toAsset(blobs: BlobStore, library: LibraryData, key: string, size: number, modified?: string): Asset {
  const info = assetInfo(key) as NonNullable<ReturnType<typeof assetInfo>>;
  const details = library.files[key] ?? {};
  const asset: Asset = {
    key,
    name: info.name,
    kind: info.kind,
    type: info.type,
    size,
    src: blobs.url(key),
    title: details.title ?? '',
    alt: details.alt ?? '',
    folder: details.folder ?? '',
  };
  if (modified !== undefined) asset.modified = modified;
  return asset;
}

/**
 * Checks `details` from an untrusted caller and sets them on `key` in
 * `library` (an empty value clears that part). Returns a problem, or
 * undefined when they were applied.
 */
function applyDetails(library: LibraryData, key: string, details: AssetDetails): string | undefined {
  if (typeof details !== 'object' || details === null) return 'Details must be an object';
  const next = { ...library.files[key] };
  for (const [part, max] of [
    ['title', 200],
    ['alt', 1000],
  ] as const) {
    const value = details[part];
    if (value === undefined) continue;
    if (typeof value !== 'string') return `${part} must be a string`;
    if (value.length > max) return `${part === 'alt' ? 'Alt text' : 'Title'} is at most ${max} characters`;
    if (value.trim() === '') delete next[part];
    else next[part] = value.trim();
  }
  if (details.folder !== undefined) {
    if (details.folder === '') delete next.folder;
    else if (typeof details.folder === 'string' && library.folders.some((f) => f.id === details.folder)) next.folder = details.folder;
    else return 'That folder no longer exists';
  }
  if (Object.keys(next).length > 0) library.files[key] = next;
  else delete library.files[key];
  return undefined;
}

/** "25 MB", "300 KB". */
function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** The first copy of each id (see `all`). */
function uniqueById(docs: Doc[]): Doc[] {
  const seen = new Set<string>();
  return docs.filter((doc) => !seen.has(doc.id) && seen.add(doc.id));
}

/** Compares documents by a sort order, then by slug. */
function bySort(sort: Required<SortOrder>): (a: Doc, b: Doc) => number {
  const direction = sort.order === 'desc' ? -1 : 1;
  return (a, b) => direction * compare(valueOf(a, sort.field), valueOf(b, sort.field)) || compare(a.slug, b.slug);
}

/** An orderable collection's manual order: by position, then documents without one by the collection's `sort`. */
function manualOrder(c: AnyCollection): (a: Doc, b: Doc) => number {
  const fallback = bySort(c.sort);
  return (a, b) => {
    if (a.position !== undefined && b.position !== undefined) return a.position - b.position || compare(a.slug, b.slug);
    if (a.position !== undefined || b.position !== undefined) return a.position === undefined ? 1 : -1;
    return fallback(a, b);
  };
}

/**
 * Checks list options from an untrusted caller and fills in the defaults.
 * `sort` is null for an orderable collection's manual order. Throws on bad options.
 */
function checkListOptions(c: AnyCollection, o: ListOptions): { where: Record<string, unknown>; sort: Required<SortOrder> | null; limit: number | undefined } {
  const known = (key: string) => key === 'id' || key === 'slug' || Object.hasOwn(c.fields, key);
  if (typeof o !== 'object' || o === null) throw new Error('List options must be an object');
  const where = o.where ?? {};
  if (typeof where !== 'object' || where === null) throw new Error('where must be an object');
  for (const [key, value] of Object.entries(where)) {
    if (!known(key)) throw new Error(`Cannot filter ${c.name} by unknown field "${key}"`);
    if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`where.${key} must be a string, number or boolean`);
  }
  if (o.limit !== undefined && !(Number.isInteger(o.limit) && o.limit >= 1 && o.limit <= 100)) throw new Error('limit must be an integer from 1 to 100');
  if (!o.sort && c.orderable) return { where, sort: null, limit: o.limit };
  const sort = o.sort ? { field: o.sort.field, order: o.sort.order ?? 'asc' } : c.sort;
  if (typeof sort.field !== 'string' || !known(sort.field)) throw new Error(`Cannot sort ${c.name} by unknown field "${String(sort.field)}"`);
  if (sort.order !== 'asc' && sort.order !== 'desc') throw new Error(`sort.order must be 'asc' or 'desc'`);
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

function withoutBody(doc: Doc): Doc {
  const { entries: _, ...summary } = doc;
  return summary;
}
