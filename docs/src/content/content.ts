// Where the docs site reads and writes content. On the server, pages render
// the published content (the baseline, in memory). In the browser the same
// rules (`createContent`) run over the session storage store, so the admin
// saves into this tab and every page shows those edits.
//
// Pages render the published content first (that is what the server sent,
// and hydration adopts it), then `showEdits()` swaps in this tab's edits:
// every read goes through `version`, so bumping it reads again.
//
// Uploads work the same way: a session storage blob store in the browser
// (an empty one in memory on the server, so the admin renders alike on
// both), small files only, forgotten with the edits.
import { createContent, createMemoryBlobStore, createMemoryStore, type Assets, type Content, type ContentSource } from '@mortar-kit/core';
import { isServer } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { baseline } from './baseline.ts';
import { createSessionStorageBlobStore, type SessionStorageBlobStore } from './session-blob-store.ts';
import { createSessionStorageStore, type SessionStorageStore } from './session-store.ts';

const session: SessionStorageStore | undefined = isServer ? undefined : createSessionStorageStore({ baseline, key: 'mortar-docs:changes' });
const files: SessionStorageBlobStore | undefined = isServer ? undefined : createSessionStorageBlobStore({ key: 'mortar-docs:files' });
const content = createContent({
  store: session ?? createMemoryStore(baseline),
  blobs: files ?? createMemoryBlobStore(),
  // Session storage holds a few megabytes, and files are kept as base64.
  maxAssetSize: 1024 * 1024,
  collections,
  bricks,
});
const assets = content.assets as Assets;

const [version, setVersion] = createSignal(0);
const [edited, setEdited] = createSignal(false);
const [resets, setResets] = createSignal(0);

/** Reads for pages, bricks and the preview. Reading again after `showEdits()` and `resetEdits()`. */
export const source: ContentSource = {
  list(collection, options) {
    version();
    return content.list(collection, options);
  },
  get(collection, ref) {
    version();
    return content.get(collection, ref);
  },
  track() {
    version();
  },
};

/**
 * Reads and writes for the admin. Saving doesn't bump `version` (that
 * would reload the open editor); the admin refreshes what it shows itself.
 */
export const editableContent: Content = {
  ...source,
  async save(collection, doc) {
    const result = await content.save(collection, doc);
    if (result.ok) setEdited(true);
    return result;
  },
  async remove(collection, id) {
    const result = await content.remove(collection, id);
    if (result.ok) setEdited(hasAnything());
    return result;
  },
  async move(collection, id, index) {
    await content.move(collection, id, index);
    setEdited(true);
  },
  assets: {
    list() {
      version();
      return assets.list();
    },
    async upload(file) {
      const result = await assets.upload(file);
      if (result.ok) setEdited(true);
      return result;
    },
    async remove(key) {
      const result = await assets.remove(key);
      if (result.ok) setEdited(hasAnything());
      return result;
    },
  },
};

/** Whether this tab has saved edits or uploads. */
function hasAnything(): boolean {
  return (session?.hasChanges() ?? false) || (files?.hasFiles() ?? false);
}

/** Whether this tab has edits (false on the server and until `showEdits()`). */
export const hasEdits = edited;

/** After hydration: if this tab has edits, read everything again to show them. */
export function showEdits(): void {
  if (!hasAnything()) return;
  setEdited(true);
  setVersion((v) => v + 1);
}

/** How many times the edits were reset: the admin starts afresh on each. */
export const resetCount = resets;

/** Forgets this tab's edits and uploads and reads everything again: the published site. */
export function resetEdits(): void {
  session?.clear();
  files?.clear();
  setEdited(false);
  setVersion((v) => v + 1);
  setResets((n) => n + 1);
}
