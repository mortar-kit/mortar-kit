// <ClientScripts>: the scripts a page needs to hydrate (Solid's hydration
// bootstrap and the client entry), put in the document's <head>. On pages
// that `createRender` (@mortar-kit/core/render) renders without
// JavaScript it renders nothing, so the page ships no script at all.
//
// createRender passes the page's settings by request, not through a context
// provider: a provider exists only on the server, and would shift the
// hydration keys of everything inside it.
import { getRequestEvent, HydrationScript } from '@solidjs/web';
import { Show } from 'solid-js';

/** What `createRender` tells the document about the page being rendered. */
export interface RenderedPage {
  /** Whether this page hydrates. */
  hydrate: boolean;
  /** The request's CSP script nonce, if any. */
  nonce?: string;
}

const rendered = new WeakMap<Request, RenderedPage>();

/** Records how `request`'s page renders (createRender does, before rendering). */
export function setRenderedPage(request: Request, page: RenderedPage): void {
  rendered.set(request, page);
}

/** How the current request's page renders; null in the browser (only hydrating pages run there) or outside createRender. */
function renderedPage(): RenderedPage | null {
  const request = getRequestEvent()?.request;
  return (request && rendered.get(request)) || null;
}

/**
 * The hydration bootstrap and the client entry script, only on pages that
 * hydrate. Put it in the document's `<head>`. `src` is the client entry as
 * written in your source; the vite plugin rewrites it to the built file.
 *
 * @example
 * ```tsx
 * <head>
 *   <meta charset="utf-8" />
 *   <ClientScripts />
 * </head>
 * ```
 */
export function ClientScripts(props: { src?: string }) {
  const page = renderedPage();
  return (
    <Show when={page?.hydrate ?? true}>
      <HydrationScript />
      <script type="module" src={props.src ?? '/src/entry-client.tsx'} nonce={page?.nonce} async />
    </Show>
  );
}
