// Brick entries: the ordered `{ brick, id, data }` list that makes up a
// page or a document's body, with the two checks every list goes through:
// normalize when loading (be forgiving, never crash) and validate when
// saving (be strict, report every problem). Also the plain-JSON copy used
// for data Mortar keeps without understanding it.
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

/**
 * A problem found when validating. With `entryId`, `path` points into that
 * entry's data (e.g. `['cards', 2, 'title']`); without it, `path` points
 * into the container being validated (e.g. `['entries', 3]`).
 */
export interface EntryIssue {
  entryId?: string;
  path: (string | number)[];
  message: string;
}

/**
 * Coerces unknown data into entries that render and edit safely: entries of
 * known bricks get normalized data, entries of unknown bricks keep their
 * data (as plain JSON), and malformed or duplicate entries are dropped.
 */
export function normalizeEntries(bricks: readonly AnyBrick[], raw: unknown): PageEntry[] {
  const byName = brickMap(bricks);
  const seen = new Set<string>();
  const entries: PageEntry[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isRecord(item) || typeof item.brick !== 'string' || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const data = isRecord(item.data) ? item.data : {};
    const brick = byName.get(item.brick);
    entries.push({ brick: item.brick, id: item.id, data: brick ? brick.normalize(data) : (toJson(data, 'drop') as Record<string, unknown>) });
  }
  return entries;
}

/**
 * Checks entries before they are saved: each entry's shape, unique ids, and
 * its data against its brick's schema. Problems are pushed onto `issues`
 * (shape problems at `['entries', index]`); the returned entries have each
 * known brick's validated data, and entries of unknown bricks are kept as
 * they are, so retiring a brick never loses content.
 */
export function validateEntries(bricks: readonly AnyBrick[], raw: readonly unknown[], issues: EntryIssue[]): PageEntry[] {
  const byName = brickMap(bricks);
  const seen = new Set<string>();
  const entries: PageEntry[] = [];
  raw.forEach((item, index) => {
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
  return entries;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const NOT_JSON = 'Data must be plain JSON (objects, arrays, strings, finite numbers, booleans, null)';

/**
 * A deep copy of `value` as plain JSON data, unwrapping stores (Solid 2's
 * `snapshot` returns plain objects as they are, so it doesn't copy). Values
 * JSON can't hold (functions, promises, dates, cycles, non-finite numbers)
 * are dropped from objects and nulled in arrays with `'drop'`, as
 * `JSON.stringify` does; with `'fail'` they make the result undefined.
 */
export function toJson(value: unknown, mode: 'drop' | 'fail'): unknown {
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
