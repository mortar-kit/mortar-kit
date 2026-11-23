import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vitest/config';

// Workspace-wide tests. The Solid plugin picks the posture per project:
// jsdom → client (DOM codegen), node → server (SSR codegen, isServer true).
export default defineConfig({
  plugins: [solid()],
  test: {
    globals: false,
    setupFiles: ['./vitest-setup.ts'],
    // The router ships preserved JSX (.jsx), which Node can't load: compile it.
    server: { deps: { inline: ['@solidjs/router'] } },
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['packages/*/src/**/*.test.tsx', 'examples/*/src/**/*.test.tsx', 'docs/src/**/*.test.tsx'],
          exclude: ['**/*.ssr.test.tsx', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: [
            'packages/*/src/**/*.test.ts',
            'packages/*/src/**/*.ssr.test.tsx',
            'examples/*/src/**/*.test.ts',
            'examples/*/src/**/*.ssr.test.tsx',
            'docs/src/**/*.test.ts',
            'docs/src/**/*.ssr.test.tsx',
          ],
        },
      },
    ],
  },
});
