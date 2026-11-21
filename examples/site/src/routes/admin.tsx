// Admin: the Mortar editor for the home page, saving through the app's
// server function. Leaving with unsaved changes asks first: the editor
// guards closing the tab, and this route guards router navigation (links,
// back/forward). Unprotected: guard /admin in your own app.
import { Editor } from '@mortar-kit/admin';
import type { Page } from '@mortar-kit/core';
import { useBeforeLeave } from '@solidjs/router';
import { createMemo, createSignal } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { getPage, saveEditedPage } from '../pages.ts';

export default function Admin() {
  const page = createMemo(() => getPage('home'));
  const [dirty, setDirty] = createSignal(false);
  // The save in flight, if any. Not reactive state: only the guard reads it.
  let saving: Promise<unknown> | undefined;

  const save = (next: Page) => {
    const pending = saveEditedPage('home', next);
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
      // (saveEditedPage drops the cached copy), and the guard runs again
      // with the result, asking only if changes are still unsaved.
      e.preventDefault();
      const retry = () => e.retry();
      saving.then(retry, retry);
      return;
    }
    if (!dirty()) return;
    e.preventDefault();
    // Confirm after the router finishes handling this navigation, as its docs show.
    setTimeout(() => {
      if (window.confirm('Leave the editor? Your unsaved changes will be lost.')) e.retry(true);
    }, 100);
  });

  return (
    <Editor
      bricks={bricks}
      page={page() ?? { entries: [] }}
      previewUrl="/admin/preview"
      onSave={save}
      onDirtyChange={setDirty}
    />
  );
}
