// <ClientScripts>: the scripts a page needs to hydrate (Solid's hydration
// bootstrap and the client entry), put in the document's <head>. On pages
// that `createRender` (@mortar-kit/core/render) renders without
// JavaScript it renders nothing, so the page ships no script at all.
//
// createRender passes the page's settings by request, not through a context
// provider: a provider exists only on the server, and would shift the
// hydration keys of everything inside it. `useRenderedPage` hands the same
// settings to the app (its own scripts' nonce, whether the page hydrates).
import { getRequestEvent, HydrationScript } from '@solidjs/web';
import { Show } from 'solid-js';

/** What `createRender` tells the document about the page being rendered. */
export interface RenderedPage {
  /** Whether this page hydrates (loads the app's JavaScript). */
  hydrate: boolean;
  /** The request's CSP script nonce, if any: put it on the page's own scripts. */
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
 * How the page being rendered is sent: whether it hydrates, and the CSP
 * nonce for its scripts, so the app can put the nonce on its own scripts
 * (analytics, an inline snippet) and leave out what only works with
 * JavaScript. Read it in a component or layout.
 *
 * On the server it's what `createRender` decided for the request (outside
 * createRender: hydrating, with the request's `nonce`). In the browser it
 * says the page hydrates, since only hydrating code runs there, with the
 * nonce the page's scripts carry.
 *
 * @example
 * ```tsx
 * function Analytics() {
 *   const page = useRenderedPage();
 *   return <script src="https://stats.example.com/script.js" nonce={page.nonce} defer />;
 * }
 * ```
 */
export function useRenderedPage(): RenderedPage {
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    // The nonce attribute reads empty once the page has loaded; the property keeps it.
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || undefined;
    return nonce ? { hydrate: true, nonce } : { hydrate: true };
  }
  const found = renderedPage();
  if (found) return found;
  // Start's request event carries the nonce its middleware set (StartRequestEvent).
  const raw = (getRequestEvent() as { nonce?: string | { script?: string | false } } | undefined)?.nonce;
  const nonce = typeof raw === 'string' ? raw : raw?.script || undefined;
  return nonce ? { hydrate: true, nonce } : { hydrate: true };
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
  const hydrate = page?.hydrate ?? true;
  return (
    <Show when={hydrate}>
      <HydrationScript />
      <script type="module" src={props.src ?? '/src/entry-client.tsx'} nonce={hydrate ? page?.nonce : undefined} async />
    </Show>
  );
}
