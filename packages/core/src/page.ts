// The page model: a page is an ordered array of brick instances plus
// page-level metadata (free-form, or declared with `definePageMeta`). Plain JSON, so it can be stored by any
// adapter and sent to the browser as-is. Also the two checks every page
// goes through: normalize when loading (be forgiving, never crash) and
// validate when saving (be strict, report every problem).
import type { AnyBrick } from './brick.ts';
import { isRecord, normalizeEntries, NOT_JSON, toJson, validateEntries, type EntryIssue, type PageEntry } from './entries.ts';
import type { PageMeta } from './meta.ts';

export type { PageEntry } from './entries.ts';

/** A page: brick instances in render order, plus optional metadata. */
export interface Page {
  entries: PageEntry[];
  /**
   * Page-level data such as a title. Free-form unless the site declares it
   * with `definePageMeta`, which normalizes and validates it.
   */
  meta?: Record<string, unknown>;
}

/**
 * A problem found when validating a page. With `entryId`, `path` points into
 * that entry's data (e.g. `['cards', 2, 'title']`); without it, `path` points
 * into the page itself (e.g. `['entries', 3]`, or `['meta', 'title']` for page metadata).
 */
export type PageIssue = EntryIssue;

/** Result of `validatePage`: the cleaned page, or every issue found. */
export type ValidatePageResult = { success: true; page: Page } | { success: false; issues: PageIssue[] };

/**
 * Coerces unknown data (a stored file, a page from props) into a page that
 * renders and edits safely: entries of known bricks get normalized data
 * (missing fields filled with defaults), entries of unknown bricks keep
 * their data untouched, and malformed or duplicate entries are dropped.
 * With a `meta` schema the page always gets metadata, normalized the same
 * way. The input is never modified.
 */
export function normalizePage(bricks: readonly AnyBrick[], page: unknown, meta?: PageMeta): Page {
  const source = isRecord(page) ? page : {};
  const entries = normalizeEntries(bricks, source.entries);
  const stored = isRecord(source.meta) ? (toJson(source.meta, 'drop') as Record<string, unknown>) : undefined;
  if (meta) return { entries, meta: meta.normalize(stored ?? {}) };
  return stored ? { entries, meta: stored } : { entries };
}

/**
 * Checks a page before it is saved: its shape, unique entry ids, and each
 * entry's data against its brick's schema. On success the returned page has
 * each known brick's validated data (defaults filled, unknown keys dropped);
 * entries of unknown bricks are kept as they are, so retiring a brick never
 * loses content. With a `meta` schema the metadata is validated too (its
 * issues have paths starting with `'meta'`) and is always present on success.
 */
export function validatePage(bricks: readonly AnyBrick[], page: unknown, meta?: PageMeta): ValidatePageResult {
  if (!isRecord(page) || !Array.isArray(page.entries)) {
    return { success: false, issues: [{ path: ['entries'], message: 'A page must have an entries list' }] };
  }
  const issues: PageIssue[] = [];
  let checkedMeta = isRecord(page.meta) ? (toJson(page.meta, 'fail') as Record<string, unknown> | undefined) : undefined;
  if (page.meta !== undefined && !isRecord(page.meta)) {
    issues.push({ path: ['meta'], message: 'Page metadata must be an object' });
  } else if (page.meta !== undefined && checkedMeta === undefined) {
    issues.push({ path: ['meta'], message: NOT_JSON });
  } else if (meta) {
    const result = meta.validate(checkedMeta ?? {});
    if (result.success) checkedMeta = result.data;
    else for (const issue of result.issues) issues.push({ path: ['meta', ...issue.path], message: issue.message });
  }
  const entries = validateEntries(bricks, page.entries, issues);
  if (issues.length > 0) return { success: false, issues };
  return { success: true, page: checkedMeta ? { entries, meta: checkedMeta } : { entries } };
}
