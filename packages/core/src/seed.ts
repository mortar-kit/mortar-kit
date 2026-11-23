// seed: starter documents for a fresh site, saved through createContent
// (so they are validated like an editor's saves) into collections that are
// still empty. Works with any store; call it when the server starts.
import type { DocIssue } from './doc.ts';
import type { Content } from './store.ts';

/** A starter document: like a `Doc`, but the id may be left out (a random one is made). */
export interface SeedDoc {
  id?: string;
  slug: string;
  fields?: Record<string, unknown>;
  entries?: unknown[];
}

/** What `seed` did. */
export interface SeedResult {
  /** Collections it filled. */
  seeded: string[];
  /** Collections it left alone because they already had documents. */
  skipped: string[];
}

/**
 * Saves starter documents into every collection of `docs` that has none
 * yet, in the order given (so references can point at documents saved
 * earlier). Collections that already have documents are left alone, so it
 * is safe to call on every start. Throws, naming the document and its
 * problems, if one doesn't validate.
 *
 * @example
 * ```ts
 * await seed(content, {
 *   pages: [{ id: 'home', slug: 'home', fields: { title: 'Welcome' }, entries: [] }],
 * });
 * ```
 */
export async function seed(content: Content, docs: Readonly<Record<string, readonly SeedDoc[]>>): Promise<SeedResult> {
  const result: SeedResult = { seeded: [], skipped: [] };
  for (const [collection, list] of Object.entries(docs)) {
    if ((await content.list(collection, { limit: 1 })).length > 0) {
      result.skipped.push(collection);
      continue;
    }
    for (const doc of list) {
      const saved = await content.save(collection, { ...doc, id: doc.id ?? crypto.randomUUID() });
      if (!saved.ok) throw new Error(`Mortar: can't seed ${collection}/${doc.slug}: ${describe(saved.issues)}`);
    }
    result.seeded.push(collection);
  }
  return result;
}

function describe(issues: readonly DocIssue[]): string {
  return issues.map((issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`).join('; ');
}
