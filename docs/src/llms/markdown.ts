// Plain Markdown versions of the docs' content, for the llms.txt files:
// one converter per brick (a test fails when a brick has none), reference
// entries as Markdown, and site links rewritten to the Markdown pages.
import type { PageEntry } from '@mortar-kit/core';

import type { ApiEntry } from '../reference/api.ts';

/** Where the docs are published; links in the Markdown files are absolute. */
export const siteUrl = 'https://docs.mortar-kit.dev';

/**
 * The URL an agent should follow for a link on the site: guides, the home
 * page and the reference go to their Markdown versions; anything else (the
 * admin, other sites) keeps its own URL, made absolute when it's on this site.
 */
export function markdownHref(href: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const [, path = '/', rest = ''] = href.match(/^([^?#]*)(.*)$/) ?? [];
  const page = path.replace(/\/$/, '') || '/';
  const md = page === '/' ? '/index.md' : /^\/(docs|reference)(\/[^/]+)?$/.test(page) ? `${page}.md` : null;
  return `${siteUrl}${md ?? path}${rest}`;
}

/** Rewrites root-relative Markdown links (`](/docs/x)`) with `markdownHref`, leaving code alone. */
export function rewriteLinks(source: string): string {
  return source
    .split(/(^```[\s\S]*?^```)/m)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/(\]\()(\/[^)\s]*)/g, (_, open: string, href: string) => open + markdownHref(href))))
    .join('');
}

/** Indents every line after the first, so a multi-paragraph comment stays inside a list item. */
const indent = (text: string) => text.trim().replace(/\n/g, '\n  ');

const hashes = (level: number) => '#'.repeat(Math.min(level, 6));

/**
 * One reference entry as Markdown: its name as a heading at `level`, the
 * import, the declaration, the comment, then parameters, return type,
 * members and examples, as on its page.
 */
export function entryMarkdown(entry: ApiEntry, level = 1): string {
  const sub = hashes(level + 1);
  const out = [`${hashes(level)} \`${entry.name}\` (${entry.kind})`, `\`import { ${entry.name} } from '${entry.module}'\``];
  if (entry.deprecated) out.push('**Deprecated.**');
  out.push('```ts\n' + entry.signature + '\n```');
  if (entry.summary) out.push(rewriteLinks(entry.summary.trim()));
  if (entry.params?.length) {
    out.push(`${sub} Parameters`, entry.params.map((p) => `- \`${p.name}${p.optional ? '?' : ''}: ${p.type}\`${p.doc ? `: ${indent(rewriteLinks(p.doc))}` : ''}`).join('\n'));
  }
  if (entry.returns && entry.returns !== 'void') out.push(`${sub} Returns`, `\`${entry.returns}\``);
  if (entry.members?.length) {
    out.push(
      `${sub} ${entry.kind === 'variable' ? 'Members' : 'Properties'}`,
      entry.members.map((m) => `- \`${m.readonly ? 'readonly ' : ''}${m.name}${m.optional ? '?' : ''}: ${m.type}\`${m.doc ? `: ${indent(rewriteLinks(m.doc))}` : ''}`).join('\n'),
    );
  }
  if (entry.examples?.length) out.push(`${sub} Example`, ...entry.examples.map((e) => rewriteLinks(e.trim())));
  return out.join('\n\n');
}

/** What a converter gets: the entry's data and the reference, for bricks that show an export. */
export interface BrickContext {
  findEntry(name: string): ApiEntry | undefined;
}

type Data = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const link = (label: string, href: string) => (label && href ? `[${label}](${markdownHref(href)})` : '');

/** Markdown for each of the docs' bricks, by brick name. Every brick in bricks/index.ts needs one. */
export const brickMarkdown: Record<string, (data: Data, context: BrickContext) => string> = {
  markdown: (data) => rewriteLinks(text(data.source)),
  callout: (data) => {
    const tone = text(data.tone) || 'note';
    const head = `**${tone[0]!.toUpperCase()}${tone.slice(1)}${text(data.title) ? `: ${text(data.title)}` : ''}**`;
    return `${head}\n\n${rewriteLinks(text(data.body))}`
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');
  },
  figure: (data) => {
    const image = (data.image ?? {}) as Data;
    const src = text(image.src);
    return [src ? `![${text(image.alt)}](${src})` : '', text(data.caption) ? `_${text(data.caption)}_` : ''].filter(Boolean).join('\n\n');
  },
  'api-entry': (data, context) => {
    const entry = context.findEntry(text(data.name));
    return entry ? entryMarkdown(entry, 2) : `No Mortar export is named “${text(data.name)}”.`;
  },
  hero: (data) =>
    [
      `# ${text(data.heading)}`,
      text(data.intro),
      [link(text(data.primaryLabel), text(data.primaryHref)), link(text(data.secondaryLabel), text(data.secondaryHref))].filter(Boolean).join(' · '),
    ]
      .filter(Boolean)
      .join('\n\n'),
  cards: (data) => {
    const items = (Array.isArray(data.items) ? data.items : []) as Data[];
    const list = items.map((item) => {
      const title = text(item.title);
      const head = text(item.href) ? link(title, text(item.href)) : `**${title}**`;
      return `- ${head}${text(item.text) ? `: ${text(item.text)}` : ''}`;
    });
    return [text(data.heading) ? `## ${text(data.heading)}` : '', list.join('\n')].filter(Boolean).join('\n\n');
  },
};

/** A body of entries as Markdown, brick by brick. */
export function entriesMarkdown(entries: readonly PageEntry[], context: BrickContext): string {
  return entries
    .map((entry) => brickMarkdown[entry.brick]?.(entry.data as Data, context) ?? `<!-- The "${entry.brick}" brick has no Markdown version. -->`)
    .filter(Boolean)
    .join('\n\n');
}
