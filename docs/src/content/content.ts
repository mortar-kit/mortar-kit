// Where the docs site reads and writes content. On the server, pages render
// the published content (the baseline, in memory). In the browser the same
// rules (`createContent`) run over the session storage store, so the admin
// saves into this tab and every page shows those edits.
//
// Pages render the published content first (that is what the server sent,
// and hydration adopts it), then `showEdits()` swaps in this tab's edits:
// every read goes through `version`, so bumping it reads again.
import { createContent, createMemoryStore, type Content, type ContentSource } from '@mortar-kit/core';
import { isServer } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { baseline } from './baseline.ts';
import { createSessionStorageStore, type SessionStorageStore } from './session-store.ts';

const session: SessionStorageStore | undefined = isServer ? undefined : createSessionStorageStore({ baseline, key: 'mortar-docs:changes' });
const content = createContent({ store: session ?? createMemoryStore(baseline), collections, bricks });

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
    if (result.ok) setEdited(session?.hasChanges() ?? false);
    return result;
  },
};

/** Whether this tab has edits (false on the server and until `showEdits()`). */
export const hasEdits = edited;

/** After hydration: if this tab has edits, read everything again to show them. */
export function showEdits(): void {
  if (!session?.hasChanges()) return;
  setEdited(true);
  setVersion((v) => v + 1);
}

/** How many times the edits were reset: the admin starts afresh on each. */
export const resetCount = resets;

/** Forgets this tab's edits and reads everything again: the published site. */
export function resetEdits(): void {
  session?.clear();
  setEdited(false);
  setVersion((v) => v + 1);
  setResets((n) => n + 1);
}
