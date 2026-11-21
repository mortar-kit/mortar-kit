'use server';
// Server functions for content: the JSON-file store, behind Mortar's rules
// (createContent), wrapped for the app. They live here, in the app, because
// the vite plugin compiles "use server" only outside node_modules. The
// client gets references to these functions, so node:fs never reaches the
// browser.
//
// No auth: anyone who can reach /admin can save and delete. Guarding the
// admin routes (and these functions) is the app's job, e.g. in
// `start.middleware`.
import { createContent, type Doc, type DocRef, type DocSummary, type ListOptions, type RemoveResult, type SaveResult } from '@mortar-kit/core';
import { createJsonFileStore } from '@mortar-kit/core/server';
import { respond } from '@solidjs/web';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';

// `content/<collection>/<slug>.json`, resolved against the working directory: run the server from examples/site.
const content = createContent({ store: createJsonFileStore({ dir: 'content' }), collections, bricks });

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
  // Revalidate nothing: refetching would replace the open editor's state
  // (and anything typed meanwhile). The client drops its cached reads
  // instead (adminContent in src/content.ts).
  return respond(await content.save(collection, doc), { revalidate: '' });
}

/** Deletes a document, unless others reference it. */
export async function removeStoredDoc(collection: string, id: string): Promise<RemoveResult> {
  return respond(await content.remove(collection, id), { revalidate: '' });
}
