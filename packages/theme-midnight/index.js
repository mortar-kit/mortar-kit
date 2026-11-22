// @mortar-kit/theme-midnight: A dark theme: near-black panels, a soft blue accent, mono details. Pass it to the
// `mortarKit({ theme })` Vite plugin from `@mortar-kit/admin/vite`.
import { fileURLToPath } from 'node:url';

/** The theme's name. */
export const name = 'midnight';

/** Absolute path of the theme's stylesheet. */
export const stylesheet = fileURLToPath(new URL('./theme.css', import.meta.url));

/** The Midnight admin theme, for `mortarKit({ theme })`. */
export default { name, stylesheet };
