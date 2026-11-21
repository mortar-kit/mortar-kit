import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

// Example Mortar site: start mode with SSR. The entries are authored
// (src/entry-server.tsx, src/entry-client.tsx) so public pages can be sent
// without JavaScript; src/client.ts decides which pages hydrate. Server
// functions (src/server/) load and save pages as JSON files in content/pages.
//
// renderMode 'async' sends each page as one settled document: the content
// and its head tags (title, description) are in the HTML itself, so crawlers
// and link previews that never run JavaScript see them. Page reads are fast
// local file reads, so waiting for them costs little; switch to 'stream' (the
// plugin's default) if pages ever load slow data.
export default defineConfig({
  plugins: [solid({ start: { renderMode: 'async' }, ssr: true, serverFunctions: true })],
  server: { port: Number(process.env.PORT ?? 3000) },
});
