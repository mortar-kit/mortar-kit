// contentClient: the browser side of createContentServer. From the app's
// "use server" functions it builds the reads routes use (cached), the reads
// the admin uses (fresh) and the admin's `Content`, which drops cached
// reads after every write so the site shows what was saved.
import type { ContentServer } from './content-server.ts';
import type { Content, ContentSource } from './store.ts';

/** Options for `contentClient`. Pass the router's and server functions' helpers; Mortar depends on neither. */
export interface ContentClientOptions {
  /** Declares a read as a GET (`GET` from `@solidjs/web/server-functions`), so reads aren't mutations that revalidate everything. */
  read?: (fn: (...args: never[]) => Promise<unknown>) => unknown;
  /** Caches a read per request and across hydration (`query` from `@solidjs/router`). */
  cache?: (fn: (...args: never[]) => Promise<unknown>, key: string) => unknown;
  /** Runs after each successful write, to drop cached reads (`() => query.clear()`). */
  onWrite?: () => void;
}

/** What `contentClient` builds. */
export interface ContentClient {
  /** Cached reads, for routes, layouts and bricks (`<ContentContext value={source}>`). */
  source: ContentSource;
  /** Uncached reads, for the admin's preview: always what is saved now. */
  freshSource: ContentSource;
  /** Reads and writes for `<Admin content>`. */
  content: Content;
}

/**
 * The app's content in the browser (and during SSR), over the functions of
 * its "use server" module.
 *
 * @example
 * ```ts
 * // src/content.ts
 * import { query } from '@solidjs/router';
 * import { GET } from '@solidjs/web/server-functions';
 * import * as server from './server/content.ts';
 *
 * export const { source, freshSource, content } = contentClient(server, { read: GET, cache: query, onWrite: () => query.clear() });
 * ```
 */
export function contentClient(server: ContentServer, options: ContentClientOptions = {}): ContentClient {
  // Both wrappers return a function with the same signature as the one they get.
  const read = <F extends (...args: never[]) => Promise<unknown>>(fn: F): F => (options.read ? (options.read(fn) as F) : fn);
  const cache = <F extends (...args: never[]) => Promise<unknown>>(fn: F, key: string): F => (options.cache ? (options.cache(fn, key) as F) : fn);
  const onWrite = options.onWrite ?? (() => {});
  const list = read(server.list);
  const get = read(server.get);
  const listAssets = read(server.listAssets);
  const listFolders = read(server.listAssetFolders);
  const freshSource: ContentSource = {
    list: (collection, listOptions) => (listOptions === undefined ? list(collection) : list(collection, listOptions)),
    get,
  };
  const cachedList = cache(list, 'mortar-docs');
  const source: ContentSource = {
    list: (collection, listOptions) => (listOptions === undefined ? cachedList(collection) : cachedList(collection, listOptions)),
    get: cache(get, 'mortar-doc'),
  };
  /** Drops cached reads after a write that went through. */
  const after = <R>(result: R): R => {
    if (typeof result !== 'object' || result === null || !('ok' in result) || result.ok) onWrite();
    return result;
  };
  const content: Content = {
    ...freshSource,
    save: async (collection, doc) => after(await server.save(collection, doc as never)),
    remove: async (collection, id) => after(await server.remove(collection, id)),
    move: async (collection, id, index) => after(await server.move(collection, id, index)),
    assets: {
      list: listAssets,
      upload(file, details = {}) {
        // One FormData, which a server function sends natively (not a File beside other arguments).
        const form = new FormData();
        form.set('file', file);
        for (const [part, value] of Object.entries(details)) if (typeof value === 'string') form.set(part, value);
        return server.uploadAsset(form).then(after);
      },
      remove: async (key) => after(await server.removeAsset(key)),
      update: async (key, details) => after(await server.updateAsset(key, details)),
      folders: listFolders,
      saveFolder: async (folder) => after(await server.saveAssetFolder(folder)),
      removeFolder: async (id) => after(await server.removeAssetFolder(id)),
    },
  };
  return { source, freshSource, content };
}
