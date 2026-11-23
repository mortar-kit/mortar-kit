// Islands: the interactive bricks on a page that is otherwise plain HTML
// (the contact form). Each hydrates on its own; its form calls the same
// server function as on the router's pages (runBrickAction), in the
// background, so only that brick updates.
import { hydrateIslands, islandActions } from '@mortar-kit/core';

import { brickActions } from './actions.ts';
import { bricks } from './bricks/index.ts';
import { runBrickAction } from './server/content.ts';

/** Hydrates every island on the page. */
export function start(): void {
  hydrateIslands({ bricks, actions: islandActions({ action: brickActions.action, run: runBrickAction }) });
}
