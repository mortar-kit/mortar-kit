// Markdown to HTML for the docs' Markdown brick (marked, GitHub-flavoured).
// Headings get ids, so sections can be linked, and fenced code is
// highlighted when a highlighter is given (see highlight/). The source is the site's own
// content (or the reader's edits in their own tab), so the HTML is trusted
// and not sanitised.
import { Marked } from 'marked';

import { escapeHtml as escape } from './highlight/html.ts';
import type { Highlight } from './highlight/index.ts';

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

// The highlighter for the parse in progress (parsing is synchronous).
let highlighting: Highlight | undefined;

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugify(html)}">${html}</h${depth}>\n`;
    },
    code({ text, lang }) {
      const name = lang?.match(/^\S*/)?.[0] ?? '';
      const html = (name && highlighting?.(text, name)) || escape(text);
      const attr = name ? ` class="language-${escape(name)}"` : '';
      return `<pre><code${attr}>${html}</code></pre>\n`;
    },
  },
});

/** Renders Markdown to HTML, highlighting fenced code with `highlight` if given. */
export function renderMarkdown(source: string, highlight?: Highlight): string {
  highlighting = highlight;
  try {
    return marked.parse(source, { async: false });
  } finally {
    highlighting = undefined;
  }
}
