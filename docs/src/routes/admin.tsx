// The admin, saving into this tab's session storage (see
// content/session-store.ts): anyone can edit the docs site and see their
// edits across it, and no one else does. Where it is lives in the URL
// (?collection=&id=, or ?view=assets), so guides can link to "Edit this page". A reset
// (the bar above it) starts it afresh.
import { Admin, type AdminLocation } from '@mortar-kit/admin';
import { useBeforeLeave, useSearchParams } from '@solidjs/router';
import { createSignal, For } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { editableContent, resetCount } from '../content/content.ts';
import { EditsBar } from '../layouts/EditsBar.tsx';
import styles from '../layouts/layouts.module.css';

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function AdminRoute() {
  const [params, setParams] = useSearchParams();
  const [dirty, setDirty] = createSignal(false);

  // Saves land in session storage at once, so only unsaved changes need a guard.
  useBeforeLeave((e) => {
    if (e.defaultPrevented || !dirty()) return;
    e.preventDefault();
    setTimeout(() => {
      const inAdmin = typeof e.to === 'string' && e.to.startsWith('/admin');
      if (window.confirm(inAdmin ? 'Discard your unsaved changes to this document?' : 'Leave the editor? Your unsaved changes will be lost.')) e.retry(true);
    }, 100);
  });

  const location = (): AdminLocation => ({
    collection: one(params.collection) ?? collections[0].name,
    id: one(params.id),
    view: one(params.view) === 'assets' ? 'assets' : undefined,
  });

  return (
    <div class={styles.admin}>
      <div class={styles.adminBar}>
        <a href="/">← Back to the site</a>
        <span>Your edits are saved in this tab only.</span>
      </div>
      <EditsBar />
      <div class={styles.adminBody}>
        <For each={[resetCount()]}>
          {() => (
            <Admin
              bricks={bricks}
              collections={collections}
              content={editableContent}
              previewUrl="/admin/preview"
              location={location()}
              onNavigate={(to) => setParams({ collection: to.collection, id: to.id ?? null, view: to.view ?? null })}
              onDirtyChange={setDirty}
            />
          )}
        </For>
      </div>
    </div>
  );
}
