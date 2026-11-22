// <Editor>: generated forms write to the document, validation shows per
// field, body entries can be added, moved, duplicated and removed, the
// details and slug are editable, and the preview iframe receives the
// document after its ready handshake.
import { defineBrick, defineCollection, fields, type AnyCollection, type Doc } from '@mortar-kit/core';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { Editor } from './Editor.tsx';
import { author, authors, bricks, doc, pages } from './test/bricks.tsx';

function setup(source: Doc = doc(), options: { collection?: AnyCollection; isNew?: boolean } = {}) {
  const onChange = vi.fn<(doc: Doc) => void>();
  const result = render(() => (
    <Editor bricks={bricks} collection={options.collection ?? pages} doc={source} isNew={options.isNew} previewUrl="/preview" onChange={onChange} />
  ));
  const last = () => onChange.mock.lastCall?.[0];
  return { ...result, onChange, last };
}

const input = (label: string) => screen.getByLabelText(label, { exact: false }) as HTMLInputElement;
const slugInput = () => input('Slug');
/** The select button of each entry in the sidebar list, in order. */
const entryButtons = () =>
  within(screen.getByRole('list', { name: 'Body entries' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('button')[0]!);
/** Labels of the entries in the sidebar list, in order. */
const entries = () => (screen.queryByRole('list', { name: 'Body entries' }) ? entryButtons().map((b) => b.textContent) : []);
const click = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  flush();
};
const typeSlug = (value: string) => {
  fireEvent.input(slugInput(), { target: { value } });
  flush();
};

describe('<Editor>', () => {
  it('lists entries and shows the first entry’s form', () => {
    setup();
    expect(entries()).toEqual(['Heading', 'Tags']);
    expect(input('Text').value).toBe('Welcome');
    expect(input('Size').value).toBe('2');
  });

  it('writes text, select and checkbox changes to the document', () => {
    const { last } = setup();
    fireEvent.input(input('Text'), { target: { value: 'Changed' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'loud' } });
    fireEvent.change(input('Shown'), { target: { checked: false } });
    flush();
    expect(last()?.entries?.[0]?.data).toEqual({ text: 'Changed', size: 2, tone: 'loud', shown: false });
  });

  it('keeps partial numbers in the input and commits complete ones', () => {
    const { last } = setup();
    const size = input('Size');
    fireEvent.input(size, { target: { value: '4' } });
    flush();
    expect(last()?.entries?.[0]?.data.size).toBe(4);
    fireEvent.input(size, { target: { value: '' } });
    flush();
    expect(size.value).toBe('');
    expect(last()?.entries?.[0]?.data.size).toBe(4);
  });

  it('commits any finite number and keeps the typed text', () => {
    const { last } = setup();
    const size = input('Size');
    for (const [text, n] of [
      ['0.50', 0.5],
      ['1e1', 10],
      ['3.0', 3],
    ] as const) {
      fireEvent.input(size, { target: { value: text } });
      flush();
      expect(last()?.entries?.[0]?.data.size).toBe(n);
      expect(size.value).toBe(text);
    }
  });

  it('keeps the same input element while typing', () => {
    setup();
    const text = input('Text');
    fireEvent.input(text, { target: { value: 'Typing' } });
    flush();
    expect(input('Text')).toBe(text);
  });

  it('accepts a signal setter as onChange', () => {
    // A setter returns the new value, which an effect must not take as its cleanup.
    const [latest, setLatest] = createSignal<Doc>();
    render(() => (
      <>
        <Editor bricks={bricks} collection={pages} doc={doc()} previewUrl="/preview" onChange={setLatest} />
        <output data-testid="latest">{latest()?.entries?.[0]?.data.text as string}</output>
      </>
    ));
    fireEvent.input(input('Text'), { target: { value: 'Set' } });
    flush();
    fireEvent.input(input('Text'), { target: { value: 'Again' } });
    flush();
    expect(screen.getByTestId('latest')).toHaveTextContent('Again');
  });

  it('shows validation messages next to the field', () => {
    setup();
    fireEvent.input(input('Text'), { target: { value: '' } });
    fireEvent.input(input('Size'), { target: { value: '9' } });
    flush();
    expect(screen.getByText('Text is required')).toBeInTheDocument();
    expect(screen.getByText('Size must be at most 6')).toBeInTheDocument();
    expect(input('Text')).toHaveAttribute('aria-invalid', 'true');
  });

  it('switches forms when another entry is selected and edits list items', () => {
    const { last } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    flush();
    const names = () => screen.getAllByLabelText('Name') as HTMLInputElement[];
    expect(names().map((i) => i.value)).toEqual(['a', 'b']);

    fireEvent.click(screen.getByRole('button', { name: 'Add Tag' }));
    flush();
    expect(names().map((i) => i.value)).toEqual(['a', 'b', 'new']);
    expect(screen.getByRole('button', { name: 'Add Tag' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Move Tag 3 up' }));
    flush();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tag 1' }));
    flush();
    expect(last()?.entries?.[1]?.data.items).toEqual([{ name: 'new' }, { name: 'b' }]);
    expect(names().map((i) => i.value)).toEqual(['new', 'b']);
  });

  it('titles list item cards and collapses them, keeping the state with moved items', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    flush();
    expect(screen.getAllByRole('button', { expanded: true }).map((b) => b.textContent)).toEqual(['a', 'b']);

    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    flush();
    const first = screen.getByRole('button', { name: 'a' });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(first.getAttribute('aria-controls')!)).toHaveAttribute('hidden');

    click('Move Tag 1 down');
    expect(screen.getByRole('button', { name: 'a' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'b' })).toHaveAttribute('aria-expanded', 'true');

    // A cleared title falls back to the item's label and number.
    fireEvent.input(screen.getAllByLabelText('Name')[0]!, { target: { value: '' } });
    flush();
    expect(screen.getByRole('button', { name: /^Tag 1/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('resizes the inspector from its handle and remembers the width', () => {
    localStorage.removeItem('mortar-admin:inspector-width');
    const { container, unmount } = setup();
    const handle = screen.getByRole('separator', { name: 'Inspector width' });
    const editor = container.firstElementChild as HTMLElement;
    expect(editor.style.getPropertyValue('--inspector-width')).toBe('');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    flush();
    expect(editor.style.getPropertyValue('--inspector-width')).toBe('336px');
    expect(localStorage.getItem('mortar-admin:inspector-width')).toBe('336');
    unmount();

    const again = setup();
    flush();
    expect((again.container.firstElementChild as HTMLElement).style.getPropertyValue('--inspector-width')).toBe('336px');
    fireEvent.dblClick(screen.getByRole('separator', { name: 'Inspector width' }));
    flush();
    expect((again.container.firstElementChild as HTMLElement).style.getPropertyValue('--inspector-width')).toBe('');
    expect(localStorage.getItem('mortar-admin:inspector-width')).toBeNull();
  });

  it('adds a brick after the selected entry and shows its form', () => {
    const { last } = setup();
    click('Add Tags');
    expect(entries()).toEqual(['Heading', 'Tags', 'Tags']);
    expect(screen.getByRole('button', { name: 'Tags', current: true })).toBe(entryButtons()[1]);
    expect(last()?.entries?.[1]?.data).toEqual({ items: [] });
    expect(screen.getByRole('button', { name: 'Add Tag' })).toBeInTheDocument();
    expect((screen.getByText('Add brick').closest('details') as HTMLDetailsElement).open).toBe(false);
  });

  it('adds a brick at the end while the details are selected', () => {
    const { last } = setup();
    click('Details');
    click('Add Heading');
    expect(entries()).toEqual(['Heading', 'Tags', 'Heading']);
    expect(last()?.entries?.[2]?.data.text).toBe('Hello');
    expect(screen.queryByRole('region', { name: 'Edit details' })).toBeNull();
  });

  it('moves and duplicates entries', () => {
    const { last } = setup();
    expect(screen.getByRole('button', { name: 'Move Heading 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Tags 2 down' })).toBeDisabled();
    click('Move Heading 1 down');
    expect(entries()).toEqual(['Tags', 'Heading']);
    click('Duplicate Heading 2');
    expect(entries()).toEqual(['Tags', 'Heading', 'Heading']);
    expect(last()?.entries?.map((e) => e.data.text)).toEqual([undefined, 'Welcome', 'Welcome']);
    expect(last()?.entries?.[2]?.id).not.toBe('h');
    // The duplicate is selected: editing it leaves the original alone.
    fireEvent.input(input('Text'), { target: { value: 'Copy' } });
    flush();
    expect(last()?.entries?.map((e) => e.data.text)).toEqual([undefined, 'Welcome', 'Copy']);
  });

  it('removes an entry only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { last } = setup();
    click('Remove Heading 1');
    expect(confirm).toHaveBeenCalledWith('Remove "Heading" from the body?');
    expect(entries()).toEqual(['Heading', 'Tags']);
    confirm.mockReturnValue(true);
    click('Remove Heading 1');
    expect(entries()).toEqual(['Tags']);
    expect(last()?.entries?.map((e) => e.id)).toEqual(['t']);
    expect(screen.getByRole('button', { name: 'Tags', current: true })).toBeInTheDocument();
    click('Remove Tags 1');
    expect(screen.getByText('The body is empty. Add a brick to start.')).toBeInTheDocument();
    // With no entries left, the details are shown.
    expect(screen.getByRole('button', { name: 'Details', current: true })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Edit details' })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('lists an unknown brick with a warning and lets it be removed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup({ ...doc(), entries: [{ brick: 'gone', id: 'g', data: { a: 1 } }, ...doc().entries!] });
    expect(entries()).toEqual(['⚠ Unknown brick "gone"', 'Heading', 'Tags']);
    expect(screen.getByText(/No brick named "gone" is defined/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate Unknown brick "gone" 1' })).toBeDisabled();
    click('Remove Unknown brick "gone" 1');
    expect(entries()).toEqual(['Heading', 'Tags']);
    expect(input('Text').value).toBe('Welcome');
    confirm.mockRestore();
  });

  it('posts the document to the preview after it reports ready, and on every change', () => {
    const { container } = setup();
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe('/preview');
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    const docs = () => post.mock.calls.filter(([m]) => (m as { type: string }).type === 'mortar:doc');

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'mortar:ready' }, origin: 'https://evil.test', source: frame.contentWindow }));
    flush();
    expect(post).not.toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'mortar:ready' }, origin: location.origin, source: frame.contentWindow }));
    flush();
    expect(docs()).toHaveLength(1);
    expect(docs()[0]?.[0]).toMatchObject({
      type: 'mortar:doc',
      collection: 'pages',
      doc: { id: 'home-id', slug: 'home', entries: [{ id: 'h' }, { id: 't' }] },
    });
    expect(docs()[0]?.[1]).toBe(location.origin);

    fireEvent.input(input('Text'), { target: { value: 'Live' } });
    flush();
    expect(docs()).toHaveLength(2);
    const sent = docs()[1]?.[0] as { doc: Doc } | undefined;
    expect(sent?.doc.entries?.[0]?.data.text).toBe('Live');
  });

  it('posts the selection to the preview, and selects what is clicked there', () => {
    const { container } = setup();
    const frame = container.querySelector('iframe')!;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    const fromPreview = (data: unknown) => {
      window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: frame.contentWindow }));
      flush();
    };
    const selections = () => post.mock.calls.map(([m]) => m as { type: string; id?: unknown }).filter((m) => m.type === 'mortar:select');

    fromPreview({ type: 'mortar:ready' });
    expect(selections().at(-1)).toEqual({ type: 'mortar:select', id: 'h' });
    click('Tags');
    expect(selections().at(-1)).toEqual({ type: 'mortar:select', id: 't' });
    click('Details');
    expect(selections().at(-1)).toEqual({ type: 'mortar:select', id: null });

    fromPreview({ type: 'mortar:select', id: 'h' });
    expect(screen.getByRole('region', { name: 'Edit brick' })).toBeInTheDocument();
    expect(input('Text').value).toBe('Welcome');
    // An id that isn't in the body changes nothing.
    fromPreview({ type: 'mortar:select', id: 'gone' });
    expect(input('Text').value).toBe('Welcome');
  });

  it('follows links clicked in the preview with onFollowLink, or in a new tab', () => {
    const onFollowLink = vi.fn<(url: URL) => void>();
    const { container, unmount } = render(() => <Editor bricks={bricks} collection={pages} doc={doc()} previewUrl="/preview" onFollowLink={onFollowLink} />);
    const send = (frame: HTMLIFrameElement, href: string) => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'mortar:link', href }, origin: location.origin, source: frame.contentWindow }));
      flush();
    };
    send(container.querySelector('iframe')!, `${location.origin}/posts/hello`);
    expect(onFollowLink).toHaveBeenCalledTimes(1);
    expect(onFollowLink.mock.lastCall?.[0].pathname).toBe('/posts/hello');
    // Other origins are the preview's to open.
    send(container.querySelector('iframe')!, 'https://example.com/');
    expect(onFollowLink).toHaveBeenCalledTimes(1);
    unmount();

    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const plain = setup();
    send(plain.container.querySelector('iframe')!, `${location.origin}/about`);
    expect(open).toHaveBeenCalledWith(`${location.origin}/about`, '_blank', 'noopener');
    open.mockRestore();
  });

  it('ignores ready messages from a window other than the preview', () => {
    const { container } = setup();
    const frame = container.querySelector('iframe')!;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'mortar:ready' }, origin: location.origin, source: window }));
    flush();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('<Editor> header', () => {
  it('shows the collection label and the document title, which follows the title field', () => {
    setup();
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Home');
    click('Details');
    fireEvent.input(input('Title'), { target: { value: 'Welcome home' } });
    flush();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome home');
    // An empty title falls back to the slug.
    fireEvent.input(input('Title'), { target: { value: '' } });
    flush();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('home');
  });
});

describe('<Editor> details', () => {
  it('edits the document’s fields under Details, keeping keys outside the schema', () => {
    const { last } = setup({ ...doc(), fields: { title: 'Home', extra: 1 } });
    expect(screen.queryByRole('region', { name: 'Edit details' })).toBeNull();
    click('Details');
    expect(screen.getByRole('button', { name: 'Details', current: true })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Edit details' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Edit brick' })).toBeNull();
    expect(input('Title').value).toBe('Home');
    fireEvent.input(input('Title'), { target: { value: '' } });
    flush();
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    fireEvent.input(input('Title'), { target: { value: 'New title' } });
    flush();
    expect(last()?.fields).toEqual({ title: 'New title', extra: 1 });
    expect(last()?.entries?.map((e) => e.data.text)).toEqual(['Welcome', undefined]);
    // Selecting an entry swaps the form.
    click('Heading');
    expect(screen.queryByRole('region', { name: 'Edit details' })).toBeNull();
    expect(input('Text').value).toBe('Welcome');
  });

  it('fills missing fields with their defaults', () => {
    setup({ ...doc(), fields: {} });
    click('Details');
    expect(input('Title').value).toBe('Untitled');
  });
});

describe('<Editor> slug', () => {
  it('writes the slug to the document', () => {
    const { last } = setup();
    expect(slugInput().value).toBe('home');
    typeSlug('welcome');
    expect(last()?.slug).toBe('welcome');
    expect(last()?.id).toBe('home-id');
    expect(slugInput()).not.toHaveAttribute('aria-invalid');
  });

  it('flags an invalid slug', () => {
    setup();
    typeSlug('Not Valid');
    expect(screen.getByText('Use lowercase letters and digits, with single dashes between (e.g. about-us).')).toBeInTheDocument();
    expect(slugInput()).toHaveAttribute('aria-invalid', 'true');
    typeSlug('');
    expect(slugInput()).toHaveAttribute('aria-invalid', 'true');
    typeSlug('valid');
    expect(screen.queryByText(/Use lowercase letters/)).toBeNull();
  });

  it('flags a reserved slug', () => {
    setup();
    typeSlug('admin');
    expect(screen.getByText('"admin" is reserved.')).toBeInTheDocument();
    expect(slugInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('notes that renaming a saved document moves it, until the slug is back', () => {
    setup();
    const note = () => screen.queryByText(/Saving moves this document to a new address/);
    expect(note()).toBeNull();
    typeSlug('welcome');
    expect(note()).toBeInTheDocument();
    // No note while the slug is invalid: its problem is shown instead.
    typeSlug('Welcome');
    expect(note()).toBeNull();
    typeSlug('home');
    expect(note()).toBeNull();
  });

  it('has no rename note for a new document', () => {
    setup(pages.create('draft'), { isNew: true });
    typeSlug('other');
    expect(screen.queryByText(/Saving moves this document/)).toBeNull();
  });
});

describe('<Editor> without a body', () => {
  it('shows only the details: no entries list or Add menu', () => {
    const { last } = setup(author(), { collection: authors });
    expect(screen.getByText('Authors')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ada');
    expect(screen.queryByRole('list', { name: 'Body entries' })).toBeNull();
    expect(screen.queryByText('Add brick')).toBeNull();
    expect(screen.queryByText(/The body is empty/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Details', current: true })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Edit details' })).toBeInTheDocument();
    expect(input('Name').value).toBe('Ada');
    fireEvent.input(input('Bio'), { target: { value: 'Mathematician' } });
    flush();
    expect(last()?.fields).toMatchObject({ name: 'Ada', bio: 'Mathematician' });
    expect(last()?.entries).toBeUndefined();
  });

  it('posts the document to the preview with its collection', () => {
    const { container } = setup(author(), { collection: authors });
    const frame = container.querySelector('iframe')!;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'mortar:ready' }, origin: location.origin, source: frame.contentWindow }));
    flush();
    const sent = post.mock.calls.find(([m]) => (m as { type: string }).type === 'mortar:doc');
    expect(sent?.[0]).toMatchObject({ type: 'mortar:doc', collection: 'authors', doc: { id: 'ada-id', fields: { name: 'Ada' } } });
    // The details are selected, which the preview doesn't outline.
    expect(post).toHaveBeenCalledWith({ type: 'mortar:select', id: null }, location.origin);
  });
});

describe('date and reference fields', () => {
  const event = defineBrick({
    name: 'event',
    label: 'Event',
    schema: {
      day: fields.date({ label: 'Day' }),
      venue: fields.reference({ label: 'Venue', collection: 'venues' }),
    },
    component: () => null,
  });
  const events = defineCollection({ name: 'events', fields: {}, body: true });

  it('edits a date with the date picker and shows a reference id', () => {
    const onChange = vi.fn<(doc: Doc) => void>();
    render(() => (
      <Editor
        bricks={[event]}
        collection={events}
        doc={{ id: 'e-id', slug: 'e', fields: {}, entries: [{ brick: 'event', id: 'e', data: { venue: 'v1' } }] }}
        previewUrl="/preview"
        onChange={onChange}
      />
    ));
    const day = input('Day');
    expect(day.type).toBe('date');
    fireEvent.input(day, { target: { value: '2026-11-22' } });
    flush();
    expect(onChange.mock.lastCall?.[0].entries?.[0]?.data).toEqual({ day: '2026-11-22', venue: 'v1' });
    expect(input('Venue').value).toBe('v1');
    expect(input('Venue').readOnly).toBe(true);
  });
});
