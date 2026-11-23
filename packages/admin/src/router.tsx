// @mortar-kit/admin/router: <AdminRoute>, the admin as a @solidjs/router
// route. It keeps where the admin is in the URL (?collection=&id=, or
// ?view=assets), so documents can be linked and back/forward moves between
// them, and guards router navigation while a document has unsaved changes
// (the editor itself guards closing the tab). A separate entry so
// <Admin> stays router-free.
import type { Content } from '@mortar-kit/core';
import { useBeforeLeave, useLocation, useSearchParams, type BeforeLeaveEventArgs } from '@solidjs/router';
import { createMemo, createSignal } from 'solid-js';

import { Admin, type AdminProps } from './Admin.tsx';
import type { AdminLocation } from './context.ts';

/** `<Admin>`'s props, less what the route provides (the location and the leave guard). */
export type AdminRouteProps = Omit<AdminProps, 'location' | 'onNavigate' | 'onDirtyChange'> & {
  /** Asks before leaving unsaved changes; return true to leave. Default `window.confirm`. */
  confirmLeave?: (question: string) => boolean;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * `<Admin>` as a route of a @solidjs/router app: its location lives in the
 * URL's search parameters, and leaving a document with unsaved changes
 * (a link, back/forward, switching documents) asks first. A save still in
 * flight is waited for before leaving, so the next page reads what was saved.
 *
 * @example
 * ```tsx
 * // src/routes/admin.tsx, routed at /admin
 * export default function AdminPage() {
 *   return <AdminRoute bricks={bricks} collections={collections} content={adminContent} previewUrl="/admin/preview" />;
 * }
 * ```
 */
export function AdminRoute(props: AdminRouteProps) {
  const [params, setParams] = useSearchParams();
  const here = useLocation();
  const [dirty, setDirty] = createSignal(false);
  // The save in flight, if any. Not reactive state: only the guard reads it.
  let saving: Promise<unknown> | undefined;
  // The navigation waiting for the leave confirm, if one is scheduled.
  let leaving: BeforeLeaveEventArgs | undefined;

  const content = createMemo((): Content => ({
    ...props.content,
    save(collection, doc) {
      const pending = props.content.save(collection, doc);
      saving = pending;
      const done = () => {
        if (saving === pending) saving = undefined;
      };
      pending.then(done, done);
      return pending;
    },
  }));

  useBeforeLeave((e) => {
    if (e.defaultPrevented) return;
    if (saving) {
      // Let the save finish first, then ask again with its result: only
      // changes still unsaved need a confirm.
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
      // Another document of the admin (same route, other search parameters), or away from it.
      const inAdmin = typeof target.to === 'string' && new URL(target.to, 'http://x').pathname === here.pathname;
      const question = inAdmin ? 'Discard your unsaved changes to this document?' : 'Leave the editor? Your unsaved changes will be lost.';
      if ((props.confirmLeave ?? ((q) => window.confirm(q)))(question)) target.retry(true);
    }, 100);
  });

  const where = (): AdminLocation => ({
    collection: one(params.collection) ?? props.collections[0]?.name ?? '',
    id: one(params.id),
    view: one(params.view) === 'assets' ? 'assets' : undefined,
  });

  return (
    <Admin
      bricks={props.bricks}
      collections={props.collections}
      content={content()}
      previewUrl={props.previewUrl}
      resolveLink={props.resolveLink}
      user={props.user}
      signOutUrl={props.signOutUrl}
      location={where()}
      onNavigate={(to) => setParams({ collection: to.collection, id: to.id ?? null, view: to.view ?? null })}
      onDirtyChange={setDirty}
    />
  );
}
