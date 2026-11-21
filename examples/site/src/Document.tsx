// Document shell (see Root.tsx). Pages that hydrate get the hydration
// bootstrap and the client entry script; the rest get neither.
import { HydrationScript } from '@solidjs/web';
import { Show, type ParentProps } from 'solid-js';

/**
 * @param props.hydrate Whether this page loads the client entry.
 * @param props.nonce The request's CSP script nonce, if any (server only).
 */
export default function Document(props: ParentProps<{ hydrate: boolean; nonce?: string }>) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Mortar example</title>
        <Show when={props.hydrate}>
          <HydrationScript />
          {/* The plugin rewrites this path to the built entry's URL. */}
          <script type="module" src="/src/entry-client.tsx" nonce={props.nonce} async />
        </Show>
      </head>
      <body>{props.children}</body>
    </html>
  );
}
