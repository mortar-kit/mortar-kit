// Storage: the small interface a page store implements, an in-memory store
// (tests, demos), and the load/save helpers that put every page through
// normalize (on load) and validate (on save) whichever store is used. The
// JSON-file store lives in `@mortar-kit/core/server` so `node:fs` never
// reaches a client bundle.
import type { AnyBrick } from './brick.ts';
import { normalizePage, validatePage, type Page, type PageIssue } from './page.ts';

/** Where pages live. Implement this to store pages anywhere (files, a database, a CMS API). */
export interface PageStore {
  /** The stored page, or undefined if there is none. */
  load(slug: string): Promise<Page | undefined>;
  /** Stores a page, replacing any page with that slug. */
  save(slug: string, page: Page): Promise<void>;
  /** Slugs of every stored page, if the store can list them. */
  list?(): Promise<string[]>;
}

/** Result of `savePage`. */
export type SaveResult = { ok: true } | { ok: false; issues: PageIssue[] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `slug` is a valid page slug: lowercase letters and digits, single dashes between (`home`, `about-us`). */
export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

/** A store that keeps pages in memory. Pages are copied in and out, so callers can't mutate stored pages. */
export function createMemoryStore(pages: Record<string, Page> = {}): PageStore {
  const map = new Map(Object.entries(pages).map(([slug, page]) => [slug, structuredClone(page)]));
  return {
    async load(slug) {
      const page = map.get(slug);
      return page && structuredClone(page);
    },
    async save(slug, page) {
      if (!isValidSlug(slug)) throw new Error(`Mortar: invalid page slug "${slug}"`);
      map.set(slug, structuredClone(page));
    },
    async list() {
      return [...map.keys()].sort();
    },
  };
}

/** Loads a page and normalizes it for rendering. Undefined if the slug is invalid or no page is stored. */
export async function loadPage(store: PageStore, bricks: readonly AnyBrick[], slug: string): Promise<Page | undefined> {
  if (!isValidSlug(slug)) return undefined;
  const page = await store.load(slug);
  return page === undefined ? undefined : normalizePage(bricks, page);
}

/**
 * Validates a page (from an untrusted client) and saves it if it is valid.
 * Problems are returned, by entry id and path, rather than thrown.
 */
export async function savePage(store: PageStore, bricks: readonly AnyBrick[], slug: string, page: unknown): Promise<SaveResult> {
  if (!isValidSlug(slug)) return { ok: false, issues: [{ path: [], message: `Invalid page slug "${slug}"` }] };
  const result = validatePage(bricks, page);
  if (!result.success) return { ok: false, issues: result.issues };
  await store.save(slug, result.page);
  return { ok: true };
}
