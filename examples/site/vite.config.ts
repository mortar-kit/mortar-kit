import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

// Example Mortar site: start mode with streaming SSR. The plugin generates the
// entries from src/App.tsx + src/Document.tsx. Server functions (src/server/)
// load and save pages as JSON files in content/pages.
export default defineConfig({
  plugins: [solid({ start: true, ssr: true, serverFunctions: true })],
  server: { port: Number(process.env.PORT ?? 3000) },
});
