import solidV2 from 'eslint-plugin-solid/configs/v2';
import { defineConfig } from 'oxlint';

// oxlint + eslint-plugin-solid's Solid 2 rules as a JS plugin (as in the
// official solid-v2 templates).
export default defineConfig({
  jsPlugins: ['eslint-plugin-solid'],
  ignorePatterns: ['**/dist', '**/node_modules', '.cache'],
  settings: solidV2.settings,
  rules: {
    ...solidV2.rules,
  },
});
