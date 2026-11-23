// defineCollection: a named set of documents sharing one schema, such as
// posts, products or a site's pages. Each document has typed `fields` (what
// lists and pickers show) and, when the collection has a `body`, brick
// entries: a body made of bricks. An `orderable` collection is kept in a
// manual order.
import { keepExtra, schemaOps, type SchemaOps } from './brick.ts';
import type { Doc } from './doc.ts';
import { fieldInfo, type Fields, type InferFields } from './fields.ts';
import { checkUrlPattern, urlFor } from './urls.ts';

/** A list order: by a field of the collection or by slug. */
export interface SortOrder<K extends string = string> {
  field: K | 'slug';
  /** Default `'asc'`. */
  order?: 'asc' | 'desc';
}

/** What a developer passes to `defineCollection`. */
export interface CollectionDefinition<F extends Fields> {
  /** Stable identifier, also the storage folder. Lowercase, e.g. `posts` or `case-studies`. */
  name: string;
  /** Plural name for the admin panel ("Posts"). Defaults to `name`. */
  label?: string;
  /** The fields every document has, built with `fields.*`. */
  fields: F;
  /** Whether documents also have brick entries (a body made of bricks). Default false. */
  body?: boolean;
  /**
   * A `text` field shown as the document's title in lists and pickers.
   * Defaults to the first `text` field; without one, the slug is shown.
   */
  title?: keyof F & string;
  /**
   * The default list order. Defaults to the title field (or the slug),
   * ascending. With `orderable`, lists follow the manual order instead and
   * this orders only documents that have no place in it yet.
   */
  sort?: SortOrder<keyof F & string>;
  /**
   * Whether editors put the documents in order by hand (drag or move
   * up/down in the admin). Lists then follow that order unless they pass a
   * `sort`, and new documents go to the end. The order is kept in each
   * document's `position`, which `createContent` manages. Default false.
   */
  orderable?: boolean;
  /**
   * Slugs documents may not use, e.g. the app's own route segments next to
   * `/:slug` (`admin`). Segments other collections' `url`s start with are
   * refused anyway (see `url`).
   */
  reservedSlugs?: readonly string[];
  /**
   * Where a document is on the site: a path with one `:slug` segment, e.g.
   * `/posts/:slug` or `/:slug`. One pattern drives the app's route (the
   * same syntax as @solidjs/router), links (`urlOf`), the admin's preview
   * links, and the sitemap; next to `/posts/:slug`, a `/:slug` collection
   * can't use the slug `posts`. Mortar doesn't route: the app still
   * declares its routes, from this.
   */
  url?: string;
  /** With `url`: the slug of the document at the pattern's prefix instead, e.g. `home` at `/` for `/:slug`. */
  home?: string;
}

/** A registered collection. Its `SchemaOps` apply to a document's `fields` (keys outside the schema are kept). */
export interface Collection<F extends Fields = Fields> extends SchemaOps<F> {
  readonly name: string;
  readonly label: string;
  readonly fields: F;
  readonly body: boolean;
  readonly title: (keyof F & string) | undefined;
  readonly sort: Required<SortOrder>;
  /** Whether documents are in a manual order (see `CollectionDefinition.orderable`). */
  readonly orderable: boolean;
  readonly reservedSlugs: readonly string[];
  /** The document path pattern (see `CollectionDefinition.url`). */
  readonly url: string | undefined;
  /** The slug of the document at the pattern's prefix (see `CollectionDefinition.home`). */
  readonly home: string | undefined;
  /** A document's path on the site, from `url`; undefined without one. */
  urlOf(doc: { slug: string }): string | undefined;
  /** A document's label in lists: its title field, or its slug when that is empty or there is no title field. */
  titleOf(doc: { slug: string; fields: Record<string, unknown> }): string;
  /** A new, unsaved document with a fresh id and default fields. Call it from event handlers, not during render. */
  create(slug: string): Doc<InferFields<F>>;
}

/** A collection of any schema, e.g. in a list of collections. */
// oxlint-disable-next-line typescript/no-explicit-any -- variance: any collection fits.
export type AnyCollection = Collection<any>;

/** The document type of a collection. */
export type DocOf<C extends AnyCollection> = Doc<InferFields<C['fields']>>;

const NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Registers a collection.
 *
 * @example
 * export const posts = defineCollection({
 *   name: 'posts',
 *   label: 'Posts',
 *   fields: { title: fields.text({ label: 'Title', required: true }), date: fields.date({ label: 'Date' }) },
 *   body: true,
 *   sort: { field: 'date', order: 'desc' },
 * });
 */
export function defineCollection<const F extends Fields>(def: CollectionDefinition<F>): Collection<F> {
  const where = `defineCollection(${def.name})`;
  if (!NAME.test(def.name)) throw new Error(`${where}: invalid name (use lowercase letters, digits and dashes)`);
  const isText = (key: string) => Object.hasOwn(def.fields, key) && fieldInfo(def.fields[key]!)?.kind === 'text';
  if (def.title !== undefined && !isText(def.title)) throw new Error(`${where}: title "${def.title}" is not a text field`);
  const title = def.title ?? Object.keys(def.fields).find(isText);
  const sortField = def.sort?.field ?? title ?? 'slug';
  if (sortField !== 'slug' && !Object.hasOwn(def.fields, sortField)) throw new Error(`${where}: cannot sort by unknown field "${sortField}"`);
  if (def.url !== undefined) checkUrlPattern(where, def.url);
  if (def.home !== undefined && def.url === undefined) throw new Error(`${where}: home needs a url`);
  const body = def.body ?? false;
  const ops = keepExtra(schemaOps(def.fields), def.fields);
  return {
    name: def.name,
    label: def.label ?? def.name,
    fields: def.fields,
    body,
    title: title as (keyof F & string) | undefined,
    sort: { field: sortField, order: def.sort?.order ?? 'asc' },
    orderable: def.orderable ?? false,
    reservedSlugs: def.reservedSlugs ?? [],
    url: def.url,
    home: def.home,
    ...ops,
    urlOf(doc) {
      return urlFor({ url: def.url, home: def.home }, doc);
    },
    titleOf(doc) {
      const value = title === undefined ? undefined : doc.fields[title];
      return typeof value === 'string' && value.trim() !== '' ? value : doc.slug;
    },
    create(slug) {
      const doc: Doc<InferFields<F>> = { id: crypto.randomUUID(), slug, fields: ops.defaults() };
      if (body) doc.entries = [];
      return doc;
    },
  };
}

/** Indexes collections by name, rejecting duplicates. */
export function collectionMap(collections: readonly AnyCollection[]): ReadonlyMap<string, AnyCollection> {
  const map = new Map<string, AnyCollection>();
  for (const c of collections) {
    if (map.has(c.name)) throw new Error(`Mortar: two collections are named "${c.name}"`);
    map.set(c.name, c);
  }
  return map;
}
