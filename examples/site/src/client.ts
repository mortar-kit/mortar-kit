// Which pages run JavaScript in the browser. The editor and its preview
// hydrate as a whole; public pages are plain server-rendered HTML with no
// scripts at all.
//
// Islands (hydrating single bricks on an otherwise static page) will need
// more than this yes/no: the static page stays under <NoHydration> with each
// interactive brick inside <Hydration id={entry.id}>, the page data (not the
// path) decides which islands render, island pages keep their hydration
// data and their islands' chunks (so no `noScripts`/`stylesOnly` there), and
// a separate client entry hydrates each island root. This function stays
// the switch for whole-document hydration.

/** Whether the page at `pathname` loads the client entry and hydrates. */
export function hydrates(pathname: string): boolean {
  // The router matches paths case-insensitively, so this must too.
  const path = pathname.toLowerCase();
  return path === '/admin' || path.startsWith('/admin/');
}
