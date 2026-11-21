// <Admin>: collections and their documents in the sidebar, opening,
// creating, renaming and deleting documents (refused while referenced),
// and navigation that asks before losing unsaved changes, or leaves that
// to the app when it keeps the location.
import { createContent, createMemoryStore, defineCollection, fields, type Content, type Doc } from '@mortar-kit/core';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Admin } from './Admin.tsx';
import type { AdminLocation } from './context.ts';
import { author, authors, bricks, doc, pages } from './test/bricks.tsx';

const quotes = defineCollection({
  name: 'quotes',
  label: 'Quotes',
  fields: { text: fields.text({ label: 'Text', required: true }), by: fields.reference({ label: 'By', collection: 'authors' }) },
});

const collections = [pages, authors, quotes];

function seed() {
  const store = createMemoryStore({
    pages: [doc(), { id: 'about-id', slug: 'about', fields: { title: 'About' }, entries: [] }],
    authors: [author(), { id: 'grace-id', slug: 'grace', fields: { name: 'Grace' } }],
    quotes: [{ id: 'q1', slug: 'q1', fields: { text: 'Hello', by: 'ada-id' } }],
  });
  return { store, content: createContent({ store, collections, bricks }) };
}

/** Lets pending promises and timers (the list refresh after a save) run, then applies their writes. */
async function settle() {
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  for (let i = 0; i < 30; i++) await Promise.resolve();
  flush();
}

function setup(options: { content?: Content; location?: () => AdminLocation; onNavigate?: (to: AdminLocation) => void } = {}) {
  const { store, content } = seed();
  const onDirtyChange = vi.fn<(dirty: boolean) => void>();
  const result = render(() => (
    <Admin
      bricks={bricks}
      collections={collections}
      content={options.content ?? content}
      previewUrl="/preview"
      location={options.location?.()}
      onNavigate={options.onNavigate}
      onDirtyChange={onDirtyChange}
    />
  ));
  return { ...result, store, content, onDirtyChange };
}

const nav = () => within(screen.getByRole('navigation', { name: 'Content' }));
const docList = (label: string) => within(screen.getByRole('list', { name: `${label} documents` }));
const docTitles = (label: string) => docList(label).queryAllByRole('button').map((b) => b.textContent);
const click = async (element: HTMLElement) => {
  fireEvent.click(element);
  await settle();
};
/** Opens a document, switching to its collection first if needed. */
const open = async (label: string, title: string) => {
  if (!screen.queryByRole('list', { name: `${label} documents` })) await click(nav().getByRole('button', { name: label }));
  await click(docList(label).getByRole('button', { name: title }));
};
const editorTitle = () => screen.getByRole('heading', { level: 1 }).textContent;
const status = () => screen.getByRole('status').textContent;
const typeInto = (label: string | RegExp, value: string) => {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
  flush();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<Admin>', () => {
  it('lists the collections and the documents of the open one', async () => {
    setup();
    await settle();
    expect(nav().getAllByRole('button', { name: /^(Pages|Authors|Quotes)$/ }).map((b) => b.textContent)).toEqual(['Pages', 'Authors', 'Quotes']);
    expect(nav().getByRole('button', { name: 'Pages', current: true })).toBeInTheDocument();
    expect(docTitles('Pages')).toEqual(['About', 'Home']);
    expect(screen.getByText('Open a document, or create one.')).toBeInTheDocument();
    await click(nav().getByRole('button', { name: 'Authors' }));
    expect(docTitles('Authors')).toEqual(['Ada', 'Grace']);
  });

  it('opens a document in the editor', async () => {
    setup();
    await settle();
    await open('Pages', 'Home');
    expect(editorTitle()).toBe('Home');
    expect(docList('Pages').getByRole('button', { name: 'Home', current: true })).toBeInTheDocument();
    expect(status()).toBe('All changes saved');
  });

  it('saves edits, and the list follows without reloading the editor', async () => {
    const { store } = setup();
    await settle();
    await open('Pages', 'Home');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    flush();
    typeInto(/^Title/, 'Welcome');
    await click(screen.getByRole('button', { name: 'Save' }));
    expect(status()).toBe('All changes saved');
    expect(((await store.get('pages', 'home')) as Doc).fields.title).toBe('Welcome');
    expect(docTitles('Pages')).toEqual(['About', 'Welcome']);
    // Still the same editor: the details form stays open.
    expect(screen.getByRole('region', { name: 'Edit details' })).toBeInTheDocument();
    typeInto(/^Title/, 'Welcome!');
    expect(status()).toBe('Unsaved changes');
  });

  it('renames a document: same id, new slug', async () => {
    const { store } = setup();
    await settle();
    await open('Pages', 'About');
    typeInto('Slug', 'about-us');
    await click(screen.getByRole('button', { name: 'Save' }));
    expect(status()).toBe('All changes saved');
    expect(await store.get('pages', 'about')).toBeUndefined();
    expect(((await store.get('pages', 'about-us')) as Doc).id).toBe('about-id');
    expect(editorTitle()).toBe('About');
  });

  it('reports a slug another document uses', async () => {
    setup();
    await settle();
    await open('Pages', 'About');
    typeInto('Slug', 'home');
    await click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Slug: Another document in Pages already uses the slug "home"' })).toBeInTheDocument();
  });
});

describe('creating documents', () => {
  it('checks the slug as it is typed', async () => {
    setup();
    await settle();
    const input = screen.getByLabelText('New document slug');
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    fireEvent.input(input, { target: { value: 'Bad slug' } });
    flush();
    expect(screen.getByText('Use lowercase letters and digits, with single dashes between.')).toBeInTheDocument();
    fireEvent.input(input, { target: { value: 'home' } });
    flush();
    expect(screen.getByText('"home" is already used.')).toBeInTheDocument();
    fireEvent.input(input, { target: { value: 'admin' } });
    flush();
    expect(screen.getByText('"admin" is reserved.')).toBeInTheDocument();
    expect(create).toBeDisabled();
  });

  it('opens a new document unsaved, and stores it on its first save', async () => {
    const { store } = setup();
    await settle();
    fireEvent.input(screen.getByLabelText('New document slug'), { target: { value: 'contact' } });
    flush();
    await click(screen.getByRole('button', { name: 'Create' }));
    expect(docTitles('Pages')).toEqual(['Untitled (new, unsaved)', 'About', 'Home']);
    expect(status()).toBe('Unsaved changes');
    expect(await store.get('pages', 'contact')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    flush();
    typeInto(/^Title/, 'Contact');
    await click(screen.getByRole('button', { name: 'Save' }));
    expect(status()).toBe('All changes saved');
    expect(docTitles('Pages')).toEqual(['About', 'Contact', 'Home']);
    expect(((await store.get('pages', 'contact')) as Doc).fields.title).toBe('Contact');
    // Now it exists: renaming it shows the note.
    typeInto('Slug', 'contact-us');
    expect(screen.getByText(/Saving moves this document to a new address/)).toBeInTheDocument();
  });

  it('drops an unsaved new document when leaving it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup();
    await settle();
    fireEvent.input(screen.getByLabelText('New document slug'), { target: { value: 'draft' } });
    flush();
    await click(screen.getByRole('button', { name: 'Create' }));
    await open('Pages', 'Home');
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(docTitles('Pages')).toEqual(['About', 'Home']);
  });
});

describe('deleting documents', () => {
  it('deletes after confirming, and returns to the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { store, onDirtyChange } = setup();
    await settle();
    await open('Authors', 'Grace');
    await click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.confirm).toHaveBeenCalledWith('Delete "Grace"? This can\'t be undone.');
    expect(await store.get('authors', 'grace')).toBeUndefined();
    expect(docTitles('Authors')).toEqual(['Ada']);
    expect(screen.getByText('Open a document, or create one.')).toBeInTheDocument();
    expect(onDirtyChange.mock.lastCall).toEqual([false]);
  });

  it('keeps it when the confirm is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { store } = setup();
    await settle();
    await open('Authors', 'Grace');
    await click(screen.getByRole('button', { name: 'Delete' }));
    expect(await store.get('authors', 'grace')).toBeDefined();
    expect(editorTitle()).toBe('Grace');
  });

  it('refuses while others reference it, linking to them', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { store } = setup();
    await settle();
    await open('Authors', 'Ada');
    await click(screen.getByRole('button', { name: 'Delete' }));
    expect(await store.get('authors', 'ada')).toBeDefined();
    const alert = within(screen.getByRole('alert'));
    expect(alert.getByText(/Can't delete: other documents use this one/)).toBeInTheDocument();
    await click(alert.getByRole('button', { name: 'Quotes › Hello › by' }));
    expect(nav().getByRole('button', { name: 'Quotes', current: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Slug')).toHaveValue('q1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('dismisses the refusal', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup();
    await settle();
    await open('Authors', 'Ada');
    await click(screen.getByRole('button', { name: 'Delete' }));
    await click(within(screen.getByRole('alert')).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(editorTitle()).toBe('Ada');
  });

  it('discards an unsaved new document without storing anything', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const content = seed().content;
    const remove = vi.spyOn(content, 'remove');
    setup({ content });
    await settle();
    fireEvent.input(screen.getByLabelText('New document slug'), { target: { value: 'draft' } });
    flush();
    await click(screen.getByRole('button', { name: 'Create' }));
    await click(screen.getByRole('button', { name: 'Delete' }));
    expect(remove).not.toHaveBeenCalled();
    expect(docTitles('Pages')).toEqual(['About', 'Home']);
    expect(screen.getByText('Open a document, or create one.')).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('asks before leaving unsaved changes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup();
    await settle();
    await open('Pages', 'Home');
    typeInto('Slug', 'home-2');
    await open('Pages', 'About');
    expect(confirm).toHaveBeenCalledWith('Leave this document? Your unsaved changes will be lost.');
    expect(editorTitle()).toBe('Home');
    confirm.mockReturnValue(true);
    await open('Pages', 'About');
    expect(editorTitle()).toBe('About');
  });

  it('waits for a save in flight before leaving', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const content = seed().content;
    let finish!: () => void;
    const save = content.save;
    content.save = (collection, d) =>
      new Promise((resolve) => {
        finish = () => void save(collection, d).then(resolve);
      });
    setup({ content });
    await settle();
    await open('Pages', 'Home');
    typeInto('Slug', 'home-2');
    await click(screen.getByRole('button', { name: 'Save' }));
    await click(docList('Pages').getByRole('button', { name: 'About' }));
    expect(editorTitle()).toBe('Home');
    finish();
    await settle();
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(editorTitle()).toBe('About');
  });

  it('leaves navigation to the app when it keeps the location', async () => {
    const [location, setLocation] = createSignal<AdminLocation>({ collection: 'authors', id: 'ada-id' });
    const onNavigate = vi.fn<(to: AdminLocation) => void>();
    const confirm = vi.spyOn(window, 'confirm');
    setup({ location, onNavigate });
    await settle();
    expect(editorTitle()).toBe('Ada');
    typeInto('Slug', 'ada-2');
    await open('Authors', 'Grace');
    expect(onNavigate).toHaveBeenCalledWith({ collection: 'authors', id: 'grace-id' });
    expect(confirm).not.toHaveBeenCalled();
    expect(editorTitle()).toBe('Ada');
    setLocation({ collection: 'authors', id: 'grace-id' });
    await settle();
    expect(editorTitle()).toBe('Grace');
  });

  it('says so for an unknown collection or a missing document', async () => {
    const [location, setLocation] = createSignal<AdminLocation>({ collection: 'nope' });
    setup({ location, onNavigate: () => {} });
    await settle();
    expect(screen.getByText('Unknown collection "nope".')).toBeInTheDocument();
    setLocation({ collection: 'pages', id: 'gone' });
    await settle();
    expect(screen.getByText("This document doesn't exist (it may have been deleted).")).toBeInTheDocument();
  });
});

describe('the reference picker', () => {
  const picker = () => screen.getByLabelText('By') as HTMLSelectElement;
  const options = () => [...picker().options].map((o) => o.textContent);

  it('lists the referenced collection by title, and writes the id', async () => {
    const { store } = setup();
    await settle();
    await open('Quotes', 'Hello');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    await settle();
    expect(options()).toEqual(['None', 'Ada', 'Grace']);
    expect(picker().value).toBe('ada-id');
    fireEvent.change(picker(), { target: { value: 'grace-id' } });
    flush();
    await click(screen.getByRole('button', { name: 'Save' }));
    expect(((await store.get('quotes', 'q1')) as Doc).fields.by).toBe('grace-id');
    fireEvent.change(picker(), { target: { value: '' } });
    flush();
    expect(screen.getByRole('button', { name: 'Open the selected by' })).toBeDisabled();
  });

  it('opens the referenced document', async () => {
    setup();
    await settle();
    await open('Quotes', 'Hello');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    await settle();
    await click(screen.getByRole('button', { name: 'Open the selected by' }));
    expect(nav().getByRole('button', { name: 'Authors', current: true })).toBeInTheDocument();
    expect(editorTitle()).toBe('Ada');
  });

  it('shows a reference to a deleted document as missing', async () => {
    const { store } = seed();
    await store.put('quotes', { id: 'q2', slug: 'q2', fields: { text: 'Orphan', by: 'gone-id' } });
    setup({ content: createContent({ store, collections, bricks }) });
    await settle();
    await open('Quotes', 'Orphan');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    await settle();
    expect(options()).toEqual(['None', 'Missing document (gone-id)', 'Ada', 'Grace']);
    expect(picker()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('The selected document no longer exists. Pick another, or None.')).toBeInTheDocument();
  });
});

describe('review fixes', () => {
  it('asks once when deleting a document with unsaved changes, and once for an unsaved new one', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup();
    await settle();
    await open('Authors', 'Grace');
    typeInto('Slug', 'grace-2');
    await click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(docTitles('Authors')).toEqual(['Ada']);

    fireEvent.input(screen.getByLabelText('New document slug'), { target: { value: 'draft' } });
    flush();
    await click(screen.getByRole('button', { name: 'Create' }));
    await click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Open a document, or create one.')).toBeInTheDocument();
  });

  it("reports nothing unsaved before asking the app to leave a deleted document", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const [location, setLocation] = createSignal<AdminLocation>({ collection: 'authors', id: 'grace-id' });
    const [dirty, setDirty] = createSignal(false);
    const dirtyWhenAsked: boolean[] = [];
    const { content } = seed();
    render(() => (
      <Admin
        bricks={bricks}
        collections={collections}
        content={content}
        previewUrl="/preview"
        location={location()}
        onNavigate={(to) => {
          dirtyWhenAsked.push(dirty());
          setLocation(to);
        }}
        onDirtyChange={setDirty}
      />
    ));
    await settle();
    typeInto('Slug', 'grace-2');
    await click(screen.getByRole('button', { name: 'Delete' }));
    expect(dirtyWhenAsked).toEqual([false]);
  });

  it('leaves no new document behind when the app declines to open it', async () => {
    const onNavigate = vi.fn<(to: AdminLocation) => void>();
    setup({ location: () => ({ collection: 'pages', id: 'home-id' }), onNavigate });
    await settle();
    fireEvent.input(screen.getByLabelText('New document slug'), { target: { value: 'contact' } });
    flush();
    await click(screen.getByRole('button', { name: 'Create' }));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(docTitles('Pages')).toEqual(['About', 'Home']);
    expect(editorTitle()).toBe('Home');
  });

  it('shows the form while a reference picker is still loading its documents', async () => {
    const { content } = seed();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const list = content.list;
    content.list = async (collection, options) => {
      if (collection === 'authors') await gate;
      return list(collection, options);
    };
    setup({ content, location: () => ({ collection: 'quotes', id: 'q1' }), onNavigate: () => {} });
    await settle();
    expect(editorTitle()).toBe('Hello');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    await settle();
    expect(screen.getByText('Loading Authors…')).toBeInTheDocument();
    open();
    await settle();
    expect((screen.getByLabelText('By') as HTMLSelectElement).value).toBe('ada-id');
  });
});
