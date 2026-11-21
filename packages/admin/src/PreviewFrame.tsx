// The editor's side of the live preview: an iframe on the same origin that
// loads the app's preview route. When the preview reports ready, and after
// every change, the whole page is posted to it. Either side may load first:
// the preview announces itself when it mounts, and the editor says hello
// once it is listening, which the preview answers.
import type { Page } from '@mortar-kit/core';
import { createEffect, createSignal, deep, onSettled, snapshot } from 'solid-js';

import { isReadyMessage, type HelloMessage, type PageMessage } from './protocol.ts';

export interface PreviewFrameProps {
  /** URL of the app route that renders `<PreviewPage>`. */
  url: string;
  page: Page;
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
    () => (handshakes() > 0 ? deep(props.page) : undefined),
    (page) => {
      if (!page) return;
      const message: PageMessage = { type: 'mortar:page', page: snapshot(page) };
      frame?.contentWindow?.postMessage(message, location.origin);
    },
  );

  return <iframe ref={(el) => (frame = el)} class="mortar-preview" src={props.url} title="Page preview" />;
}
