// The asset manifest as seen by a page that doesn't hydrate: the same
// stylesheets, but no JavaScript. Solid's renderer links every CSS file a
// rendered module needs and adds a `modulepreload` for each JS file the
// client entry imports; `noScripts` drops the scripts but not those
// preloads, so a page without JavaScript would still download it. (A
// lazy() component's own chunk is preloaded too; `<NoHydration>` in the
// server entry stops that, not this.)
import type { DevAssetResolver, ViteManifest } from '@solidjs/vite-plugin';

type Manifest = ViteManifest | DevAssetResolver;
type ManifestRecord = ViteManifest[string];

/**
 * A copy of `manifest` that resolves to CSS only. A build manifest keeps
 * each module's file but folds the CSS of everything it imports into the
 * module itself and drops the imports, so nothing is left to preload. The
 * dev resolver answers with the same CSS and no JS.
 */
export function stylesOnly(manifest: Manifest): Manifest {
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

function isResolver(manifest: Manifest): manifest is DevAssetResolver {
  return typeof (manifest as DevAssetResolver).resolve === 'function';
}

function isRecord(value: unknown): value is ManifestRecord {
  return typeof value === 'object' && value !== null && typeof (value as ManifestRecord).file === 'string';
}
