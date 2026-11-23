// Client entry, loaded by the pages that need JavaScript (see
// src/entry-server.tsx): the admin hydrates as a whole; a public page
// loads it only when it shows an interactive brick, and then hydrates just
// those bricks (src/islands.ts). Each side is its own chunk, so a page with
// islands doesn't download the admin.
import { hasIslands } from '@mortar-kit/core';
import { hydrate } from '@solidjs/web';

if (hasIslands()) {
  void import('./islands.ts').then((islands) => islands.start());
} else {
  void import('./Root.tsx').then(({ Root }) => hydrate(() => <Root />, document));
}
