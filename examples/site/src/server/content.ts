'use server';
// Server functions for content: the JSON-file store and the uploads folder,
// behind Mortar's rules (createContent), wrapped for the app. They live here, in the app, because
// the vite plugin compiles "use server" only outside node_modules. The
// client gets references to these functions, so node:fs never reaches the
// browser.
//
// Reads are public (the site renders from them). Writes (saving, deleting,
// reordering, uploads) need a signed-in admin: each checks for itself, since the
// middleware that guards /admin pages can't tell the admin's
// server-function calls apart.
import {
  createContent,
  type Asset,
  type AssetDetails,
  type AssetFolder,
  type Doc,
  type DocRef,
  type DocSummary,
  type FolderResult,
  type ListOptions,
  type RemoveResult,
  type SaveResult,
  type UpdateAssetResult,
  type UploadResult,
} from '@mortar-kit/core';
import { createJsonFileStore } from '@mortar-kit/core/server';
import { getRequestEvent, respond } from '@solidjs/web';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { auth } from './auth.ts';
import { blobs } from './blobs.ts';

// `content/<collection>/<slug>.json` and `uploads/<key>`, resolved against the working directory: run the server from examples/site.
const content = createContent({ store: createJsonFileStore({ dir: 'content' }), blobs, collections, bricks });
// Asset details and folders are kept in `content/mortar-assets/library.json`.
const assets = content.assets as NonNullable<typeof content.assets>;

/** Documents of a collection, without their bodies. */
export async function listStoredDocs(collection: string, options?: ListOptions): Promise<DocSummary[]> {
  return content.list(collection, options);
}

/** One document, normalized for rendering, or null. */
export async function getStoredDoc(collection: string, ref: DocRef): Promise<Doc | null> {
  return content.get(collection, ref);
}

/** Validates and stores a document from the admin. */
export async function saveStoredDoc(collection: string, doc: Doc): Promise<SaveResult> {
  await requireAdmin();
  // Revalidate nothing: refetching would replace the open editor's state
  // (and anything typed meanwhile). The client drops its cached reads
  // instead (adminContent in src/content.ts).
  return respond(await content.save(collection, doc), { revalidate: '' });
}

/** Deletes a document, unless others reference it. */
export async function removeStoredDoc(collection: string, id: string): Promise<RemoveResult> {
  await requireAdmin();
  return respond(await content.remove(collection, id), { revalidate: '' });
}

/** Moves a document of an orderable collection to `index` in its manual order. */
export async function moveStoredDoc(collection: string, id: string, index: number): Promise<void> {
  await requireAdmin();
  return respond(await content.move(collection, id, index), { revalidate: '' });
}

/** Every uploaded file, newest first. */
export async function listAssets(): Promise<Asset[]> {
  return assets.list();
}

/**
 * Checks and stores a file from the admin. It arrives as form data (`file`,
 * plus optional `folder`, `title` and `alt`): a server function sends a
 * single FormData natively, but not a File beside other arguments. The
 * request body limit is raised in src/server-functions-setup.ts.
 */
export async function uploadAsset(form: FormData): Promise<UploadResult> {
  await requireAdmin();
  const file = form.get('file');
  if (!(file instanceof File)) return { ok: false, message: 'Not a file' };
  const details: AssetDetails = {};
  for (const part of ['folder', 'title', 'alt'] as const) {
    const value = form.get(part);
    if (typeof value === 'string') details[part] = value;
  }
  return respond(await assets.upload(file, details), { revalidate: '' });
}

/** Deletes an uploaded file, unless documents use it. */
export async function removeAsset(key: string): Promise<RemoveResult> {
  await requireAdmin();
  return respond(await assets.remove(key), { revalidate: '' });
}

/** Sets a file's default title, alt text or folder. */
export async function updateAsset(key: string, details: AssetDetails): Promise<UpdateAssetResult> {
  await requireAdmin();
  return respond(await assets.update(key, details), { revalidate: '' });
}

/** Every asset folder, by name. */
export async function listAssetFolders(): Promise<AssetFolder[]> {
  return assets.folders();
}

/** Creates or renames an asset folder. */
export async function saveAssetFolder(folder: { id?: string; name: string }): Promise<FolderResult> {
  await requireAdmin();
  return respond(await assets.saveFolder(folder), { revalidate: '' });
}

/** Deletes an asset folder; its files stay, in no folder. */
export async function removeAssetFolder(id: string): Promise<void> {
  await requireAdmin();
  return respond(await assets.removeFolder(id), { revalidate: '' });
}

/** Throws a 401 (or 403 for a cross-site call) unless an admin is signed in. */
async function requireAdmin(): Promise<void> {
  const event = getRequestEvent();
  if (!event) throw new Response('Sign in required', { status: 401 });
  await auth.require(event.request);
}
