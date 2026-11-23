/// <reference types="node" />
// @mortar-kit/core/server: server-only storage. The JSON-file store keeps one
// pretty-printed file per document (`<dir>/<collection>/<slug>.json`), so
// content can live in git and diffs stay readable. The slug is the file
// name and isn't repeated inside. Writes are atomic: a temp file is
// written, then renamed over the document. The file blob store keeps
// uploaded files in one folder, named by their keys.
import { randomUUID } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { assetInfo, isValidAssetKey, type BlobInfo, type BlobStore } from './assets.ts';
import { isValidSlug } from './doc.ts';
import type { ContentStore } from './store.ts';

export interface JsonFileStoreOptions {
  /** Directory holding one folder per collection, resolved against the working directory. Created on first save. */
  dir: string;
}

const COLLECTION = /^[a-z][a-z0-9-]*$/;

/**
 * A content store backed by JSON files. Collection names and slugs are
 * checked, so neither can escape `dir`. A file that can't be parsed is
 * skipped when listing (and logged), so one bad file doesn't break every
 * list on the site, but reading it directly throws.
 */
export function createJsonFileStore(options: JsonFileStoreOptions): ContentStore {
  const root = resolve(options.dir);
  const folderOf = (collection: string) => {
    if (!COLLECTION.test(collection)) throw new Error(`Mortar: invalid collection name "${collection}"`);
    return join(root, collection);
  };
  const fileOf = (collection: string, slug: string) => {
    if (!isValidSlug(slug)) throw new Error(`Mortar: invalid slug "${slug}"`);
    return join(folderOf(collection), `${slug}.json`);
  };
  const read = async (file: string, slug: string) => ({ ...(JSON.parse(await readFile(file, 'utf8')) as object), slug });

  return {
    async list(collection) {
      const folder = folderOf(collection);
      let names: string[];
      try {
        names = await readdir(folder);
      } catch (error) {
        if (isNotFound(error)) return [];
        throw error;
      }
      const docs: unknown[] = [];
      for (const name of names.sort()) {
        const slug = name.slice(0, -'.json'.length);
        if (!name.endsWith('.json') || !isValidSlug(slug)) continue;
        try {
          docs.push(await read(join(folder, name), slug));
        } catch (error) {
          if (isNotFound(error)) continue;
          console.error(`Mortar: skipped unreadable document ${join(folder, name)}:`, error);
        }
      }
      return docs;
    },
    async get(collection, slug) {
      try {
        return await read(fileOf(collection, slug), slug);
      } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
      }
    },
    async put(collection, doc) {
      const file = fileOf(collection, doc.slug);
      const temp = `${file}.${randomUUID()}.tmp`;
      const { slug: _, ...stored } = doc;
      await mkdir(folderOf(collection), { recursive: true });
      try {
        await writeFile(temp, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
        await rename(temp, file);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },
    async remove(collection, slug) {
      await rm(fileOf(collection, slug), { force: true });
    },
  };
}

export interface FileBlobStoreOptions {
  /** Directory holding the files, resolved against the working directory. Created on first upload. Keep it out of the app's public folder: serve it with `serveBlob`. */
  dir: string;
  /** Prefix of `url(key)`: where the app serves the folder. Default `/uploads/`. */
  baseUrl?: string;
}

/**
 * A blob store backed by a folder: one file per asset, named by its key
 * (keys are checked, so none can escape `dir`). Writes are atomic. Serve
 * the files from an app route or middleware with `serveBlob`.
 */
export function createFileBlobStore(options: FileBlobStoreOptions): BlobStore {
  const root = resolve(options.dir);
  const baseUrl = options.baseUrl ?? '/uploads/';
  const fileOf = (key: string) => {
    if (!isValidAssetKey(key)) throw new Error(`Mortar: invalid asset key "${key}"`);
    return join(root, key);
  };
  return {
    async list() {
      let names: string[];
      try {
        names = await readdir(root);
      } catch (error) {
        if (isNotFound(error)) return [];
        throw error;
      }
      const files: BlobInfo[] = [];
      for (const key of names.sort()) {
        if (!isValidAssetKey(key)) continue;
        try {
          const info = await stat(join(root, key));
          if (info.isFile()) files.push({ key, size: info.size, modified: info.mtime.toISOString() });
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
      }
      return files;
    },
    async get(key) {
      if (!isValidAssetKey(key)) return undefined;
      const file = fileOf(key);
      try {
        if (!(await stat(file)).isFile()) return undefined;
      } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
      }
      // Read lazily, as it is sent, so a large video isn't held in memory.
      return openAsBlob(file, { type: assetInfo(key)?.type });
    },
    async put(key, data) {
      const file = fileOf(key);
      const temp = join(root, `.${key}.${randomUUID()}.tmp`);
      await mkdir(root, { recursive: true });
      try {
        await writeFile(temp, data.stream());
        await rename(temp, file);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },
    async remove(key) {
      await rm(fileOf(key), { force: true });
    },
    url: (key) => `${baseUrl}${key}`,
  };
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

export type { BlobStore } from './assets.ts';
export type { ContentStore } from './store.ts';
export { createContentServer, type ContentServer, type ContentServerOptions, type ContentWrite, type ContentWriteAction } from './content-server.ts';
