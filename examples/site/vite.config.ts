import { mortarKit, type MortarTheme } from '@mortar-kit/admin/vite';
import midnight from '@mortar-kit/theme-midnight';
import mono from '@mortar-kit/theme-mono';
import soft from '@mortar-kit/theme-soft';
import warm from '@mortar-kit/theme-warm';
import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

// Example Mortar site: start mode with SSR. The entries are authored
// (src/entry-server.tsx, src/entry-client.tsx) so public pages can be sent
// without JavaScript, apart from islands (interactive bricks such as the
// contact form); createRender (@mortar-kit/core/render) decides. Server
// functions (src/server/) load and save documents as JSON files in
// content/<collection>/<slug>.json, and uploads in uploads/<key>, served at
// /uploads/ by src/middleware.ts.
//
// renderMode 'async' sends each page as one settled document: the content
// and its head tags (title, description) are in the HTML itself, so crawlers
// and link previews that never run JavaScript see them. Page reads are fast
// local file reads, so waiting for them costs little; switch to 'stream' (the
// plugin's default) if pages ever load slow data.
//
// mortarKit() picks the admin's theme. A site would pass one theme; the
// example takes MORTAR_THEME=midnight|warm|soft|mono so each can be tried
// (the default look without it).
const themes: Record<string, MortarTheme> = { midnight, mono, soft, warm };
const theme = process.env.MORTAR_THEME;
if (theme && !themes[theme]) throw new Error(`MORTAR_THEME must be one of ${Object.keys(themes).join(', ')}`);
export default defineConfig({
  plugins: [
    solid({
      start: { renderMode: 'async', middleware: './src/middleware.ts' },
      ssr: true,
      serverFunctions: { serverSetup: './src/server-functions-setup.ts' },
    }),
    mortarKit({ theme: theme ? themes[theme] : undefined }),
  ],
  server: { port: Number(process.env.PORT ?? 3000) },
});
