// The repository's CHANGELOG.md, bundled as text: the /changelog page and
// the llms files render it, so release notes are written once, next to the
// code, and the site can't drift from them.
import source from '../../CHANGELOG.md?raw';

/** The whole changelog, as Markdown. */
export const changelog: string = source;

/** The changelog without its "# Changelog" heading, for pages that print their own title. */
export const changelogBody: string = source.replace(/^# Changelog[^\n]*\n+/, '');
