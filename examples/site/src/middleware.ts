// Request middleware (`start.middleware`), from createMiddleware: sign-in
// attempts are rate limited, the auth routes answer, /admin pages (the
// editor and its preview) need a signed-in admin, /sitemap.xml (from the
// collections' `url` patterns) and /robots.txt answer, uploaded files are
// served at /uploads/<key> from the blob store, and pages get a
// Content-Security-Policy (not on the dev server) whose nonce the server
// entry puts on its scripts, plus security headers. It fronts
// server-function calls too, but can't tell which are the admin's: the
// ones that write check for themselves (createContentServer in
// src/server/mortar.ts).
import { createMiddleware } from '@mortar-kit/auth';

import { collections } from './collections.ts';
import { auth } from './server/auth.ts';
import { blobs } from './server/blobs.ts';
import { content } from './server/mortar.ts';

export default createMiddleware({
  auth,
  blobs,
  sitemap: { content, collections, origin: process.env.MORTAR_BASE_URL, extra: ['/posts'] },
  robots: true,
});
