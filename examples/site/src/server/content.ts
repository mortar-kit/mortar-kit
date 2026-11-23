'use server';
// Server functions for content, from createContentServer (src/server/mortar.ts):
// reads are public (the site renders from them), writes need a signed-in
// admin. They live here, in the app, because the vite plugin compiles
// "use server" only outside node_modules; the client gets references, so
// node:fs never reaches the browser. src/content.ts wraps them. Brick
// forms (runBrickAction) are public too, but limited per client.
import type { EntryRef } from '@mortar-kit/core';
import { getRequestEvent, respond } from '@solidjs/web';

import { actionContext, overLimit } from './mail.ts';
import { content, server } from './mortar.ts';

export const list = server.list;
export const get = server.get;
export const save = server.save;
export const remove = server.remove;
export const move = server.move;
export const listAssets = server.listAssets;
export const uploadAsset = server.uploadAsset;
export const removeAsset = server.removeAsset;
export const updateAsset = server.updateAsset;
export const listAssetFolders = server.listAssetFolders;
export const saveAssetFolder = server.saveAssetFolder;
export const removeAssetFolder = server.removeAssetFolder;

/**
 * Runs a brick's action with its posted form (src/actions.ts): Mortar
 * reads the entry's stored data and calls the brick's `action`. Public,
 * like the site's forms, but limited per client. Nothing to revalidate:
 * the brick shows the result.
 */
export async function runBrickAction(ref: EntryRef, form: FormData | URLSearchParams): Promise<unknown> {
  const request = getRequestEvent()?.request;
  if (overLimit(request)) throw new Error('Too many form posts. Try again in a few minutes.');
  try {
    return respond(await content.runAction(ref, form, { request, context: actionContext }), { revalidate: '' });
  } catch (error) {
    console.error('Brick action failed:', error);
    throw error;
  }
}
