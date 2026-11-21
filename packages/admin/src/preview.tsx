// @mortar-kit/admin/preview: the preview iframe's side. Render <PreviewPage>
// on an app route (e.g. /admin/preview); it renders the real bricks with the
// site's own styles and shows whatever page the editor posts to it. Kept free
// of editor code so the route stays small.
import { PageView, type AnyBrick, type Page } from '@mortar-kit/core';
import { createStore, onSettled, reconcile } from 'solid-js';

import styles from './preview.module.css';
import { isHelloMessage, isPageMessage, type ReadyMessage } from './protocol.ts';

export interface PreviewPageProps {
  /** The same bricks the editor uses. */
  bricks: readonly AnyBrick[];
}

/** Renders the page the parent editor posts; empty until the first message. */
export function PreviewPage(props: PreviewPageProps) {
  const [state, setState] = createStore<{ page: Page }>({ page: { entries: [] } });

  onSettled(() => {
    const ready: ReadyMessage = { type: 'mortar:ready' };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      if (isHelloMessage(event.data)) window.parent.postMessage(ready, location.origin);
      if (!isPageMessage(event.data)) return;
      const page = event.data.page;
      setState((s) => {
        reconcile(page, 'id')(s.page);
      });
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage(ready, location.origin);
    return () => window.removeEventListener('message', onMessage);
  });

  return <PageView bricks={props.bricks} page={state.page} fallback={(entry) => <MissingBrick name={entry.brick} />} />;
}

/** Placeholder for an entry whose brick isn't defined. */
function MissingBrick(props: { name: string }) {
  return (
    <div role="note" class={styles.missing}>
      Unknown brick "{props.name}": it isn't defined, so the public site renders nothing here.
    </div>
  );
}

export type { HelloMessage, PageMessage, ReadyMessage } from './protocol.ts';
