// @mortar-kit/theme-soft: A light theme of floating panels: rounded white cards on grey, generous controls and an emerald accent. Pass it to the
// `mortarKit({ theme })` Vite plugin from `@mortar-kit/admin/vite`.
import { fileURLToPath } from 'node:url';

/** The theme's name. */
export const name = 'soft';

/** Absolute path of the theme's stylesheet. */
export const stylesheet = fileURLToPath(new URL('./theme.css', import.meta.url));

/** The Soft admin theme, for `mortarKit({ theme })`. */
export default { name, stylesheet };
