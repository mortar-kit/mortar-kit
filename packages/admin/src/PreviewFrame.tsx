// The editor's side of the live preview: an iframe on the same origin that
// loads the app's preview route. When the preview reports ready, and after
// every change, the whole document is posted to it. Either side may load first:
// the preview announces itself when it mounts, and the editor says hello
// once it is listening, which the preview answers. After a save the
// preview is told to refresh, so bricks that load data load again.
import type { Doc } from '@mortar-kit/core';
import { createEffect, createSignal, deep, onSettled, snapshot } from 'solid-js';

import styles from './PreviewFrame.module.css';
import { isReadyMessage, type DocMessage, type HelloMessage, type RefreshMessage } from './protocol.ts';

export interface PreviewFrameProps {
  /** URL of the app route that renders `<PreviewPage>`. */
  url: string;
  /** The edited document's collection, by name. */
  collection: string;
  /** Whether that collection has a body. Without one, the preview ignores stored entries, as the site does. */
  body: boolean;
  doc: Doc;
  /** Bump it after saved content changes (a save, a delete): the preview reloads what bricks loaded. */
  refresh?: number;
}

export function PreviewFrame(props: PreviewFrameProps) {
  let frame: HTMLIFrameElement | undefined;
  // Counts ready handshakes so a reloaded preview (e.g. after HMR) gets the page again.
  const [handshakes, setHandshakes] = createSignal(0);

  onSettled(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
      if (isReadyMessage(event.data)) setHandshakes((n) => n + 1);
    };
    window.addEventListener('message', onMessage);
    const hello: HelloMessage = { type: 'mortar:hello' };
    frame?.contentWindow?.postMessage(hello, location.origin);
    return () => window.removeEventListener('message', onMessage);
  });

  createEffect(
    () => (handshakes() > 0 ? deep(props.doc) : undefined),
    (doc) => {
      if (!doc) return;
      const message: DocMessage = { type: 'mortar:doc', collection: props.collection, body: props.body, doc: snapshot(doc) };
      frame?.contentWindow?.postMessage(message, location.origin);
    },
  );

  createEffect(
    () => props.refresh,
    () => {
      const message: RefreshMessage = { type: 'mortar:refresh' };
      frame?.contentWindow?.postMessage(message, location.origin);
    },
    { defer: true },
  );

  return <iframe ref={(el) => (frame = el)} class={styles.preview} src={props.url} title="Page preview" />;
}
