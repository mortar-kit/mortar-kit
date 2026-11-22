// Markdown rendering on the server, where the highlighter is loaded from the
// start: fenced code comes out as token spans in both themes' colours.
import { describe, expect, it } from 'vitest';

import { highlighter } from './highlight/index.ts';
import { renderMarkdown } from './markdown.ts';

describe('renderMarkdown', () => {
  it('highlights fenced code it has a grammar for', () => {
    const html = renderMarkdown('```ts\nconst answer = 42;\n```', highlighter());
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toMatch(/<span style="--shiki-light:#[0-9a-f]{6};--shiki-dark:#[0-9a-f]{6}">const <\/span>/);
  });

  it('escapes code it can’t highlight, and everything without a highlighter', () => {
    expect(renderMarkdown('```rust\nlet a = b < c;\n```', highlighter())).toBe('<pre><code class="language-rust">let a = b &lt; c;</code></pre>\n');
    expect(renderMarkdown('```ts\nlet a = b < c;\n```')).toBe('<pre><code class="language-ts">let a = b &lt; c;</code></pre>\n');
    expect(renderMarkdown('```\n<div>\n```', highlighter())).toBe('<pre><code>&lt;div&gt;</code></pre>\n');
  });

  it('leaves links to the llms files to the browser', () => {
    expect(renderMarkdown('[a](/llms.txt) [b](/docs/x.md#y) [c](/docs/x)')).toBe(
      '<p><a href="/llms.txt" rel="external">a</a> <a href="/docs/x.md#y" rel="external">b</a> <a href="/docs/x">c</a></p>\n',
    );
  });

  it('links words in highlighted code', () => {
    const html = highlighter()!('function f(a: Brick): void', 'ts', (word) => (word === 'Brick' ? '/reference/Brick' : undefined));
    expect(html).toContain('<a href="/reference/Brick">Brick</a>');
  });
});
