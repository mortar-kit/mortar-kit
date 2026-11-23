// @mortar-kit/core/render: the app's server render, with public pages sent
// without JavaScript. `createRender` is the server entry's `render`:
// pages that hydrate (the admin, by default) render as usual; every other
// page renders as plain HTML:
// - `<NoHydration>`: no hydration keys, and lazy() chunks aren't preloaded;
// - `noScripts`: no hydration data or streaming scripts;
// - `stylesOnly(manifest)`: stylesheets, but no modulepreload of the client
//   entry's imports;
// - `<ClientScripts>` in the document renders nothing.
// Such pages are always sent as one settled document: streamed content
// needs a script to swap it in.
//
// Islands (hydrating single bricks on an otherwise static page) will need
// more than this yes/no: the static page stays under <NoHydration> with each
// interactive brick inside <Hydration id={entry.id}>, the page data (not the
// path) decides which islands render, island pages keep their hydration
// data and their islands' chunks (so no `noScripts`/`stylesOnly` there), and
// a separate client entry hydrates each island root.
import type { DevAssetResolver, StartServerRenderContext, ViteManifest } from '@solidjs/vite-plugin';
import { getRequestEvent, renderToStream, type JSX } from '@solidjs/web';
import { NoHydration } from 'solid-js';

import { setRenderedPage } from './ClientScripts.tsx';

/** The asset manifest the server entry gets from `virtual:solid-manifest`. */
export type RenderManifest = ViteManifest | DevAssetResolver;

/** Which pages hydrate: all, none, these path prefixes, or a test of the path. */
export type HydrateOption = boolean | readonly string[] | ((pathname: string) => boolean);

/** The server entry's `render`: a stream for pages that hydrate, the settled HTML for the rest. */
export type Render = (request: Request, context?: StartServerRenderContext) => ReturnType<typeof renderToStream> | Promise<string>;

/** Options for `createRender`. */
export interface RenderOptions {
  /** `import manifest from 'virtual:solid-manifest'`. */
  manifest: RenderManifest;
  /** The whole document: your Document around your App (with `<ClientScripts />` in its head). */
  app: () => JSX.Element;
  /**
   * Which pages load JavaScript and hydrate. Default `['/admin']`: the
   * editor and its preview hydrate, public pages are plain HTML. Prefixes
   * match whole path segments, case-insensitively (as routers do).
   */
  hydrate?: HydrateOption;
}

/**
 * The server entry's `render`. Pair it with an entry-client that hydrates
 * the same tree (`hydrate(() => <Root />, document)`).
 *
 * @example
 * ```tsx
 * // src/entry-server.tsx
 * import { createRender } from '@mortar-kit/core/render';
 * import manifest from 'virtual:solid-manifest';
 * import { Root } from './Root.tsx';
 *
 * export const render = createRender({ manifest, app: () => <Root /> });
 * ```
 */
export function createRender(options: RenderOptions): Render {
  const hydrates = hydrateTest(options.hydrate ?? ['/admin']);
  const staticManifest = stylesOnly(options.manifest);
  return (request, context = {} as StartServerRenderContext) => {
    const hydrate = hydrates(new URL(request.url).pathname);
    const nonce = typeof context.nonce === 'string' ? context.nonce : context.nonce?.script || undefined;
    setRenderedPage(getRequestEvent()?.request ?? request, { hydrate, nonce: hydrate ? nonce : undefined });
    const stream = renderToStream(
      () => (hydrate ? options.app() : <NoHydration>{options.app()}</NoHydration>),
      {
        manifest: hydrate ? options.manifest : staticManifest,
        nonce: context.nonce ?? undefined,
        signal: request.signal,
        noScripts: !hydrate,
      },
    );
    // A plain promise: the plugin waits for it whatever the render mode.
    return hydrate ? stream : stream.then((html) => html);
  };
}

/** `hydrate` as a test of a path. */
export function hydrateTest(option: HydrateOption): (pathname: string) => boolean {
  if (typeof option === 'function') return option;
  if (typeof option === 'boolean') return () => option;
  const prefixes = option.map((p) => (p.length > 1 ? p.replace(/\/+$/, '') : p).toLowerCase());
  return (pathname) => {
    const path = pathname.toLowerCase();
    return prefixes.some((p) => p === '/' || path === p || path.startsWith(`${p}/`));
  };
}

type ManifestRecord = ViteManifest[string];

/**
 * A copy of `manifest` that resolves to CSS only. Solid's renderer links
 * every CSS file a rendered module needs and adds a `modulepreload` for
 * each JS file the client entry imports; `noScripts` drops the scripts but
 * not those preloads. A build manifest keeps each module's file but folds
 * the CSS of everything it imports into the module itself and drops the
 * imports, so nothing is left to preload. The dev resolver answers with the
 * same CSS and no JS.
 */
export function stylesOnly(manifest: RenderManifest): RenderManifest {
  if (isResolver(manifest)) {
    const strip = (assets: Awaited<ReturnType<DevAssetResolver['resolve']>>) => assets && { js: [], css: assets.css };
    return {
      resolve(key) {
        const assets = manifest.resolve(key);
        return assets instanceof Promise ? assets.then(strip) : strip(assets);
      },
      resolveSync: (key) => ({ js: [], css: manifest.resolveSync(key).css }),
    };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(manifest)) {
    out[key] = isRecord(value) ? { file: value.file, isEntry: value.isEntry, css: closureCss(manifest, key) } : value;
  }
  return out as ViteManifest;
}

/** The CSS files of `key` and everything it imports, in import order, once each. */
function closureCss(manifest: ViteManifest, key: string): string[] {
  const css = new Set<string>();
  const seen = new Set<string>();
  const walk = (k: string) => {
    const record = manifest[k];
    if (seen.has(k) || !isRecord(record)) return;
    seen.add(k);
    for (const file of record.css ?? []) css.add(file);
    for (const child of record.imports ?? []) walk(child);
  };
  walk(key);
  return [...css];
}

function isResolver(manifest: RenderManifest): manifest is DevAssetResolver {
  return typeof (manifest as DevAssetResolver).resolve === 'function';
}

function isRecord(value: unknown): value is ManifestRecord {
  return typeof value === 'object' && value !== null && typeof (value as ManifestRecord).file === 'string';
}
