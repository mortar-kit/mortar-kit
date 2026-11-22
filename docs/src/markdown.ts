// Markdown to HTML for the docs' Markdown brick (marked, GitHub-flavoured).
// Headings get ids, so sections can be linked. The source is the site's own
// content (or the reader's edits in their own tab), so the HTML is trusted
// and not sanitised.
import { Marked } from 'marked';

/** A heading's text as an id: lowercase words joined by dashes. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;|&#\d+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugify(html)}">${html}</h${depth}>\n`;
    },
  },
});

/** Renders Markdown to HTML. */
export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false });
}
