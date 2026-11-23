// The example's content on the server: the JSON-file store and the uploads
// folder behind Mortar's rules (createContent), and createContentServer,
// which src/server/content.ts exports as server functions. Writes need a
// signed-in admin (auth.require). Server-only.
//
// The server-function setup (src/server-functions-setup.ts) imports this
// module too, so createContentServer raises the request body limit to fit
// createContent's upload limit before any upload arrives.
import { createContent } from '@mortar-kit/core';
import { createContentServer, createJsonFileStore } from '@mortar-kit/core/server';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { auth } from './auth.ts';
import { blobs } from './blobs.ts';

// `content/<collection>/<slug>.json` and `uploads/<key>`, resolved against
// the working directory: run the server from examples/site. Asset details
// and folders are kept in `content/mortar-assets/library.json`.
export const content = createContent({ store: createJsonFileStore({ dir: 'content' }), blobs, collections, bricks });

export const server = createContentServer({ content, auth });
