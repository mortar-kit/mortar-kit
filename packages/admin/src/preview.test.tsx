// <PreviewPage>: announces itself to the parent, renders posted pages, and
// reuses brick DOM across updates.
import type { Page } from '@mortar-kit/core';
import { render } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { PreviewPage } from './preview.tsx';
import { bricks, page } from './test/bricks.tsx';

function post(p: Page, origin = location.origin) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'mortar:page', page: p }, origin, source: window.parent }));
  flush();
}

describe('<PreviewPage>', () => {
  it('sends a ready message to its parent', () => {
    const spy = vi.spyOn(window.parent, 'postMessage');
    render(() => <PreviewPage bricks={bricks} />);
    flush();
    expect(spy).toHaveBeenCalledWith({ type: 'mortar:ready' }, location.origin);
    spy.mockRestore();
  });

  it('renders posted pages and ignores other origins', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    expect(container.innerHTML).toBe('');

    post(page(), 'https://evil.test');
    expect(container.querySelector('h2')).toBeNull();

    post(page());
    expect(container.querySelector('h2')).toHaveTextContent('Welcome');
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b']);
  });

  it('updates in place: brick and list DOM survive edits and reorders', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post(page());
    const h2 = container.querySelector('h2');
    const [a, b] = container.querySelectorAll('li');

    const next = page();
    next[0]!.data.text = 'Edited';
    (next[1]!.data.items as { name: string }[])[1]!.name = 'B';
    post([next[1]!, next[0]!]);

    expect(container.querySelector('h2')).toBe(h2);
    expect(h2).toHaveTextContent('Edited');
    const after = container.querySelectorAll('li');
    expect(after[0]).toBe(a);
    expect(after[1]).toBe(b);
    expect(after[1]).toHaveTextContent('B');
    expect(container.firstElementChild?.tagName).toBe('UL');
  });
});
