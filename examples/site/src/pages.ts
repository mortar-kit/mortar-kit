// Page reads for routes: the server function wrapped in a router query, so a
// page is fetched once per request during SSR and reused on hydration.
import { query } from '@solidjs/router';

import { loadStoredPage } from './server/pages.ts';

/** The stored page for a slug, or null. */
export const getPage = query(loadStoredPage, 'page');
