// Document URLs: a collection's `url` pattern (`/posts/:slug`, `/:slug`)
// written once and used everywhere a site needs it: the app's routes
// (the same `:slug` syntax as @solidjs/router), links (`urlOf`), the
// admin's preview links (`resolveUrl`), the sitemap (`sitemap`), and the
// slugs a `/:slug` collection can't take because another collection's
// pattern starts there (`takenSlugs`, applied by createContent).
import type { AnyCollection } from './collection.ts';
import type { ContentSource } from './store.ts';

const SLUG = ':slug';

/** Checks a collection's `url` pattern: starts with `/`, has `:slug` once as a whole segment, and no other parameter. */
export function checkUrlPattern(where: string, pattern: string): void {
  const segments = pattern.split('/').slice(1);
  const ok =
    pattern.startsWith('/') &&
    segments.filter((s) => s === SLUG).length === 1 &&
    segments.every((s) => s === SLUG || /^[a-z0-9][a-z0-9._~-]*$/i.test(s));
  if (!ok) throw new Error(`${where}: url "${pattern}" must be a path with one ":slug" segment, e.g. "/posts/:slug"`);
}

/** A document's path, from its collection's `url` (the `home` document's is the pattern's prefix, e.g. `/`); undefined without a pattern. */
export function urlFor(collection: Pick<AnyCollection, 'url' | 'home'>, doc: { slug: string }): string | undefined {
  const pattern = collection.url;
  if (pattern === undefined) return undefined;
  if (collection.home !== undefined && doc.slug === collection.home) {
    const prefix = pattern.slice(0, pattern.indexOf(SLUG)).replace(/\/+$/, '');
    return prefix === '' ? '/' : prefix;
  }
  return pattern.replace(SLUG, doc.slug);
}

/**
 * The document a path of the site shows, by the collections' `url`
 * patterns: `/posts/hello` → `{ collection: 'posts', slug: 'hello' }`. As
 * in routers, the more specific pattern wins (`/posts/:slug` over
 * `/:slug`), and paths compare case-insensitively. Undefined when no
 * pattern matches.
 */
export function resolveUrl(collections: readonly AnyCollection[], url: URL | string): { collection: string; slug: string } | undefined {
  const raw = typeof url === 'string' ? new URL(url, 'http://x').pathname : url.pathname;
  const path = (raw.length > 1 ? raw.replace(/\/+$/, '') : raw).toLowerCase();
  for (const c of byStaticSegments(collections)) {
    if (c.home !== undefined && urlFor(c, { slug: c.home })?.toLowerCase() === path) return { collection: c.name, slug: c.home };
    const pattern = c.url!.toLowerCase();
    const at = pattern.indexOf(SLUG);
    const before = pattern.slice(0, at);
    const after = pattern.slice(at + SLUG.length);
    if (path.length <= before.length + after.length || !path.startsWith(before) || !path.endsWith(after)) continue;
    const slug = path.slice(before.length, path.length - after.length);
    if (!slug.includes('/')) return { collection: c.name, slug };
  }
  return undefined;
}

/**
 * Slugs `collection` can't use because another collection's pattern
 * starts there: next to `/posts/:slug`, a page at `/:slug` can't be
 * called `posts`. createContent refuses them, like `reservedSlugs`.
 */
export function takenSlugs(collection: AnyCollection, collections: readonly AnyCollection[]): string[] {
  const pattern = collection.url;
  if (pattern === undefined) return [];
  const prefix = pattern.slice(0, pattern.indexOf(SLUG));
  const taken = new Set<string>();
  for (const other of collections) {
    if (other === collection || other.url === undefined || !other.url.startsWith(prefix)) continue;
    const next = other.url.slice(prefix.length).split('/')[0]!;
    if (next !== '' && next !== SLUG) taken.add(next.toLowerCase());
  }
  return [...taken];
}

/** Options for `sitemap`. */
export interface SitemapOptions {
  /** The site's public origin, e.g. `https://example.com`. */
  origin: string;
  /** Leave a document out (e.g. drafts). */
  include?: (collection: AnyCollection, doc: { id: string; slug: string; fields: Record<string, unknown> }) => boolean;
  /** Paths to list besides the documents', e.g. `['/posts']`. */
  extra?: readonly string[];
  /**
   * When each document last changed, as its `<lastmod>`: the name of a
   * field holding a date (`fields.date`'s `YYYY-MM-DD`, or a full ISO
   * time), or a function returning one (a string or a Date). Documents
   * without one get no `<lastmod>`.
   */
  lastmod?: string | ((collection: AnyCollection, doc: { id: string; slug: string; fields: Record<string, unknown> }) => string | Date | null | undefined);
}

/**
 * A sitemap (sitemaps.org XML) of every document whose collection has a
 * `url`, read through `content`. Serve it at `/sitemap.xml`.
 *
 * @example
 * ```ts
 * if (path === '/sitemap.xml') return new Response(await sitemap(content, collections, { origin }), { headers: { 'content-type': 'application/xml' } });
 * ```
 */
export async function sitemap(content: ContentSource, collections: readonly AnyCollection[], options: SitemapOptions): Promise<string> {
  const origin = new URL(options.origin).origin;
  // Path → lastmod (empty: none); the first entry for a path wins.
  const paths = new Map<string, string>();
  for (const path of options.extra ?? []) paths.set(path, '');
  const { lastmod } = options;
  for (const c of collections) {
    if (c.url === undefined) continue;
    for (const doc of await content.list(c.name)) {
      if (options.include && !options.include(c, doc)) continue;
      const path = urlFor(c, doc)!;
      if (paths.has(path)) continue;
      const raw = typeof lastmod === 'function' ? lastmod(c, doc) : typeof lastmod === 'string' ? doc.fields[lastmod] : undefined;
      paths.set(path, w3cDate(raw));
    }
  }
  const urls = [...paths].map(([path, modified]) => {
    const mod = modified ? `<lastmod>${escapeXml(modified)}</lastmod>` : '';
    return `  <url><loc>${escapeXml(new URL(path, origin).href)}</loc>${mod}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** Collections with a `url`, the most static segments first (ties: longer pattern first). */
function byStaticSegments(collections: readonly AnyCollection[]): AnyCollection[] {
  const statics = (c: AnyCollection) => c.url!.split('/').filter((s) => s !== '' && s !== SLUG).length;
  return collections.filter((c) => c.url !== undefined).sort((a, b) => statics(b) - statics(a) || b.url!.length - a.url!.length);
}

/** A sitemap date (`YYYY-MM-DD` or an ISO time) from a Date or a string; '' when it isn't one. */
function w3cDate(value: unknown): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return '';
  const time = new Date(text);
  return Number.isNaN(time.getTime()) ? '' : time.toISOString();
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
