// createContentServer: the server side of an app's content, as plain
// functions for its "use server" module to export: reads open to all,
// writes behind `auth.require` (each checks for itself, since middleware
// can't tell the admin's server-function calls apart), and every write
// answered without revalidating, so a save never refetches into the open
// editor. contentClient (content-client.ts) is the browser side.
import { getRequestEvent, respond } from '@solidjs/web';
import { configureServerFunctionsServer } from '@solidjs/web/server-functions/server';

import type { Asset, AssetDetails, AssetFolder } from './assets.ts';
import type { Doc, DocRef, DocSummary } from './doc.ts';
import type { Content, FolderResult, ListOptions, RemoveResult, SaveResult, UpdateAssetResult, UploadResult } from './store.ts';

/** The content functions an app's "use server" module exports, by these names, for `contentClient`. */
export interface ContentServer {
  /** Documents of a collection, without their bodies. */
  list(collection: string, options?: ListOptions): Promise<DocSummary[]>;
  /** One document, or null. */
  get(collection: string, ref: DocRef): Promise<Doc | null>;
  /** Validates and stores a document (signed-in only). */
  save(collection: string, doc: Doc): Promise<SaveResult>;
  /** Deletes a document, unless others reference it (signed-in only). */
  remove(collection: string, id: string): Promise<RemoveResult>;
  /** Moves a document of an orderable collection (signed-in only). */
  move(collection: string, id: string, index: number): Promise<void>;
  /** Every uploaded file, newest first ([] without a blob store). */
  listAssets(): Promise<Asset[]>;
  /** Stores a file sent as form data: `file`, plus optional `folder`, `title` and `alt` (signed-in only). */
  uploadAsset(form: FormData): Promise<UploadResult>;
  /** Deletes a file, unless documents use it (signed-in only). */
  removeAsset(key: string): Promise<RemoveResult>;
  /** Sets a file's default title, alt text or folder (signed-in only). */
  updateAsset(key: string, details: AssetDetails): Promise<UpdateAssetResult>;
  /** Every asset folder. */
  listAssetFolders(): Promise<AssetFolder[]>;
  /** Creates or renames an asset folder (signed-in only). */
  saveAssetFolder(folder: { id?: string; name: string }): Promise<FolderResult>;
  /** Deletes an asset folder; its files stay (signed-in only). */
  removeAssetFolder(id: string): Promise<void>;
}

/** The writing functions of a `ContentServer`, by name. */
export type ContentWriteAction =
  | 'save'
  | 'remove'
  | 'move'
  | 'uploadAsset'
  | 'removeAsset'
  | 'updateAsset'
  | 'saveAssetFolder'
  | 'removeAssetFolder';

/** One write, as `canWrite` sees it. */
export interface ContentWrite<User> {
  /** Who is writing: what `auth.require` returned (undefined with `auth: false`). */
  user: User;
  /** The function called. */
  action: ContentWriteAction;
  /** The collection a document write touches; undefined for asset writes. */
  collection?: string;
  /** The document's id (save, remove, move), the asset's key (removeAsset, updateAsset) or the folder's id (folders; undefined for a new one). */
  id?: string;
  /** The document being saved (save only). */
  doc?: Doc;
}

/** Options for `createContentServer`. */
export interface ContentServerOptions<User = unknown> {
  /** The app's `createContent(...)`. */
  content: Content;
  /**
   * Who may write: `auth.require(request)` resolves for a signed-in editor
   * and throws a Response otherwise (`createAuth` from `@mortar-kit/auth`).
   * `false` leaves writes open to anyone: only for local experiments.
   */
  auth: { require(request: Request): Promise<User> } | false;
  /**
   * Which writes a signed-in editor may make, after `auth` let them in:
   * false refuses the write with a 403 ("Not allowed"), which the admin
   * shows. Default: every editor may write everything.
   *
   * @example
   * ```ts
   * // Only owners change who may sign in.
   * canWrite: ({ user, collection }) => collection !== 'members' || user.role === 'owner',
   * ```
   */
  canWrite?: (write: ContentWrite<User>) => boolean | Promise<boolean>;
}

/** Room for the form encoding around an upload, on top of the file itself. */
const FORM_OVERHEAD = 1024 * 1024;

/**
 * The server side of the app's content, for its "use server" module to
 * export. It also raises the server-function request body limit to fit
 * the content's largest upload, so import the module that calls it from
 * the plugin's `serverFunctions.serverSetup`.
 *
 * @example
 * ```ts
 * // src/server/mortar.ts (imported by serverFunctions.serverSetup too)
 * export const server = createContentServer({ content, auth });
 *
 * // src/server/content.ts
 * 'use server';
 * import { server } from './mortar.ts';
 * export const list = server.list;
 * export const get = server.get;
 * export const save = server.save;
 * // …and the same for remove, move, listAssets, uploadAsset, removeAsset,
 * // updateAsset, listAssetFolders, saveAssetFolder and removeAssetFolder
 * ```
 */
export function createContentServer<User = unknown>(options: ContentServerOptions<User>): ContentServer {
  const { content } = options;
  const assets = content.assets;
  if (assets?.maxSize) configureServerFunctionsServer({ bodySizeLimit: assets.maxSize + FORM_OVERHEAD });

  const signedIn = async (): Promise<User> => {
    if (options.auth === false) return undefined as User;
    const event = getRequestEvent();
    if (!event) throw new Response('Sign in required', { status: 401 });
    return options.auth.require(event.request);
  };
  /**
   * A write: signed-in only, allowed by `canWrite`, and answered without
   * revalidating anything. `describe` names what the call touches.
   */
  const write =
    <A extends unknown[], R>(action: ContentWriteAction, describe: (args: NoInfer<A>) => Omit<ContentWrite<User>, 'user' | 'action'>, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const user = await signedIn();
      if (options.canWrite && !(await options.canWrite({ user, action, ...describe(args) }))) {
        throw new Response('Not allowed', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      return respond(await fn(...args), { revalidate: '' }) as R;
    };
  const none = () => ({});
  const needAssets = () => {
    if (!assets) throw new Error('Mortar: this content has no blob store (createContent({ blobs }))');
    return assets;
  };
  const needs = <K extends keyof NonNullable<Content['assets']>>(name: K) => {
    const fn = needAssets()[name];
    if (typeof fn !== 'function') throw new Error(`Mortar: this content's assets have no ${String(name)}`);
    return fn.bind(assets) as NonNullable<NonNullable<Content['assets']>[K]>;
  };

  return {
    list: async (collection, listOptions) => (listOptions === undefined || listOptions === null ? content.list(collection) : content.list(collection, listOptions)),
    get: async (collection, ref) => content.get(collection, ref),
    save: write(
      'save',
      ([collection, doc]) => ({ collection, id: doc?.id, doc }),
      (collection: string, doc: Doc) => content.save(collection, doc),
    ),
    remove: write(
      'remove',
      ([collection, id]) => ({ collection, id }),
      (collection: string, id: string) => content.remove(collection, id),
    ),
    move: write('move', ([collection, id]) => ({ collection, id }), async (collection: string, id: string, index: number) => {
      if (!content.move) throw new Error('Mortar: this content cannot reorder documents');
      return content.move(collection, id, index);
    }),
    listAssets: async () => (assets ? assets.list() : []),
    uploadAsset: write('uploadAsset', none, async (form: FormData) => {
      const file = form instanceof FormData ? form.get('file') : null;
      if (!(file instanceof File)) return { ok: false, message: 'Not a file' } satisfies UploadResult;
      const details: AssetDetails = {};
      for (const part of ['folder', 'title', 'alt'] as const) {
        const value = form.get(part);
        if (typeof value === 'string') details[part] = value;
      }
      return needAssets().upload(file, details);
    }),
    removeAsset: write('removeAsset', ([id]) => ({ id }), (key: string) => needAssets().remove(key)),
    updateAsset: write('updateAsset', ([id]) => ({ id }), (key: string, details: AssetDetails) => needs('update')(key, details)),
    listAssetFolders: async () => (assets?.folders ? assets.folders() : []),
    saveAssetFolder: write(
      'saveAssetFolder',
      ([folder]) => ({ id: folder?.id }),
      (folder: { id?: string; name: string }) => needs('saveFolder')(folder),
    ),
    removeAssetFolder: write('removeAssetFolder', ([id]) => ({ id }), (id: string) => needs('removeFolder')(id)),
  };
}
