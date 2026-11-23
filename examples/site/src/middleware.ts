// Request middleware (`start.middleware`), all from createMiddleware:
// sign-in attempts are rate limited, the auth routes answer, /admin pages
// (the editor and its preview) need a signed-in admin, uploaded files are
// served at /uploads/<key> from the blob store, and pages get a
// Content-Security-Policy whose nonce the server entry puts on its
// scripts. It fronts server-function calls too, but can't tell which are
// the admin's: the ones that write check for themselves
// (src/server/content.ts).
import { createMiddleware } from '@mortar-kit/auth';

import { auth } from './server/auth.ts';
import { blobs } from './server/blobs.ts';

export default createMiddleware({ auth, blobs });
