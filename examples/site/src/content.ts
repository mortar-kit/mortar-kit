// Content reads and writes for the app, over the server functions in
// src/server/content.ts (contentClient). Reads are GET server functions
// (a POST would count as a mutation and revalidate every query). Routes
// read through router queries, so a document is fetched once per request
// during SSR and reused on hydration; the admin reads fresh, and after a
// write every cached read is dropped (not revalidated, which would refetch
// into the open editor).
import { contentClient } from '@mortar-kit/core';
import { query } from '@solidjs/router';
import { GET } from '@solidjs/web/server-functions';

import * as server from './server/content.ts';
import { getSignedInUser, getSignInMethods } from './server/session.ts';

export const { source, freshSource, content: adminContent } = contentClient(server, { read: GET, cache: query, onWrite: () => query.clear() });

/** The signed-in admin, or null (fresh: the admin shows who is signed in now). */
export const getUser = GET(getSignedInUser);

/** The sign-in page's methods (cached per request). */
export const getMethods = query(GET(getSignInMethods), 'sign-in-methods');
