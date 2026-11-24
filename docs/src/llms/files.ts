// The llms.txt files (https://llmstxt.org), built on request from the same
// published content and generated reference the site renders, so they can't
// drift from it:
//
// - /llms.txt: the index: every guide by section and every export, linked
//   to their Markdown pages.
// - /llms-full.txt: every guide, the whole reference, then the changelog
//   (CHANGELOG.md, with each release's upgrading notes), in one file.
// - /index.md, /docs.md, /docs/<slug>.md, /reference.md, /reference/<name>.md,
//   /changelog.md: each page of the site as Markdown.
import { contentReader, type ContentSource, type DocOf } from '@mortar-kit/core';

import { changelog } from '../changelog.ts';
import { docs, pages, sections } from '../collections.ts';
import { firstSentence, type ApiFile } from '../reference/api.ts';
import { entriesMarkdown, entryMarkdown, markdownHref, siteUrl, type BrickContext } from './markdown.ts';

type Guide = DocOf<typeof docs>;

/** A file of the llms output: its text and content type. */
export interface LlmsFile {
  body: string;
  type: string;
}

const markdown = (body: string): LlmsFile => ({ body: body.trim() + '\n', type: 'text/markdown; charset=utf-8' });
/** A path segment, decoded; a malformed one stays as it is (and matches nothing). */
function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const plain = (body: string): LlmsFile => ({ body: body.trim() + '\n', type: 'text/plain; charset=utf-8' });

/** The llms output over a content source and the reference. */
export function createLlms(source: ContentSource, api: ApiFile) {
  const content = contentReader(source);
  const context: BrickContext = { findEntry: (name) => api.entries.find((e) => e.name === name) };

  /** Every guide with its body, grouped as the sidebar groups them; guides outside a section come last. */
  async function guideGroups(): Promise<{ label: string; guides: Guide[] }[]> {
    const summaries = await content.list(docs);
    const guides = (await Promise.all(summaries.map((s) => content.get(docs, { id: s.id })))).filter((g) => g !== null);
    const groups: { label: string; guides: Guide[] }[] = Object.entries(sections).map(([section, label]) => ({ label, guides: guides.filter((g) => g.fields.section === section) }));
    groups.push({ label: 'Other guides', guides: guides.filter((g) => !(g.fields.section && g.fields.section in sections)) });
    return groups.filter((g) => g.guides.length > 0);
  }

  async function home() {
    return content.get(pages, { slug: 'home' });
  }

  function guideMarkdown(guide: Guide): string {
    const head = [`# ${guide.fields.title}`, guide.fields.description ? `> ${guide.fields.description}` : ''];
    return [...head, entriesMarkdown(guide.entries ?? [], context)].filter(Boolean).join('\n\n');
  }

  function referenceMarkdown(level: number): string {
    return api.modules
      .map((module) => [`${'#'.repeat(level)} \`${module}\``, ...api.entries.filter((e) => e.module === module).map((e) => entryMarkdown(e, level + 1))].join('\n\n'))
      .join('\n\n');
  }

  async function intro(): Promise<string[]> {
    const page = await home();
    return [`# ${page?.fields.title ?? 'Mortar'}`, page?.fields.description ? `> ${page.fields.description}` : ''];
  }

  async function index(): Promise<string> {
    const lines = await intro();
    lines.push(
      `These docs are also published as Markdown: each link below is a page's Markdown version (drop \`.md\` for the HTML page), and [llms-full.txt](${siteUrl}/llms-full.txt) has every guide, the whole API reference and the changelog in one file.`,
    );
    for (const group of await guideGroups()) {
      lines.push(`## ${group.label}`, group.guides.map((g) => `- [${g.fields.title}](${markdownHref(`/docs/${g.slug}`)})${g.fields.description ? `: ${g.fields.description}` : ''}`).join('\n'));
    }
    lines.push('## Changelog', `- [Changelog](${markdownHref('/changelog')}): what each release adds, and what to change when upgrading (renamed options, environment variables, new startup checks).`);
    lines.push('## API reference', `- [Every export](${markdownHref('/reference')}): the whole reference on one page, generated from the packages' TypeScript sources.`);
    for (const module of api.modules) {
      const entries = api.entries.filter((e) => e.module === module);
      lines.push(`### \`${module}\``, entries.map((e) => `- [${e.name}](${markdownHref(`/reference/${encodeURIComponent(e.name)}`)}) (${e.kind})${e.summary ? `: ${firstSentence(e.summary)}` : ''}`).join('\n'));
    }
    return lines.filter(Boolean).join('\n\n');
  }

  async function full(): Promise<string> {
    const parts = await intro();
    for (const group of await guideGroups()) {
      for (const guide of group.guides) parts.push(`Source: ${siteUrl}/docs/${guide.slug}`, guideMarkdown(guide));
    }
    parts.push('# API reference', `Source: ${siteUrl}/reference`, referenceMarkdown(2));
    parts.push(`Source: ${siteUrl}/changelog`, changelog.trim());
    return parts.filter(Boolean).join('\n\n');
  }

  /** The file at `pathname`, or null when it isn't one of the llms files. */
  async function file(pathname: string): Promise<LlmsFile | null> {
    if (pathname === '/llms.txt') return plain(await index());
    if (pathname === '/llms-full.txt') return plain(await full());
    if (pathname === '/index.md') {
      const page = await home();
      return page && markdown(entriesMarkdown(page.entries ?? [], context));
    }
    if (pathname === '/changelog.md') return markdown(changelog);
    if (pathname === '/reference.md') return markdown(`# API reference\n\nEvery export of the Mortar packages, generated from their TypeScript sources and comments.\n\n${referenceMarkdown(2)}`);
    const ref = pathname.match(/^\/reference\/([^/]+)\.md$/);
    if (ref) {
      const entry = context.findEntry(decode(ref[1]!));
      return entry ? markdown(entryMarkdown(entry, 1)) : null;
    }
    // /docs shows the introduction, so /docs.md is its Markdown too.
    const doc = pathname.match(/^\/docs(?:\/([^/]+))?\.md$/);
    if (doc) {
      const guide = await content.get(docs, { slug: doc[1] === undefined ? 'introduction' : decode(doc[1]) });
      return guide && markdown(guideMarkdown(guide));
    }
    return null;
  }

  return { file };
}
