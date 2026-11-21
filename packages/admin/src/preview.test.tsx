// <PreviewPage>: announces itself to the parent, renders the body of posted
// documents, and reuses brick DOM across updates of the same document.
import { defineBrick, defineCollection, fields, type ContentSource, type Doc, type PageEntry } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
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

  it('says so for a document without a body or a layout', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post({ id: 'ada-id', slug: 'ada', fields: { name: 'Ada' } }, location.origin, 'authors');
    expect(container.querySelector('[role="note"]')).toHaveTextContent('There is no preview for this collection.');
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

describe('<PreviewPage> layouts and loading bricks', () => {
  const people = defineCollection({ name: 'people', fields: { name: fields.text({ label: 'Name' }) } });
  const roster = defineBrick({
    name: 'roster',
    schema: { limit: fields.number({ label: 'Limit', default: 5 }) },
    load: (data, content) => content.list(people, { limit: data.limit }),
    component: (props) => <p class="roster">{props.loaded.map((p) => p.fields.name).join(', ')}</p>,
  });
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    flush();
  };

  it("renders a document in its collection's layout, around the body", () => {
    const layout = vi.fn((d: Doc, body: JSX.Element) => (
      <article>
        <h1>{String(d.fields.title)}</h1>
        {body}
      </article>
    ));
    const { container } = render(() => <PreviewPage bricks={bricks} layouts={{ pages: layout }} />);
    flush();
    post(doc());
    expect(container.querySelector('h1')).toHaveTextContent('Home');
    expect(container.querySelector('article h2')).toHaveTextContent('Welcome');
    post({ ...doc(), fields: { title: 'Changed' } });
    expect(container.querySelector('h1')).toHaveTextContent('Changed');
    expect(layout).toHaveBeenCalledTimes(1);
  });

  it('shows a layout error, and recovers on the next document', () => {
    const { container } = render(() => (
      <PreviewPage
        bricks={bricks}
        layouts={{
          pages: (d) => {
            if (d.fields.title === 'boom') throw new Error('bad layout');
            return <h1>{String(d.fields.title)}</h1>;
          },
        }}
      />
    ));
    flush();
    post({ ...doc(), id: 'x', fields: { title: 'boom' } });
    expect(container.querySelector('[role="alert"]')).toHaveTextContent('The preview failed: Error: bad layout');
    post(doc());
    expect(container.querySelector('h1')).toHaveTextContent('Home');
  });

  it('gives bricks the content source, and loads again on refresh', async () => {
    const names = ['Ada'];
    const list = vi.fn(async () => names.map((name, i) => ({ id: `p${i}`, slug: `p${i}`, fields: { name } })));
    const content: ContentSource = { list, get: async () => null };
    const { container } = render(() => <PreviewPage bricks={[roster]} content={content} />);
    flush();
    post({ ...doc(), entries: [{ brick: 'roster', id: 'r', data: {} }] });
    await settle();
    expect(container.querySelector('.roster')).toHaveTextContent('Ada');
    names.push('Grace');
    postMessage({ type: 'mortar:refresh' });
    await settle();
    expect(list).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.roster')).toHaveTextContent('Ada, Grace');
  });

  it('shows a failed load in place of the brick', async () => {
    const content: ContentSource = { list: async () => Promise.reject(new Error('offline')), get: async () => null };
    const { container } = render(() => <PreviewPage bricks={[roster]} content={content} />);
    flush();
    post({ ...doc(), entries: [{ brick: 'roster', id: 'r', data: {} }] });
    await settle();
    expect(container.querySelector('[role="alert"]')).toHaveTextContent('The "roster" brick couldn\'t load its data: Error: offline');
  });
});
