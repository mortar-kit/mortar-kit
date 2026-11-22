// Request middleware (start.middleware): serves uploaded files at
// /uploads/<key> from the blob store, with their types, nosniff and byte
// ranges (serveBlob). Everything else goes on to pages and server
// functions. This is also where an app would guard /admin.
import { serveBlob } from '@mortar-kit/core';
import type { StartMiddleware } from '@solidjs/vite-plugin';

import { blobs } from './server/blobs.ts';

const UPLOADS = '/uploads/';

const middleware: StartMiddleware = (event, next) => {
  const { method } = event.request;
  const path = new URL(event.request.url).pathname;
  if ((method === 'GET' || method === 'HEAD') && path.startsWith(UPLOADS)) {
    return serveBlob(blobs, path.slice(UPLOADS.length), event.request);
  }
  return next();
};

export default middleware;
