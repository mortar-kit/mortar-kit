/// <reference types="node" />
// @mortar-kit/core/server: server-only storage. The JSON-file store keeps one
// pretty-printed file per page (`<dir>/<slug>.json`), so content can live in
// git and diffs stay readable. Writes are atomic: a temp file is written,
// then renamed over the page.
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { Page } from './page.ts';
import { isValidSlug, type PageStore } from './store.ts';

export interface JsonFileStoreOptions {
  /** Directory holding the page files, resolved against the working directory. Created on first save. */
  dir: string;
}

/** A page store backed by one JSON file per page. Slugs are validated, so a slug can't escape `dir`. */
export function createJsonFileStore(options: JsonFileStoreOptions): PageStore {
  const dir = resolve(options.dir);
  const fileOf = (slug: string) => {
    if (!isValidSlug(slug)) throw new Error(`Mortar: invalid page slug "${slug}"`);
    return join(dir, `${slug}.json`);
  };

  return {
    async load(slug) {
      try {
        return JSON.parse(await readFile(fileOf(slug), 'utf8')) as Page;
      } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
      }
    },
    async save(slug, page) {
      const file = fileOf(slug);
      const temp = `${file}.${randomUUID()}.tmp`;
      await mkdir(dir, { recursive: true });
      try {
        await writeFile(temp, `${JSON.stringify(page, null, 2)}\n`, 'utf8');
        await rename(temp, file);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },
    async list() {
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (error) {
        if (isNotFound(error)) return [];
        throw error;
      }
      return names
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
        .filter(isValidSlug)
        .sort();
    },
  };
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

export type { PageStore } from './store.ts';
