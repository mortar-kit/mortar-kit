// Document shell for start mode: the app arrives as children.
import { HydrationScript } from '@solidjs/web';
import type { ParentProps } from 'solid-js';

export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Mortar example</title>
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
