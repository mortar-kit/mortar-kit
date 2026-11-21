// stylesOnly: pages that don't hydrate keep their stylesheets but get no
// JavaScript, checked against Solid's real renderer (it reads the manifest).
import type { DevAssetResolver, ViteManifest } from '@solidjs/vite-plugin';
import { renderToStream } from '@solidjs/web';
import { describe, expect, it } from 'vitest';

import { stylesOnly } from './styles-only.ts';

const manifest = {
  _base: '/',
  'src/entry-client.tsx': { file: 'assets/entry.js', isEntry: true, css: ['assets/entry.css'], imports: ['_bricks.js'] },
  '_bricks.js': { file: 'assets/bricks.js', css: ['assets/bricks.css'], imports: ['_shared.js'] },
  '_shared.js': { file: 'assets/shared.js', imports: ['_bricks.js'] },
  'src/routes/admin.tsx': { file: 'assets/admin.js', isDynamicEntry: true, css: ['assets/admin.css'], imports: ['_shared.js'] },
} as unknown as ViteManifest; // the plugin's type rejects its own _base key

function Page() {
  return (
    <html>
      <head>
        <title>Test</title>
      </head>
      <body>
        <p>Hello</p>
      </body>
    </html>
  );
}

describe('stylesOnly', () => {
  it('folds the CSS of every import into each module and drops the imports', () => {
    const out = stylesOnly(manifest) as ViteManifest;
    expect(out._base).toBe('/');
    expect(out['src/entry-client.tsx']).toEqual({ file: 'assets/entry.js', isEntry: true, css: ['assets/entry.css', 'assets/bricks.css'] });
    expect(out['src/routes/admin.tsx']).toEqual({ file: 'assets/admin.js', isEntry: undefined, css: ['assets/admin.css', 'assets/bricks.css'] });
    expect(manifest['_bricks.js']?.imports).toEqual(['_shared.js']);
  });

  it('renders stylesheets without preloads or scripts', async () => {
    const full = await renderToStream(() => <Page />, { manifest });
    expect(full).toContain('rel="modulepreload"');

    const html = await renderToStream(() => <Page />, { manifest: stylesOnly(manifest), noScripts: true });
    expect(html).toContain('<link rel="stylesheet" href="/assets/entry.css">');
    expect(html).toContain('<link rel="stylesheet" href="/assets/bricks.css">');
    expect(html).not.toContain('modulepreload');
    expect(html).not.toContain('<script');
  });

  it('strips JS from a dev resolver, sync or async', async () => {
    const assets = { js: ['/src/a.tsx'], css: ['/src/a.css'] };
    const sync = stylesOnly({ resolve: () => assets, resolveSync: () => assets }) as DevAssetResolver;
    expect(sync.resolve('a')).toEqual({ js: [], css: ['/src/a.css'] });
    expect(sync.resolveSync('a')).toEqual({ js: [], css: ['/src/a.css'] });
    const async = stylesOnly({ resolve: async () => assets, resolveSync: () => assets }) as DevAssetResolver;
    expect(await async.resolve('a')).toEqual({ js: [], css: ['/src/a.css'] });
    const missing = stylesOnly({ resolve: () => null, resolveSync: () => assets }) as DevAssetResolver;
    expect(missing.resolve('a')).toBeNull();
  });
});
