// Request middleware (`start.middleware`). First the contact form's posts
// (src/server/contact.ts), then everything from createMiddleware:
// sign-in attempts are rate limited, the auth routes answer, /admin pages
// (the editor and its preview) need a signed-in admin, uploaded files are
// served at /uploads/<key> from the blob store, and pages get a
// Content-Security-Policy whose nonce the server entry puts on its
// scripts. It fronts server-function calls too, but can't tell which are
// the admin's: the ones that write check for themselves
// (src/server/content.ts).
import { createMiddleware, type Middleware } from '@mortar-kit/auth';

import { auth } from './server/auth.ts';
import { blobs } from './server/blobs.ts';
import { handleContact } from './server/contact.ts';

const mortar = createMiddleware({ auth, blobs });

const middleware: Middleware = async (event, next) => (await handleContact(event.request)) ?? mortar(event, next);

export default middleware;
