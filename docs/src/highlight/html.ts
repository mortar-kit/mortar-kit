// Small HTML helpers shared by the highlighter and the plain fallback (kept
// apart from shiki.ts, so the fallback doesn't pull Shiki into the page).

/** Turns a word of code into a link target, or undefined to leave it plain. */
export type LinkWord = (word: string) => string | undefined;

const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escapes text for HTML content or a quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => escapes[c] ?? c);
}

/** Escapes code, wrapping each word `link` names in a link. */
export function linkWords(text: string, link?: LinkWord): string {
  if (!link) return escapeHtml(text);
  return text
    .split(/([A-Za-z_$][\w$]*)/)
    .map((part) => {
      const href = part && link(part);
      return href ? `<a href="${escapeHtml(href)}">${escapeHtml(part)}</a>` : escapeHtml(part);
    })
    .join('');
}
