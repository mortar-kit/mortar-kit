// `mortarKit()`: the Vite plugin that picks the admin's theme. The admin
// imports `theme-slot.css` (empty, so the default tokens apply); with a
// theme, the plugin serves that file with the theme's stylesheet instead.
// Node-only: it runs in vite.config, never in a bundle.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** A theme for the admin: what a theme package (e.g. `@mortar-kit/theme-midnight`) exports. */
export interface MortarTheme {
  /** The theme's name, for messages. */
  name: string;
  /** Absolute path of its stylesheet, which sets --mortar-* custom properties on `:root`. */
  stylesheet: string;
}

export interface MortarKitOptions {
  /**
   * The admin's theme: a theme package's export, as `import midnight from
   * '@mortar-kit/theme-midnight'` or `require('@mortar-kit/theme-midnight')`
   * gives it. Without one the admin uses its default look.
   */
  theme?: MortarTheme | { default: MortarTheme };
}

const slot = fileURLToPath(new URL('./theme-slot.css', import.meta.url));

/**
 * Mortar's Vite plugin. Add it next to `@solidjs/vite-plugin`:
 *
 * ```ts
 * import { mortarKit } from '@mortar-kit/admin/vite';
 * import midnight from '@mortar-kit/theme-midnight';
 *
 * export default defineConfig({ plugins: [solid({ ... }), mortarKit({ theme: midnight })] });
 * ```
 */
export function mortarKit(options: MortarKitOptions = {}): Plugin {
  const theme = options.theme && ('default' in options.theme ? options.theme.default : options.theme);
  if (theme && (typeof theme.stylesheet !== 'string' || theme.stylesheet === '')) {
    throw new Error(`mortarKit: the theme ${JSON.stringify(theme.name)} has no stylesheet.`);
  }
  return {
    name: 'mortar-kit',
    enforce: 'pre',
    load(id) {
      if (!theme || id.split('?')[0] !== slot) return null;
      this.addWatchFile(theme.stylesheet);
      return `/* Theme: ${theme.name} */\n${readFileSync(theme.stylesheet, 'utf8')}`;
    },
  };
}
