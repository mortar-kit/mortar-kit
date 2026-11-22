// Content reads and writes for the app. Reads are GET server functions
// (a POST would count as a mutation and revalidate every query). Routes
// read through router queries, so a document is fetched once per request
// during SSR and reused on hydration; the admin reads fresh, uncached.
import type { Content, ContentSource, Doc } from '@mortar-kit/core';
import { query } from '@solidjs/router';
import { GET } from '@solidjs/web/server-functions';

import {
  getStoredDoc,
  listAssetFolders,
  listAssets,
  listStoredDocs,
  moveStoredDoc,
  removeAsset,
  removeAssetFolder,
  removeStoredDoc,
  saveAssetFolder,
  saveStoredDoc,
  updateAsset,
  uploadAsset,
} from './server/content.ts';
import { getSignedInUser, getSignInMethods } from './server/session.ts';

const listFresh = GET(listStoredDocs);
const getFresh = GET(getStoredDoc);
const listAssetsFresh = GET(listAssets);
const listFoldersFresh = GET(listAssetFolders);

/** Documents of a collection (cached per request). */
export const listDocs = query(listFresh, 'docs');
/** One document, or null (cached per request). */
export const getDoc = query(getFresh, 'doc');

/** Cached reads, for routes, layouts and bricks. */
export const source: ContentSource = { list: listDocs, get: getDoc };

/** Uncached reads, for the admin and its preview: always what is saved now. */
export const freshSource: ContentSource = { list: listFresh, get: getFresh };

/**
 * Reads and writes for the admin. After a write, every cached read is
 * dropped (not revalidated, which would refetch into the open editor), so
 * the next visit to the site, or back/forward, shows what was saved.
 */
export const adminContent: Content = {
  ...freshSource,
  async save(collection, doc) {
    const result = await saveStoredDoc(collection, doc as Doc);
    if (result.ok) query.clear();
    return result;
  },
  async remove(collection, id) {
    const result = await removeStoredDoc(collection, id);
    if (result.ok) query.clear();
    return result;
  },
  async move(collection, id, index) {
    await moveStoredDoc(collection, id, index);
    query.clear();
  },
  assets: {
    list: listAssetsFresh,
    upload(file, details = {}) {
      // One FormData, which a server function sends natively (see uploadAsset).
      const form = new FormData();
      form.set('file', file);
      for (const [part, value] of Object.entries(details)) if (typeof value === 'string') form.set(part, value);
      return uploadAsset(form);
    },
    remove: removeAsset,
    update: updateAsset,
    folders: listFoldersFresh,
    saveFolder: saveAssetFolder,
    removeFolder: removeAssetFolder,
  },
};

/** The signed-in admin, or null (fresh: the admin shows who is signed in now). */
export const getUser = GET(getSignedInUser);

/** The sign-in page's methods (cached per request). */
export const getMethods = query(GET(getSignInMethods), 'sign-in-methods');
