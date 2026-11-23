// Request middleware (`start.middleware`): the auth routes answer here,
// and /admin pages (the editor and its preview) need a signed-in admin,
// so signed-out visits go to /admin/sign-in. It fronts server-function
// calls too, but can't tell which are the admin's: the ones that write
// check for themselves (src/server/content.ts). It also serves uploaded
// files at /uploads/<key> from the blob store, with their types, nosniff
// and byte ranges (serveBlob). Everything else goes on to pages and
// server functions.
import { serveBlob } from '@mortar-kit/core';
import type { StartMiddleware } from '@solidjs/vite-plugin';

import { auth } from './server/auth.ts';
import { blobs } from './server/blobs.ts';

const UPLOADS = '/uploads/';

const middleware: StartMiddleware = async (event, next) => {
  const handled = await auth.handle(event.request);
  if (handled) return handled;
  const { method } = event.request;
  const path = new URL(event.request.url).pathname;
  if ((method === 'GET' || method === 'HEAD') && path.startsWith(UPLOADS)) {
    return serveBlob(blobs, path.slice(UPLOADS.length), event.request);
  }
  return next();
};

export default middleware;
