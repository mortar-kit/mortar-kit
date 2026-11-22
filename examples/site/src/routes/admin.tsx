// Admin: the Mortar admin for every collection, saving through the app's
// server functions. Where it is lives in the URL (?collection=&id=), so
// documents can be linked and back/forward moves between them. Leaving a
// document with unsaved changes asks first: the editor guards closing the
// tab, and this route guards router navigation (links, back/forward, and
// switching documents, which changes the URL). Unprotected: guard /admin
// in your own app.
import { Admin, type AdminLocation } from '@mortar-kit/admin';
import type { Content } from '@mortar-kit/core';
import { useBeforeLeave, useSearchParams, type BeforeLeaveEventArgs } from '@solidjs/router';
import { createSignal } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { adminContent } from '../content.ts';

/** The document a URL of this site shows (see router.ts), so ⌘/Ctrl-clicking a link in the preview opens it. */
function resolveLink(url: URL): { collection: string; slug: string } | undefined {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { collection: 'pages', slug: 'home' };
  if (parts.length === 1 && parts[0] !== 'posts' && parts[0] !== 'admin') return { collection: 'pages', slug: parts[0]! };
  const byPrefix: Record<string, string> = { posts: 'posts', products: 'products', categories: 'categories' };
  if (parts.length === 2 && byPrefix[parts[0]!]) return { collection: byPrefix[parts[0]!]!, slug: parts[1]! };
  return undefined;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function AdminRoute() {
  const [params, setParams] = useSearchParams();
  const [dirty, setDirty] = createSignal(false);
  // The save in flight, if any. Not reactive state: only the guard reads it.
  let saving: Promise<unknown> | undefined;
  // The navigation waiting for the leave confirm, if one is scheduled.
  let leaving: BeforeLeaveEventArgs | undefined;

  const content: Content = {
    ...adminContent,
    save(collection, doc) {
      const pending = adminContent.save(collection, doc);
      saving = pending;
      const done = () => {
        if (saving === pending) saving = undefined;
      };
      pending.then(done, done);
      return pending;
    },
  };

  useBeforeLeave((e) => {
    if (e.defaultPrevented) return;
    if (saving) {
      // Let the save finish first: the next page then reads what was saved
      // (adminContent drops cached reads), and the guard runs again with
      // the result, asking only if changes are still unsaved.
      e.preventDefault();
      const retry = () => e.retry();
      saving.then(retry, retry);
      return;
    }
    if (!dirty()) return;
    e.preventDefault();
    // One confirm for a burst of navigations: a second one before the
    // dialog opens only replaces where to go, and the latest wins.
    const scheduled = leaving !== undefined;
    leaving = e;
    if (scheduled) return;
    // Confirm after the router finishes handling this navigation, as its docs show.
    setTimeout(() => {
      const target = leaving;
      leaving = undefined;
      if (!target) return;
      // A save that finished meanwhile may have left nothing unsaved.
      if (!dirty()) {
        target.retry(true);
        return;
      }
      const inAdmin = typeof target.to === 'string' && target.to.startsWith('/admin');
      const question = inAdmin ? 'Discard your unsaved changes to this document?' : 'Leave the editor? Your unsaved changes will be lost.';
      if (window.confirm(question)) target.retry(true);
    }, 100);
  });

  const location = (): AdminLocation => ({ collection: one(params.collection) ?? collections[0].name, id: one(params.id) });

  return (
    <Admin
      bricks={bricks}
      collections={collections}
      content={content}
      previewUrl="/admin/preview"
      location={location()}
      onNavigate={(to) => setParams({ collection: to.collection, id: to.id ?? null })}
      onDirtyChange={setDirty}
      resolveLink={resolveLink}
    />
  );
}
