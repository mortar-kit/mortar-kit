// What <Admin> shares with the inputs inside its editor: the site's
// collections, the content they read (the reference picker lists
// documents), and navigation to another document.
import type { AnyCollection, Content } from '@mortar-kit/core';
import { createContext, useContext } from 'solid-js';

/** Which collection the admin shows, and which document of it is open (by id). */
export interface AdminLocation {
  collection: string;
  id?: string;
}

/** What <Admin> provides to the inputs inside its editor (internal). */
export interface AdminApi {
  collections: readonly AnyCollection[];
  content: Content;
  /** Opens another collection or document (asking first if there are unsaved changes). */
  go(to: AdminLocation): void;
}

export const AdminContext = createContext<AdminApi | null>(null);

/** The admin around this component, or null in a standalone editor. */
export function useAdmin(): AdminApi | null {
  return useContext(AdminContext);
}
