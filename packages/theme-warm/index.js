// @mortar-kit/theme-warm: A warm light theme: cream panels, a dark brown rail, serif headings and a terracotta accent. Pass it to the
// `mortarKit({ theme })` Vite plugin from `@mortar-kit/admin/vite`.
import { fileURLToPath } from 'node:url';

/** The theme's name. */
export const name = 'warm';

/** Absolute path of the theme's stylesheet. */
export const stylesheet = fileURLToPath(new URL('./theme.css', import.meta.url));

/** The Warm admin theme, for `mortarKit({ theme })`. */
export default { name, stylesheet };
