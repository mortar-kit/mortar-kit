// Document shell (see Root.tsx). <ClientScripts> adds the hydration
// bootstrap and the client entry on pages that hydrate, and nothing on the
// rest.
import { ClientScripts } from '@mortar-kit/core';
import type { ParentProps } from 'solid-js';

import { faviconHref } from './favicon.ts';

export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Mortar example</title>
        <link rel="icon" type="image/svg+xml" href={faviconHref} />
        <ClientScripts />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
