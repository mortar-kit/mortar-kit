// Admin: the Mortar editor for the home page, saving through the app's
// server functions. Leaving with unsaved changes asks first: the editor
// guards closing the tab, and this route guards router navigation (links,
// back/forward). Unprotected: guard /admin in your own app.
import { Editor } from '@mortar-kit/admin';
import type { Doc } from '@mortar-kit/core';
import { useBeforeLeave, type BeforeLeaveEventArgs } from '@solidjs/router';
import { createMemo, createSignal } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { pages } from '../collections.ts';
import { adminContent } from '../content.ts';

export default function Admin() {
  const page = createMemo(() => adminContent.get('pages', { slug: 'home' }));
  const [dirty, setDirty] = createSignal(false);
  // The save in flight, if any. Not reactive state: only the guard reads it.
  let saving: Promise<unknown> | undefined;
  // The navigation waiting for the leave confirm, if one is scheduled.
  let leaving: BeforeLeaveEventArgs | undefined;

  const save = (next: Doc) => {
    const pending = adminContent.save('pages', next);
    saving = pending;
    const done = () => {
      if (saving === pending) saving = undefined;
    };
    pending.then(done, done);
    return pending;
  };

  useBeforeLeave((e) => {
    if (e.defaultPrevented) return;
    if (saving) {
      // Let the save finish first: the next page then reads what was saved
      // (adminContent drops cached reads), and the guard runs again
      // with the result, asking only if changes are still unsaved.
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
      if (target && window.confirm('Leave the editor? Your unsaved changes will be lost.')) target.retry(true);
    }, 100);
  });

  return (
    <Editor
      bricks={bricks}
      collection={pages}
      doc={page() ?? { id: 'home', slug: 'home', fields: {}, entries: [] }}
      isNew={page() === null}
      previewUrl="/admin/preview"
      onSave={save}
      onDirtyChange={setDirty}
    />
  );
}
