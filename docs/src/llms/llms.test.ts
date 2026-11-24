// The llms.txt files: every brick has a Markdown version, links point at
// the Markdown pages, and every page the index links to is served.
import { describe, expect, it } from 'vitest';

import { bricks } from '../bricks/index.ts';
import { source } from '../content/content.ts';
import api from '../reference/api.json';
import type { ApiFile } from '../reference/api.ts';
import { createLlms } from './files.ts';
import { brickMarkdown, entriesMarkdown, markdownHref, rewriteLinks, siteUrl } from './markdown.ts';

const llms = createLlms(source, api as ApiFile);
const read = async (path: string) => (await llms.file(path))?.body ?? null;

describe('Markdown versions', () => {
  it('cover every brick', () => {
    expect(bricks.map((b) => b.name).filter((name) => !(name in brickMarkdown))).toEqual([]);
  });

  it('link to the Markdown pages', () => {
    expect(markdownHref('/')).toBe(`${siteUrl}/index.md`);
    expect(markdownHref('/docs/fields#lists')).toBe(`${siteUrl}/docs/fields.md#lists`);
    expect(markdownHref('/reference')).toBe(`${siteUrl}/reference.md`);
    expect(markdownHref('/reference/createContent')).toBe(`${siteUrl}/reference/createContent.md`);
    expect(markdownHref('/admin')).toBe(`${siteUrl}/admin`);
    expect(markdownHref('https://solidjs.com')).toBe('https://solidjs.com');
    expect(rewriteLinks('See [Fields](/docs/fields).\n\n```md\n[x](/docs/x)\n```')).toBe(`See [Fields](${siteUrl}/docs/fields.md).\n\n\`\`\`md\n[x](/docs/x)\n\`\`\``);
  });

  it('render callouts as quotes and reference entries in full', () => {
    const md = entriesMarkdown(
      [
        { brick: 'callout', id: 'c', data: { tone: 'warning', title: 'Careful', body: 'One.\n\nTwo.' } },
        { brick: 'api-entry', id: 'a', data: { name: 'createContent' } },
      ],
      { findEntry: (name) => (api as ApiFile).entries.find((e) => e.name === name) },
    );
    expect(md).toContain('> **Warning: Careful**\n>\n> One.\n>\n> Two.');
    expect(md).toContain("## `createContent` (function)\n\n`import { createContent } from '@mortar-kit/core'`");
  });
});

describe('the llms files', () => {
  it('index every guide and export, and every link is served', async () => {
    const index = (await read('/llms.txt'))!;
    expect(index).toMatch(/^# Mortar\n\n> /);
    expect(index).toContain(`[Quick start](${siteUrl}/docs/quick-start.md)`);
    expect(index).toContain(`[Changelog](${siteUrl}/changelog.md)`);
    for (const entry of (api as ApiFile).entries) expect(index).toContain(`[${entry.name}](`);
    const links = [...index.matchAll(/\]\((https:\/\/docs\.mortar-kit\.dev\/[^)#]+)/g)].map((m) => m[1]!.slice(siteUrl.length));
    for (const path of new Set(links)) expect(await read(path), path).not.toBeNull();
  });

  it('put every guide, the reference and the changelog in llms-full.txt', async () => {
    const full = (await read('/llms-full.txt'))!;
    expect(full).toContain(`Source: ${siteUrl}/changelog\n\n# Changelog`);
    expect(full).toContain('### Upgrading from 0.1');
    expect(full).toContain('# Quick start\n\n> A brick, a collection');
    expect(full).toContain('# API reference');
    expect(full).toContain('### `createJsonFileStore` (function)');
  });

  it('serve each page as Markdown', async () => {
    expect(await read('/docs/quick-start.md')).toMatch(/^# Quick start\n\n> .+\n\nThis walk-through/);
    expect(await read('/docs.md')).toMatch(/^# Introduction/);
    expect(await read('/index.md')).toMatch(/^# Build sites from bricks/);
    expect(await read('/reference/defineBrick.md')).toMatch(/^# `defineBrick` \(function\)/);
    expect(await read('/changelog.md')).toMatch(/^# Changelog\n/);
    expect((await llms.file('/docs/quick-start.md'))?.type).toBe('text/markdown; charset=utf-8');
    expect((await llms.file('/llms.txt'))?.type).toBe('text/plain; charset=utf-8');
  });

  it('serve nothing for other paths', async () => {
    for (const path of ['/docs/nope.md', '/reference/nope.md', '/robots.txt', '/docs/quick-start', '/reference/%E0.md']) expect(await read(path), path).toBeNull();
  });
});
