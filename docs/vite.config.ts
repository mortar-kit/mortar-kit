import { mortarKit } from '@mortar-kit/admin/vite';
import midnight from '@mortar-kit/theme-midnight';
import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

// The Mortar docs, built with Mortar. Start mode with SSR: the server renders
// the published content (docs/content/, bundled), and every page hydrates
// so this tab's edits, kept in session storage by the admin, replace it.
// There are no server functions: the site needs no database or file
// access, only something to run the built server.
//
// Production: `start.nodeServer` emits dist/server/node.js, which serves
// dist/client and renders everything else (`node dist/server/node.js`, PORT
// and HOST). `ssr.noExternal` bundles the dependencies into the server
// build, so dist/ runs on its own with no node_modules beside it.
export default defineConfig({
  plugins: [
    solid({ start: { renderMode: 'async', nodeServer: true }, ssr: true }),
    mortarKit({ theme: midnight }),
  ],
  ssr: { noExternal: true },
  server: { port: Number(process.env.PORT ?? 3100) },
});
