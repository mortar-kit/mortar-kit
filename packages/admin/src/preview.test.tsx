// <PreviewPage>: announces itself to the parent, renders the body of posted
// documents, and reuses brick DOM across updates of the same document.
import { defineBrick, defineCollection, fields, type ContentSource, type Doc, type PageEntry } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { fireEvent, render } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { PreviewPage } from './preview.tsx';
import { author, bricks, doc, pages } from './test/bricks.tsx';

function postMessage(data: unknown, origin = location.origin) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: window.parent }));
  flush();
}

function post(d: Doc, origin = location.origin, collection = 'pages', body = collection !== 'authors') {
  postMessage({ type: 'mortar:doc', collection, body, doc: d }, origin);
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
    expect(container.firstElementChild?.firstElementChild?.tagName).toBe('UL');
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

describe('<PreviewPage> click to select', () => {
  const entryOf = (el: Element | null) => el?.closest('[data-mortar-entry]')?.getAttribute('data-mortar-entry');
  const sent = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([m]) => m);
  const withLink = (href: string): Doc => withEntries([{ brick: 'link', id: 'l', data: { href } }, ...doc().entries!]);
  const link = defineBrick({
    name: 'link',
    label: 'Link',
    schema: { href: fields.text({ label: 'Href' }) },
    component: (props) => (
      <p>
        <a href={props.data.href}>Go</a>
      </p>
    ),
  });

  it('marks each entry with its id, around its DOM', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post(doc());
    expect(entryOf(container.querySelector('h2'))).toBe('h');
    expect(entryOf(container.querySelector('li'))).toBe('t');
  });

  it('tells the editor which entry was clicked', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post(doc());
    const spy = vi.spyOn(window.parent, 'postMessage');
    fireEvent.click(container.querySelectorAll('li')[1]!);
    expect(spy).toHaveBeenCalledWith({ type: 'mortar:select', id: 't' }, location.origin);
    spy.mockRestore();
  });

  it("doesn't follow a plain-clicked link: it selects the brick", () => {
    const { container } = render(() => <PreviewPage bricks={[...bricks, link]} />);
    flush();
    post(withLink('/posts/hello'));
    const spy = vi.spyOn(window.parent, 'postMessage');
    const anchor = container.querySelector('a')!;
    expect(fireEvent.click(anchor)).toBe(false);
    expect(sent(spy)).toEqual([{ type: 'mortar:select', id: 'l' }]);
    spy.mockRestore();
  });

  it('sends a ⌘/Ctrl-clicked same-origin link to the editor, and opens other links in a new tab', () => {
    const { container } = render(() => <PreviewPage bricks={[...bricks, link]} />);
    flush();
    post(withLink('/posts/hello'));
    const spy = vi.spyOn(window.parent, 'postMessage');
    expect(fireEvent.click(container.querySelector('a')!, { metaKey: true })).toBe(false);
    expect(sent(spy)).toEqual([{ type: 'mortar:link', href: `${location.origin}/posts/hello` }]);

    post(withLink('https://example.com/'));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    spy.mockClear();
    expect(fireEvent.click(container.querySelector('a')!, { ctrlKey: true })).toBe(false);
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener');
    expect(sent(spy)).toEqual([]);
    open.mockRestore();
    spy.mockRestore();
  });

  it("doesn't submit forms", () => {
    const form = defineBrick({ name: 'form', schema: {}, component: () => <form action="/subscribe"><button type="submit">Join</button></form> });
    const { container } = render(() => <PreviewPage bricks={[form]} />);
    flush();
    post(withEntries([{ brick: 'form', id: 'f', data: {} }]));
    expect(fireEvent.submit(container.querySelector('form')!)).toBe(false);
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
    for (let i = 0; i < 30; i++) await Promise.resolve();
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

describe('<PreviewPage> review fixes', () => {
  const settle = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    flush();
  };

  it('ignores stored entries when the collection has no body', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} />);
    flush();
    post({ ...author(), entries: doc().entries }, location.origin, 'authors', false);
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('[role="note"]')).toHaveTextContent('There is no preview for this collection.');
  });

  it('loads again on refresh even when the loader awaits before reading content', async () => {
    const people = defineCollection({ name: 'people', fields: { name: fields.text({ label: 'Name' }) } });
    const late = defineBrick({
      name: 'late',
      schema: {},
      load: async (_data, content) => {
        await Promise.resolve();
        return content.list(people);
      },
      component: (props) => <p class="late">{props.loaded.length}</p>,
    });
    const docs = [{ id: 'a', slug: 'a', fields: { name: 'A' } }];
    const list = vi.fn(async () => [...docs]);
    render(() => <PreviewPage bricks={[late]} content={{ list, get: async () => null }} />);
    flush();
    post({ ...doc(), entries: [{ brick: 'late', id: 'l', data: {} }] });
    await settle();
    expect(document.querySelector('.late')).toHaveTextContent('1');
    docs.push({ id: 'b', slug: 'b', fields: { name: 'B' } });
    postMessage({ type: 'mortar:refresh' });
    await settle();
    expect(list).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.late')).toHaveTextContent('2');
  });
});

describe('<PreviewPage> default preview (no layout)', () => {
  const settle = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    flush();
  };
  const categories = defineCollection({ name: 'categories', label: 'Categories', fields: { name: fields.text({ label: 'Name' }) } });
  const products = defineCollection({
    name: 'products',
    label: 'Products',
    fields: {
      name: fields.text({ label: 'Name' }),
      price: fields.number({ label: 'Price' }),
      image: fields.image({ label: 'Image' }),
      category: fields.reference({ label: 'Category', collection: 'categories' }),
      size: fields.select({ label: 'Size', options: { s: 'Small', l: 'Large' } }),
      tags: fields.list({ label: 'Tags', of: fields.text({ label: 'Tag' }) }),
      notes: fields.textarea({ label: 'Notes' }),
    },
  });
  const mug = (): Doc => ({
    id: 'mug-id',
    slug: 'mug',
    fields: {
      name: 'Mug',
      price: 14,
      image: { src: '/mug.jpg', alt: 'A blue mug', asset: '' },
      category: 'cat-id',
      size: 'l',
      tags: ['blue', 'stoneware'],
      notes: '',
    },
  });
  const rows = (container: HTMLElement) =>
    Object.fromEntries([...container.querySelectorAll('dl > div')].map((row) => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]));

  it("shows the document's title, lead image and fields, and updates in place", () => {
    const { container } = render(() => <PreviewPage bricks={bricks} collections={[products, categories]} />);
    flush();
    post(mug(), location.origin, 'products', false);
    expect(container.querySelector('h1')).toHaveTextContent('Mug');
    expect(container.querySelector('header')).toHaveTextContent('Products');
    expect(container.querySelector('img')).toHaveAttribute('src', '/mug.jpg');
    expect(rows(container)).toEqual({ Price: '14', Category: 'cat-id', Size: 'Large', Tags: 'bluestoneware', Notes: '—' });
    const img = container.querySelector('img');
    post({ ...mug(), fields: { ...mug().fields, name: 'Big mug', notes: 'Holds 500 ml.' } }, location.origin, 'products', false);
    expect(container.querySelector('h1')).toHaveTextContent('Big mug');
    expect(rows(container).Notes).toBe('Holds 500 ml.');
    expect(container.querySelector('img')).toBe(img);
  });

  it('shows a reference by its document’s title, read from the content', async () => {
    const content: ContentSource = { list: async () => [], get: async (_c, ref) => ('id' in ref && ref.id === 'cat-id' ? { id: 'cat-id', slug: 'mugs', fields: { name: 'Mugs' } } : null) };
    const { container } = render(() => <PreviewPage bricks={bricks} collections={[products, categories]} content={content} />);
    flush();
    post(mug(), location.origin, 'products', false);
    await settle();
    expect(rows(container).Category).toBe('Mugs');
    post({ ...mug(), fields: { ...mug().fields, category: 'gone' } }, location.origin, 'products', false);
    await settle();
    expect(rows(container).Category).toBe('Missing document');
  });

  it('shows the body under the fields, and a layout still wins', () => {
    const { container } = render(() => <PreviewPage bricks={bricks} collections={[pages]} />);
    flush();
    post(doc());
    expect(container.querySelector('h1')).toHaveTextContent('Home');
    expect(container.querySelector('h2')).toHaveTextContent('Welcome');

    const other = render(() => <PreviewPage bricks={bricks} collections={[pages]} layouts={{ pages: (d) => <p class="layout">{String(d.fields.title)}</p> }} />);
    flush();
    post(doc());
    expect(other.container.querySelector('.layout')).toHaveTextContent('Home');
    expect(other.container.querySelector('h1')).toBeNull();
  });
});
