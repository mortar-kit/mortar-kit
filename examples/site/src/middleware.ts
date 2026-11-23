// Request middleware (`start.middleware`), from createMiddleware: sign-in
// attempts are rate limited, the auth routes answer, /admin pages (the
// editor and its preview) need a signed-in admin, uploaded files are
// served at /uploads/<key> from the blob store, and pages get a
// Content-Security-Policy whose nonce the server entry puts on its
// scripts. It fronts server-function calls too, but can't tell which are
// the admin's: the ones that write check for themselves
// (createContentServer in src/server/mortar.ts). Before it, /sitemap.xml is answered from the
// collections' `url` patterns.
import { createMiddleware, type Middleware } from '@mortar-kit/auth';
import { sitemap } from '@mortar-kit/core';

import { collections } from './collections.ts';
import { auth } from './server/auth.ts';
import { blobs } from './server/blobs.ts';
import { content } from './server/mortar.ts';

const mortar = createMiddleware({ auth, blobs });

const middleware: Middleware = async (event, next) => {
  const { method, url } = event.request;
  if (method === 'GET' && new URL(url).pathname === '/sitemap.xml') {
    const xml = await sitemap(content, collections, { origin: process.env.MORTAR_BASE_URL ?? url, extra: ['/posts'] });
    return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
  }
  return mortar(event, next);
};

export default middleware;
