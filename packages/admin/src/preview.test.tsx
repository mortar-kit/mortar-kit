// <PreviewPage>: announces itself to the parent, renders the body of posted
// documents, and reuses brick DOM across updates of the same document.
import type { Doc, PageEntry } from '@mortar-kit/core';
import { render } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { PreviewPage } from './preview.tsx';
import { bricks, doc } from './test/bricks.tsx';

function postMessage(data: unknown, origin = location.origin) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: window.parent }));
  flush();
}

function post(d: Doc, origin = location.origin, collection = 'pages') {
  postMessage({ type: 'mortar:doc', collection, doc: d }, origin);
}

/** The fixture document with other entries. */
const withEntries = (entries: PageEntry[]): Doc => ({ ...doc(), entries });

describe('<PreviewPage>', () => {
  it('sends a ready message to its parent', () => {
    const spy = vi.spyOn(window.parent, 'postMessage');
    render(() => <PreviewPage bricks={bricks} />);
    flush();
    expect(spy).toHaveBeenCalledWith({ type: 'mortar:ready' }, location.origin);
    spy.mockRestore();
  });

  it('answers the editor’s hello with ready (editor hydrated after the preview)', () => {
    render(() => <PreviewPage bricks={bricks} />);
    flush();
    const spy = vi.spyOn(window.parent, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'mortar:hello' }, origin: location.origin, source: window.parent }));
    expect(spy).toHaveBeenCalledWith({ type: 'mortar:ready' }, location.origin);
    spy.mockRestore();
  });

  it('renders posted documents and ignores other origins', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    expect(container.innerHTML).toBe('');

    post(doc(), 'https://evil.test');
    expect(container.querySelector('h2')).toBeNull();

    post(doc());
    expect(container.querySelector('h2')).toHaveTextContent('Welcome');
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b']);
  });

  it('ignores malformed and old-style messages', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    postMessage({ type: 'mortar:doc', collection: 'pages' });
    postMessage({ type: 'mortar:doc', doc: doc() });
    postMessage({ type: 'mortar:doc', collection: 'pages', doc: { entries: doc().entries } });
    postMessage({ type: 'mortar:page', page: { entries: doc().entries } });
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for a document without a body', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post({ id: 'ada-id', slug: 'ada', fields: { name: 'Ada' } }, location.origin, 'authors');
    expect(container.innerHTML).toBe('');
  });

  it('shows a placeholder for an unknown brick', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post(withEntries([{ brick: 'gone', id: 'g', data: {} }, ...doc().entries!]));
    expect(container.querySelector('[role="note"]')).toHaveTextContent('Unknown brick "gone"');
    expect(container.querySelector('h2')).toHaveTextContent('Welcome');
  });

  it('keeps brick DOM across added entries, entry moves and list item moves', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post(doc());
    const h2 = container.querySelector('h2');
    const ul = container.querySelector('ul');

    const [heading, tags] = doc().entries!;
    const added = { brick: 'heading', id: 'new', data: { text: 'Added' } };
    post(withEntries([tags!, added, heading!]));
    expect(container.querySelector('ul')).toBe(ul);
    expect([...container.querySelectorAll('h2')].map((el) => el.textContent)).toEqual(['Added', 'Welcome']);
    expect(container.querySelectorAll('h2')[1]).toBe(h2);

    post(withEntries([{ ...tags!, data: { items: [{ name: 'b' }, { name: 'a' }] } }, added, heading!]));
    expect(container.querySelector('ul')).toBe(ul);
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['b', 'a']);
  });

  it('updates in place: brick and list DOM survive edits and reorders', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post(doc());
    const h2 = container.querySelector('h2');
    const [a, b] = container.querySelectorAll('li');

    const next = doc().entries!;
    next[0]!.data.text = 'Edited';
    (next[1]!.data.items as { name: string }[])[1]!.name = 'B';
    post(withEntries([next[1]!, next[0]!]));

    expect(container.querySelector('h2')).toBe(h2);
    expect(h2).toHaveTextContent('Edited');
    const after = container.querySelectorAll('li');
    expect(after[0]).toBe(a);
    expect(after[1]).toBe(b);
    expect(after[1]).toHaveTextContent('B');
    expect(container.firstElementChild?.tagName).toBe('UL');
  });

  it('replaces the content when another document is posted', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post(doc());
    post({ id: 'about-id', slug: 'about', fields: {}, entries: [{ brick: 'heading', id: 'h', data: { text: 'About' } }] });
    expect([...container.querySelectorAll('h2')].map((el) => el.textContent)).toEqual(['About']);
    expect(container.querySelector('ul')).toBeNull();
    // The same id in another collection is another document too.
    post(doc(), location.origin, 'other');
    expect(container.querySelector('h2')).toHaveTextContent('Welcome');
    expect(container.querySelector('ul')).not.toBeNull();
  });
});
