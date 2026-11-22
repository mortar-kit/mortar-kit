// A `ContentStore` kept in the browser's session storage, on top of a fixed
// baseline: the docs site's way to let anyone edit it without a server.
// Only changes are stored (a saved document, or a deletion), under one key,
// so the baseline can change with each deploy and clearing the key brings
// the reader straight back to it. Session storage is per tab: edits last
// while the tab is open, survive reloads, and are seen by same-origin
// iframes in it (the admin's preview), but no other reader ever sees them.
//
// It is also the docs' worked example of writing a store: four methods over
// raw documents, while `createContent` applies every rule.
import { isValidSlug, type ContentStore, type Doc } from '@mortar-kit/core';

/** What the store keeps: per collection, per slug, a saved document or `null` for a deleted one. */
type Changes = Record<string, Record<string, Doc | null>>;

export interface SessionStorageStoreOptions {
  /** The documents everyone sees, by collection: what clearing the changes returns to. */
  baseline: Readonly<Record<string, readonly Doc[]>>;
  /** The session storage item holding the changes. Default `'mortar:changes'`. */
  key?: string;
  /** Where to keep them. Default `sessionStorage`; tests pass their own `Storage`. */
  storage?: Storage;
}

/** A `ContentStore` over session storage, plus what the docs need to show and undo changes. */
export interface SessionStorageStore extends ContentStore {
  /** Whether anything differs from the baseline. */
  hasChanges(): boolean;
  /** Forgets every change: the store is the baseline again. */
  clear(): void;
}

/**
 * Creates the store. Reads and writes go to storage every time, so several
 * stores (the admin and its preview iframe) over the same key stay in step.
 * Storage that is missing, full or unreadable (private windows, blocked
 * site data) behaves as no changes: reads give the baseline and saves throw.
 */
export function createSessionStorageStore(options: SessionStorageStoreOptions): SessionStorageStore {
  const key = options.key ?? 'mortar:changes';
  const storage = (): Storage | undefined => {
    try {
      return options.storage ?? globalThis.sessionStorage;
    } catch {
      return undefined;
    }
  };
  const baseline = new Map<string, Map<string, Doc>>();
  for (const [collection, docs] of Object.entries(options.baseline)) {
    baseline.set(collection, new Map(docs.map((doc) => [doc.slug, doc])));
  }

  const read = (): Changes => {
    try {
      const raw = storage()?.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Changes) : {};
    } catch {
      return {};
    }
  };
  const write = (changes: Changes) => {
    const target = storage();
    if (!target) throw new Error('Session storage is not available in this browser');
    target.setItem(key, JSON.stringify(changes));
  };
  const change = (collection: string, slug: string, doc: Doc | null) => {
    const changes = read();
    const folder = (changes[collection] ??= {});
    // Back to what the baseline has (deleting a document only this tab made): drop the change.
    if (doc === null && !baseline.get(collection)?.has(slug)) delete folder[slug];
    else folder[slug] = doc;
    write(changes);
  };
  const copy = (doc: Doc, slug: string): Doc => ({ ...structuredClone(doc), slug });

  return {
    async list(collection) {
      const merged = new Map(baseline.get(collection));
      for (const [slug, doc] of Object.entries(read()[collection] ?? {})) {
        if (doc === null) merged.delete(slug);
        else merged.set(slug, doc);
      }
      return [...merged].map(([slug, doc]) => copy(doc, slug));
    },
    async get(collection, slug) {
      const changes = read()[collection] ?? {};
      const doc = Object.hasOwn(changes, slug) ? changes[slug] : baseline.get(collection)?.get(slug);
      return doc ? copy(doc, slug) : undefined;
    },
    async put(collection, doc) {
      if (!isValidSlug(doc.slug)) throw new Error(`Mortar: invalid slug "${doc.slug}"`);
      change(collection, doc.slug, doc);
    },
    async remove(collection, slug) {
      change(collection, slug, null);
    },
    hasChanges() {
      return Object.values(read()).some((folder) => Object.keys(folder).length > 0);
    },
    clear() {
      try {
        storage()?.removeItem(key);
      } catch {
        // Nothing stored, nothing to clear.
      }
    },
  };
}
