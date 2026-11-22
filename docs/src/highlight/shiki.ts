// Shiki, cut down to what the docs show: a few grammars, precompiled to
// JavaScript regular expressions, two themes and the raw JavaScript engine
// (no WebAssembly, no regex translator), so it starts synchronously and
// stays small. The server imports it up front; the browser loads it as its
// own chunk (see index.ts). Output is token spans for an existing
// `<pre><code>`: each span carries both themes' colours as `--shiki-light`
// and `--shiki-dark`, and styles.css picks one by colour scheme. Text in a
// theme's plain foreground gets no span: the `<pre>` already has that colour
// (`--docs-pre-text`).
import { createJavaScriptRawEngine } from '@shikijs/engine-javascript/raw';
import css from '@shikijs/langs-precompiled/css';
import json from '@shikijs/langs-precompiled/json';
import shellscript from '@shikijs/langs-precompiled/shellscript';
import tsx from '@shikijs/langs-precompiled/tsx';
import { createHighlighterCoreSync } from 'shiki/core';
import githubDark from 'shiki/themes/github-dark-default.mjs';
import githubLight from 'shiki/themes/github-light-default.mjs';

import { linkWords, type LinkWord } from './html.ts';

const shiki = createHighlighterCoreSync({
  engine: createJavaScriptRawEngine(),
  langs: [css, json, shellscript, tsx],
  themes: [githubLight, githubDark],
  // One grammar for the whole family: TSX covers TypeScript, JavaScript and
  // JSX (only old-style `<T>value` casts read differently, and the docs use
  // none), and saves shipping three more grammars of the same size.
  langAlias: Object.fromEntries(['ts', 'typescript', 'js', 'javascript', 'mjs', 'jsx'].map((alias) => [alias, 'tsx'])),
});

const themes = { light: shiki.getTheme(githubLight), dark: shiki.getTheme(githubDark) };
/** The style of text in both themes' foreground, which needs no span. */
const plain = `--shiki-light:${themes.light.fg};--shiki-dark:${themes.dark.fg}`.toLowerCase();

/**
 * Highlights `code` as `lang`, returning the HTML to put inside its
 * `<code>`, or undefined when the language isn't one the docs load.
 * `link` turns words (e.g. the reference's export names) into links.
 */
export function highlight(code: string, lang: string, link?: LinkWord): string | undefined {
  const name = shiki.resolveLangAlias(lang.toLowerCase());
  if (!shiki.getLoadedLanguages().includes(name)) return undefined;
  const { tokens } = shiki.codeToTokens(code, {
    lang: name,
    themes: { light: themes.light.name, dark: themes.dark.name },
    defaultColor: false,
  });
  return tokens
    .map((line) => {
      // Neighbouring tokens of one style share a span.
      const runs: { style: string; text: string }[] = [];
      for (const token of line) {
        const style = Object.entries(token.htmlStyle ?? {})
          .map(([key, value]) => `${key}:${value}`)
          .join(';')
          .toLowerCase();
        const last = runs.at(-1);
        if (last && (last.style === style || !token.content.trim())) last.text += token.content;
        else runs.push({ style, text: token.content });
      }
      return runs
        .map((run) => {
          const html = linkWords(run.text, link);
          return run.style && run.style !== plain ? `<span style="${run.style}">${html}</span>` : html;
        })
        .join('');
    })
    .join('\n');
}
