// Islands: the interactive bricks on a page that is otherwise plain HTML
// (the contact form). Each brick is its own chunk (lazyBricks), so a page
// downloads only the bricks its islands use. Each island hydrates on its
// own; its form calls the same server function as on the router's pages
// (runBrickAction), in the background, so only that brick updates.
import { hydrateIslands, islandActions, lazyBricks } from '@mortar-kit/core';

import { brickActions } from './actions.ts';
import { runBrickAction } from './server/content.ts';

/** Hydrates every island on the page. */
export function start(): void {
  void hydrateIslands({
    bricks: lazyBricks(import.meta.glob('./bricks/*.tsx')),
    actions: islandActions({ action: brickActions.action, run: runBrickAction }),
  });
}
