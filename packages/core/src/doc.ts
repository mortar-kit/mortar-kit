// The document model: one item of a collection (a post, a product, a page).
// Plain JSON, like pages: `{ id, slug, fields, entries? }`. Also the two
// checks every document goes through: normalize when loading (be
// forgiving, never crash) and validate when saving (be strict, report
// every problem).
import type { AnyBrick } from './brick.ts';
import type { AnyCollection } from './collection.ts';
import { isRecord, normalizeEntries, NOT_JSON, toJson, validateEntries, type EntryIssue, type PageEntry } from './entries.ts';

/** One document of a collection. */
export interface Doc<F = Record<string, unknown>> {
  /** Stable id: references store it, so it never changes (unlike the slug). */
  id: string;
  /** The document's address within its collection, e.g. `hello-world`. Unique per collection. */
  slug: string;
  /** The collection's fields. */
  fields: F;
  /** Brick entries; always an array when the collection has a body. */
  entries?: PageEntry[];
}

/** A document without its body, as lists return it. */
export type DocSummary<F = Record<string, unknown>> = Omit<Doc<F>, 'entries'>;

/** Which document: by id or by slug. */
export type DocRef = { id: string } | { slug: string };

/**
 * A problem found when validating a document. With `entryId`, `path` points
 * into that entry's data; without it, `path` points into the document:
 * `['id']`, `['slug']`, `['fields', 'title']` or `['entries', 3]`.
 */
export type DocIssue = EntryIssue;

/** Result of `validateDoc`: the cleaned document, or every issue found. */
export type ValidateDocResult = { success: true; doc: Doc } | { success: false; issues: DocIssue[] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether `slug` is a valid slug: up to 100 lowercase letters and digits, single dashes between (`home`, `about-us`). */
export function isValidSlug(slug: string): boolean {
  return slug.length <= 100 && SLUG.test(slug);
}

/** Whether `id` is a valid document id: 1 to 64 letters, digits, `_` or `-` (a UUID fits). */
export function isValidDocId(id: string): boolean {
  return ID.test(id);
}

/**
 * Coerces unknown data (a stored file, data from props) into a document that
 * renders and edits safely. A missing or invalid id falls back to the slug,
 * so hand-written files need none (the next save stores it). With a body,
 * entries are normalized; without one, stored entries are kept as plain
 * JSON but never rendered, so turning `body` off loses nothing. The input
 * is never modified.
 */
export function normalizeDoc(collection: AnyCollection, bricks: readonly AnyBrick[], raw: unknown): Doc {
  const source = isRecord(raw) ? raw : {};
  const slug = typeof source.slug === 'string' ? source.slug : '';
  const id = typeof source.id === 'string' && isValidDocId(source.id) ? source.id : slug;
  const doc: Doc = { id, slug, fields: collection.normalize(isRecord(source.fields) ? toJson(source.fields, 'drop') : {}) };
  if (collection.body) doc.entries = normalizeEntries(bricks, source.entries);
  else if (Array.isArray(source.entries)) doc.entries = toJson(source.entries, 'drop') as PageEntry[];
  return doc;
}

/**
 * Checks a document before it is saved: its id and slug (not one of the
 * collection's reserved slugs), its fields against the collection's schema
 * (issues at `['fields', ...]`), and with a body its entries. Unknown
 * top-level keys are dropped. Whether the slug is free is the store's
 * question, not this one.
 */
export function validateDoc(collection: AnyCollection, bricks: readonly AnyBrick[], raw: unknown): ValidateDocResult {
  if (!isRecord(raw)) return { success: false, issues: [{ path: [], message: 'A document must be an object' }] };
  const issues: DocIssue[] = [];
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!isValidDocId(id)) issues.push({ path: ['id'], message: 'A document needs an id of letters, digits, _ or -' });
  const slug = typeof raw.slug === 'string' ? raw.slug : '';
  if (!isValidSlug(slug)) {
    issues.push({ path: ['slug'], message: 'Slug must be lowercase letters and digits with single dashes between (e.g. about-us)' });
  } else if (collection.reservedSlugs.includes(slug)) {
    issues.push({ path: ['slug'], message: `The slug "${slug}" is reserved` });
  }
  let fields: Record<string, unknown> = {};
  const rawFields = raw.fields === undefined ? {} : isRecord(raw.fields) ? toJson(raw.fields, 'fail') : undefined;
  if (rawFields === undefined) {
    issues.push({ path: ['fields'], message: isRecord(raw.fields) ? NOT_JSON : 'Fields must be an object' });
  } else {
    const result = collection.validate(rawFields);
    if (result.success) fields = result.data;
    else for (const issue of result.issues) issues.push({ path: ['fields', ...issue.path], message: issue.message });
  }
  let entries: PageEntry[] | undefined;
  if (collection.body) {
    if (raw.entries !== undefined && !Array.isArray(raw.entries)) issues.push({ path: ['entries'], message: 'Entries must be a list' });
    else entries = validateEntries(bricks, raw.entries ?? [], issues);
  } else if (raw.entries !== undefined) {
    entries = Array.isArray(raw.entries) ? (toJson(raw.entries, 'fail') as PageEntry[] | undefined) : undefined;
    if (!entries) issues.push({ path: ['entries'], message: NOT_JSON });
  }
  if (issues.length > 0) return { success: false, issues };
  const doc: Doc = { id, slug, fields };
  if (entries) doc.entries = entries;
  return { success: true, doc };
}
