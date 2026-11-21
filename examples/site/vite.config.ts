import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

// Example Mortar site: start mode with streaming SSR. The plugin generates the
// entries from src/App.tsx + src/Document.tsx.
export default defineConfig({
  plugins: [solid({ start: true, ssr: true })],
  server: { port: Number(process.env.PORT ?? 3000) },
});
