// Page reads and saves for routes. Reads go through a router query, so a page
// is fetched once per request during SSR and reused on hydration.
import type { Page, SaveResult } from '@mortar-kit/core';
import { query } from '@solidjs/router';

import { loadStoredPage, saveStoredPage } from './server/pages.ts';

/** The stored page for a slug, or null. */
export const getPage = query(loadStoredPage, 'page');

/**
 * Saves a page from the editor, then drops the page's cached copy so the next
 * read (e.g. back/forward to the site or the editor) fetches what was saved.
 * The copy is dropped rather than revalidated: revalidating would refetch
 * into the open editor and replace its state, including anything typed while
 * the save was in flight.
 */
export async function saveEditedPage(slug: string, page: Page): Promise<SaveResult> {
  const result = await saveStoredPage(slug, page);
  if (result.ok) query.delete(getPage.keyFor(slug));
  return result;
}
