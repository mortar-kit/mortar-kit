// Document shell for start mode; the plugin adds the client entry script.
import { HydrationScript } from '@solidjs/web';
import type { ParentProps } from 'solid-js';
import { faviconHref } from './layouts/Logo.tsx';

export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Mortar</title>
        <link rel="icon" type="image/svg+xml" href={faviconHref} />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
