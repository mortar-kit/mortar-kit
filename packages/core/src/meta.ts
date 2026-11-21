// definePageMeta: the schema of a site's page-level data (a title, a
// description), built with the same `fields.*` helpers as bricks. With it,
// pages get their metadata normalized on load and validated on save, and
// the editor shows a form for it.
import { keepExtra, schemaOps, type SchemaOps } from './brick.ts';
import type { Fields } from './fields.ts';

/** A page metadata schema, from `definePageMeta`. */
export interface PageMeta<F extends Fields = Fields> extends SchemaOps<F> {
  /** The editable fields, built with `fields.*`. */
  readonly schema: F;
}

/**
 * Declares the page-level data every page of a site has. Keys outside the
 * schema are kept as they are (like entries of unknown bricks), so other
 * code can store its own metadata alongside.
 *
 * @example
 * export const pageMeta = definePageMeta({
 *   title: fields.text({ label: 'Title', required: true }),
 * });
 */
export function definePageMeta<const F extends Fields>(schema: F): PageMeta<F> {
  return { schema, ...keepExtra(schemaOps(schema), schema) };
}
