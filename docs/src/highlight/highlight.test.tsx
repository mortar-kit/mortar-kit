// The highlighter in the browser: not in the page bundle, so code rendered
// before it loads is plain, and the same code is highlighted once it lands.
import { render } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { markdown } from '../bricks/markdown.tsx';
import { highlighter, loadHighlighter } from './index.ts';

describe('highlighting in the browser', () => {
  it('re-renders Markdown highlighted once the highlighter loads', async () => {
    const Markdown = markdown.component;
    const { container } = render(() => <Markdown data={{ source: '```tsx\nconst a = <b />;\n```' }} loaded={undefined} />);
    expect(highlighter()).toBeUndefined();
    expect(container.querySelector('pre span')).toBeNull();
    expect(container.querySelector('code')?.textContent).toBe('const a = <b />;');

    await loadHighlighter();
    flush();
    expect(container.querySelector('pre span')).not.toBeNull();
    expect(container.querySelector('code')?.textContent).toBe('const a = <b />;');
  });
});
