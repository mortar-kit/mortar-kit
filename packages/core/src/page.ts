// The page model: a page is an ordered array of brick instances plus
// page-level metadata (free-form, or declared with `definePageMeta`). Plain JSON, so it can be stored by any
// adapter and sent to the browser as-is. Also the two checks every page
// goes through: normalize when loading (be forgiving, never crash) and
// validate when saving (be strict, report every problem).
import { snapshot } from 'solid-js';

import { brickMap, type AnyBrick } from './brick.ts';
import type { PageMeta } from './meta.ts';

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
 * With a `meta` schema the page always gets metadata, normalized the same
 * way. The input is never modified.
 */
export function normalizePage(bricks: readonly AnyBrick[], page: unknown, meta?: PageMeta): Page {
  const byName = brickMap(bricks);
  const source = isRecord(page) ? page : {};
  const seen = new Set<string>();
  const entries: PageEntry[] = [];
  for (const item of Array.isArray(source.entries) ? source.entries : []) {
    if (!isRecord(item) || typeof item.brick !== 'string' || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const data = isRecord(item.data) ? item.data : {};
    const brick = byName.get(item.brick);
    entries.push({ brick: item.brick, id: item.id, data: brick ? brick.normalize(data) : (toJson(data, 'drop') as Record<string, unknown>) });
  }
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
  const byName = brickMap(bricks);
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
      const data = toJson(item.data, 'fail') as Record<string, unknown> | undefined;
      if (data) entries.push({ brick: item.brick, id: item.id, data });
      else issues.push({ entryId: item.id, path: [], message: NOT_JSON });
      return;
    }
    const result = brick.validate(item.data);
    if (result.success) entries.push({ brick: item.brick, id: item.id, data: result.data });
    else for (const issue of result.issues) issues.push({ entryId: item.id, ...issue });
  });
  if (issues.length > 0) return { success: false, issues };
  return { success: true, page: checkedMeta ? { entries, meta: checkedMeta } : { entries } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const NOT_JSON = 'Data must be plain JSON (objects, arrays, strings, finite numbers, booleans, null)';

/**
 * A deep copy of `value` as plain JSON data, unwrapping stores (Solid 2's
 * `snapshot` returns plain objects as they are, so it doesn't copy). Values
 * JSON can't hold (functions, promises, dates, cycles, non-finite numbers)
 * are dropped from objects and nulled in arrays with `'drop'`, as
 * `JSON.stringify` does; with `'fail'` they make the result undefined.
 */
function toJson(value: unknown, mode: 'drop' | 'fail'): unknown {
  const FAIL = Symbol('not JSON');
  const stack = new Set<object>();
  const walk = (input: unknown): unknown => {
    const v: unknown = snapshot(input);
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : FAIL;
    if (typeof v !== 'object' || stack.has(v)) return FAIL;
    const proto: unknown = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) return FAIL;
    stack.add(v);
    try {
      if (Array.isArray(v)) {
        const out: unknown[] = [];
        for (const item of v) {
          const copied = walk(item);
          if (copied === FAIL && mode === 'fail') return FAIL;
          out.push(copied === FAIL ? null : copied);
        }
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(v)) {
        if (item === undefined) continue;
        const copied = walk(item);
        if (copied === FAIL && mode === 'fail') return FAIL;
        if (copied !== FAIL) out[key] = copied;
      }
      return out;
    } finally {
      stack.delete(v);
    }
  };
  const result = walk(value);
  if (result !== FAIL) return result;
  return mode === 'drop' ? {} : undefined;
}
