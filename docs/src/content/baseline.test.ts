// The published content is valid: every document passes its collection's
// rules, every brick exists, and every API entry names a real export.
import { validateDoc } from '@mortar-kit/core';
import { describe, expect, it } from 'vitest';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { findEntry } from '../reference/api.ts';
import { baseline } from './baseline.ts';

describe('the docs content', () => {
  it('has a home page and an introduction', () => {
    expect(baseline.pages?.some((d) => d.slug === 'home')).toBe(true);
    expect(baseline.docs?.some((d) => d.slug === 'introduction')).toBe(true);
  });

  for (const c of collections) {
    for (const doc of baseline[c.name] ?? []) {
      it(`${c.name}/${doc.slug} is valid`, async () => {
        const result = validateDoc(c, bricks, doc);
        expect(result.success ? [] : result.issues).toEqual([]);
        for (const entry of doc.entries ?? []) {
          expect(bricks.map((b) => b.name)).toContain(entry.brick);
          if (entry.brick === 'api-entry') expect((await findEntry((entry.data as { name: string }).name)).entry, `${(entry.data as { name: string }).name}`).not.toBeNull();
        }
      });
    }
  }

  it('gives every document a unique id', () => {
    for (const docs of Object.values(baseline)) expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
  });
});
