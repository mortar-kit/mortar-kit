'use server';
// Server functions for pages: the JSON-file store wrapped for the app. They
// live here, in the app, because the vite plugin compiles "use server" only
// outside node_modules. The client gets references to these functions, so
// node:fs never reaches the browser.
//
// No auth: anyone who can reach /admin can save. Guarding the admin routes
// (and this save function) is the app's job, e.g. in `start.middleware`.
import { loadPage, savePage, type Page, type SaveResult } from '@mortar-kit/core';
import { createJsonFileStore } from '@mortar-kit/core/server';
import { respond } from '@solidjs/web';

import { bricks } from '../bricks/index.ts';

// Resolved against the working directory: run the server from examples/site.
const store = createJsonFileStore({ dir: 'content/pages' });

/** The stored page for `slug`, normalized for rendering, or null if there is none. */
export async function loadStoredPage(slug: string): Promise<Page | null> {
  return (await loadPage(store, bricks, slug)) ?? null;
}

/** Validates and stores a page from the editor. */
export async function saveStoredPage(slug: string, page: Page): Promise<SaveResult> {
  // Revalidate nothing: refetching would replace the open editor's state
  // (and anything typed meanwhile). The client drops its cached copy
  // instead (saveEditedPage in src/pages.ts).
  return respond(await savePage(store, bricks, slug, page), { revalidate: '' });
}
