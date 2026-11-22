// The Mortar mark as the example's favicon: a body of three bricks, the
// middle one slid out as it is edited. One SVG with light and dark colours.
const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<style>.a{fill:#1b1d22}.b{fill:#047857}@media (prefers-color-scheme:dark){.a{fill:#e7e9ee}.b{fill:#34d399}}</style>' +
  '<rect class="a" x="3" y="4" width="22" height="6.5" rx="2"/>' +
  '<rect class="b" x="7" y="12.75" width="22" height="6.5" rx="2"/>' +
  '<rect class="a" x="3" y="21.5" width="22" height="6.5" rx="2"/>' +
  '</svg>';

/** The mark as an SVG data URL for `<link rel="icon">`. */
export const faviconHref = `data:image/svg+xml,${encodeURIComponent(FAVICON)}`;
