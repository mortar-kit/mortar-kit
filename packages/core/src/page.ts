// The page model: a page is an ordered array of brick instances plus
// free-form page-level metadata. Plain JSON, so it can be stored by any
// adapter and sent to the browser as-is. Also the two checks every page
// goes through: normalize when loading (be forgiving, never crash) and
// validate when saving (be strict, report every problem).
import { snapshot } from 'solid-js';

import { brickMap, type AnyBrick } from './brick.ts';

/** One brick instance on a page. */
export interface PageEntry {
  /** The `name` of the brick that renders this entry. */
  brick: string;
  /** Stable id, created once when the entry is added. Never an array index. */
  id: string;
  /** The brick's data. Rendering normalizes it (`Brick.normalize`); saving should validate it. */
  data: Record<string, unknown>;
}

/** A page: brick instances in render order, plus optional metadata. */
export interface Page {
  entries: PageEntry[];
  /** Page-level data such as a title. Free-form for now; Mortar doesn't interpret it. */
  meta?: Record<string, unknown>;
}

/**
 * A problem found when validating a page. With `entryId`, `path` points into
 * that entry's data (e.g. `['cards', 2, 'title']`); without it, `path` points
 * into the page itself (e.g. `['entries', 3]`).
 */
export interface PageIssue {
  entryId?: string;
  path: (string | number)[];
  message: string;
}

/** Result of `validatePage`: the cleaned page, or every issue found. */
export type ValidatePageResult = { success: true; page: Page } | { success: false; issues: PageIssue[] };

/**
 * Coerces unknown data (a stored file, a page from props) into a page that
 * renders and edits safely: entries of known bricks get normalized data
 * (missing fields filled with defaults), entries of unknown bricks keep
 * their data untouched, and malformed or duplicate entries are dropped.
 * The input is never modified.
 */
export function normalizePage(bricks: readonly AnyBrick[], page: unknown): Page {
  const byName = brickMap(bricks);
  const source = isRecord(page) ? page : {};
  const seen = new Set<string>();
  const entries: PageEntry[] = [];
  for (const item of Array.isArray(source.entries) ? source.entries : []) {
    if (!isRecord(item) || typeof item.brick !== 'string' || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const data = isRecord(item.data) ? item.data : {};
    const brick = byName.get(item.brick);
    entries.push({ brick: item.brick, id: item.id, data: brick ? brick.normalize(data) : snapshot(data) });
  }
  return isRecord(source.meta) ? { entries, meta: snapshot(source.meta) } : { entries };
}

/**
 * Checks a page before it is saved: its shape, unique entry ids, and each
 * entry's data against its brick's schema. On success the returned page has
 * each known brick's validated data (defaults filled, unknown keys dropped);
 * entries of unknown bricks are kept as they are, so retiring a brick never
 * loses content.
 */
export function validatePage(bricks: readonly AnyBrick[], page: unknown): ValidatePageResult {
  const byName = brickMap(bricks);
  if (!isRecord(page) || !Array.isArray(page.entries)) {
    return { success: false, issues: [{ path: ['entries'], message: 'A page must have an entries list' }] };
  }
  const issues: PageIssue[] = [];
  if (page.meta !== undefined && !isRecord(page.meta)) issues.push({ path: ['meta'], message: 'Page metadata must be an object' });
  const seen = new Set<string>();
  const entries: PageEntry[] = [];
  page.entries.forEach((item: unknown, index) => {
    if (!isRecord(item) || typeof item.brick !== 'string' || typeof item.id !== 'string' || item.id === '' || !isRecord(item.data)) {
      issues.push({ path: ['entries', index], message: 'An entry needs a brick name, an id and a data object' });
      return;
    }
    if (seen.has(item.id)) {
      issues.push({ entryId: item.id, path: [], message: `Two entries share the id "${item.id}"` });
      return;
    }
    seen.add(item.id);
    const brick = byName.get(item.brick);
    if (!brick) {
      entries.push({ brick: item.brick, id: item.id, data: snapshot(item.data) });
      return;
    }
    const result = brick.validate(item.data);
    if (result.success) entries.push({ brick: item.brick, id: item.id, data: result.data });
    else for (const issue of result.issues) issues.push({ entryId: item.id, ...issue });
  });
  if (issues.length > 0) return { success: false, issues };
  return { success: true, page: isRecord(page.meta) ? { entries, meta: snapshot(page.meta) } : { entries } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
