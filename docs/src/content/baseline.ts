// The site's own content: every JSON file under docs/content/<collection>/,
// bundled into the app (so the site needs no database or file access at
// runtime). The file name is the slug, as with the JSON-file store.
import type { Doc } from '@mortar-kit/core';

const files = import.meta.glob<Omit<Doc, 'slug'>>('../../content/*/*.json', { eager: true, import: 'default' });

/** The published documents, by collection. */
export const baseline: Record<string, Doc[]> = {};
for (const [path, doc] of Object.entries(files)) {
  const [collection, file] = path.split('/').slice(-2) as [string, string];
  (baseline[collection] ??= []).push({ ...doc, slug: file.slice(0, -'.json'.length) });
}
