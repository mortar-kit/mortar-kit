// @mortar-kit/theme-mono: A technical theme: square corners, black rules, monospace labels and a yellow highlight. Pass it to the
// `mortarKit({ theme })` Vite plugin from `@mortar-kit/admin/vite`.
import { fileURLToPath } from 'node:url';

/** The theme's name. */
export const name = 'mono';

/** Absolute path of the theme's stylesheet. */
export const stylesheet = fileURLToPath(new URL('./theme.css', import.meta.url));

/** The Mono admin theme, for `mortarKit({ theme })`. */
export default { name, stylesheet };
