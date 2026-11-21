/// <reference types="@solidjs/vite-plugin/virtual-modules" />
// Server entry: renders each request. It replaces the plugin's generated
// entry so that pages which don't hydrate (src/client.ts) are sent without
// any JavaScript:
// - `<NoHydration>`: no hydration keys, and lazy() chunks aren't preloaded;
// - `noScripts`: no hydration data or streaming scripts;
// - `stylesOnly`: the client entry's imports aren't preloaded either;
// - the Document leaves out the bootstrap and the client entry script.
// Such pages are also always sent as one settled document: streamed
// content needs a script to swap it in.
import type { StartServerRenderContext } from '@solidjs/vite-plugin';
import { renderToStream } from '@solidjs/web';
import { NoHydration } from 'solid-js';
import manifest from 'virtual:solid-manifest';

import { hydrates } from './client.ts';
import { Root } from './Root.tsx';
import { stylesOnly } from './styles-only.ts';

const staticManifest = stylesOnly(manifest);

export function render(request: Request, context: StartServerRenderContext) {
  const hydrate = hydrates(new URL(request.url).pathname);
  const nonce = typeof context.nonce === 'string' ? context.nonce : context.nonce?.script || undefined;
  const stream = renderToStream(
    () =>
      hydrate ? (
        <Root hydrate nonce={nonce} />
      ) : (
        <NoHydration>
          <Root hydrate={false} />
        </NoHydration>
      ),
    {
      manifest: hydrate ? manifest : staticManifest,
      nonce: context.nonce ?? undefined,
      signal: request.signal,
      noScripts: !hydrate,
    },
  );
  // A plain promise: the plugin waits for it whatever the render mode.
  return hydrate ? stream : stream.then((html) => html);
}
