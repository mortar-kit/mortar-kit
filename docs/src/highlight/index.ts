// Where the docs get syntax highlighting. The server has Shiki from the
// start, so every page's HTML arrives highlighted. The browser doesn't ship
// it in the page bundle: hydration keeps the server's HTML as it is, and
// Shiki is fetched as its own chunk once the page has settled
// (`loadHighlighter`, from App.tsx). Code rendered on the client (this tab's
// edits, client-side navigation, the admin preview) reads `highlighter()`:
// plain until the chunk lands, then highlighted, since the read is reactive.
import { createSignal } from 'solid-js';

import type { highlight } from './shiki.ts';

/** Highlights code for a `<code>` element; see shiki.ts. */
export type Highlight = typeof highlight;

// The server build imports Shiki now; the client build drops this branch,
// and with it Shiki, from the page bundle.
const server: Highlight | undefined = import.meta.env.SSR ? (await import('./shiki.ts')).highlight : undefined;

// Held in an object: a function passed to createSignal would be a compute.
const [loaded, setLoaded] = createSignal<{ highlight?: Highlight }>({ highlight: server });
let loading: Promise<void> | undefined;

/** The highlighter, once loaded (always, on the server). Reactive. */
export function highlighter(): Highlight | undefined {
  return loaded().highlight;
}

/** Loads the highlighter in the browser; safe to call more than once. */
export function loadHighlighter(): Promise<void> {
  loading ??= import('./shiki.ts').then((shiki) => {
    setLoaded({ highlight: shiki.highlight });
  });
  return loading;
}
