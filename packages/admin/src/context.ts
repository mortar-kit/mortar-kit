// What <Admin> shares with its editor and the inputs inside it: the site's
// collections, the content they read (the reference picker lists
// documents), navigation to another document, and where the editor puts
// its outline (the admin's panel).
import type { AnyCollection, Content } from '@mortar-kit/core';
import { createContext, useContext } from 'solid-js';

/**
 * Which collection the admin shows, and which document of it is open (by
 * id); or, with `view: 'assets'`, the asset library (`collection` is then
 * where the rail goes back to).
 */
export interface AdminLocation {
  collection: string;
  id?: string;
  view?: 'assets';
}

/** What <Admin> provides to the inputs inside its editor (internal). */
export interface AdminApi {
  collections: readonly AnyCollection[];
  content: Content;
  /** Opens another collection or document (asking first if there are unsaved changes). */
  go(to: AdminLocation): void;
  /** The admin panel's slot for the open editor's outline (slug, Details, body entries); unset until it mounts. */
  outline(): HTMLElement | undefined;
  /** Shows the open collection's document list in the panel (the editor stays open). */
  showList(): void;
}

export const AdminContext = createContext<AdminApi | null>(null);

/** The admin around this component, or null in a standalone editor. */
export function useAdmin(): AdminApi | null {
  return useContext(AdminContext);
}
