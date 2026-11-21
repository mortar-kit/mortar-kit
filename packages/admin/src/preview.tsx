// @mortar-kit/admin/preview: the preview iframe's side. Render <PreviewPage>
// on an app route (e.g. /admin/preview); it renders the real bricks with the
// site's own styles and shows whatever document the editor posts to it.
// Kept free of editor code so the route stays small.
import { PageView, type AnyBrick, type Doc } from '@mortar-kit/core';
import { createStore, onSettled, reconcile, Show } from 'solid-js';

import styles from './preview.module.css';
import { isDocMessage, isHelloMessage, type ReadyMessage } from './protocol.ts';

export interface PreviewPageProps {
  /** The same bricks the editor uses. */
  bricks: readonly AnyBrick[];
}

/** Renders the body of the document the parent editor posts; empty until the first message. */
export function PreviewPage(props: PreviewPageProps) {
  const [state, setState] = createStore<{ collection: string; doc: Doc | null }>({ collection: '', doc: null });

  onSettled(() => {
    const ready: ReadyMessage = { type: 'mortar:ready' };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      if (isHelloMessage(event.data)) window.parent.postMessage(ready, location.origin);
      if (!isDocMessage(event.data)) return;
      const { collection, doc } = event.data;
      setState((s) => {
        if (s.doc && s.doc.id === doc.id && s.collection === collection) reconcile(doc, 'id')(s.doc);
        else {
          s.collection = collection;
          s.doc = doc;
        }
      });
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage(ready, location.origin);
    return () => window.removeEventListener('message', onMessage);
  });

  return (
    <Show when={state.doc}>
      {(doc) => <PageView bricks={props.bricks} entries={doc().entries ?? []} fallback={(entry) => <MissingBrick name={entry.brick} />} />}
    </Show>
  );
}

/** Placeholder for an entry whose brick isn't defined. */
function MissingBrick(props: { name: string }) {
  return (
    <div role="note" class={styles.missing}>
      Unknown brick "{props.name}": it isn't defined, so the public site renders nothing here.
    </div>
  );
}

export type { DocMessage, HelloMessage, ReadyMessage, RefreshMessage } from './protocol.ts';
