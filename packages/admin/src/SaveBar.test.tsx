// Saving from <Editor>: dirty state (a new document starts unsaved), the
// saving state, local and server validation problems linked to entries,
// details or the slug, failures, the keyboard shortcut and the leave-page
// warning.
import { createContent, createMemoryStore, defineBrick, fields, type AnyCollection, type Doc, type SaveResult } from '@mortar-kit/core';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { Editor } from './Editor.tsx';
import { author, authors, bricks, doc, pages } from './test/bricks.tsx';

type OnSave = (doc: Doc) => Promise<SaveResult | void>;

function setup(onSave: OnSave, options: { source?: Doc; collection?: AnyCollection; isNew?: boolean } = {}) {
  const save = vi.fn(onSave);
  render(() => (
    <Editor
      bricks={bricks}
      collection={options.collection ?? pages}
      doc={options.source ?? doc()}
      isNew={options.isNew}
      previewUrl="/preview"
      onSave={save}
    />
  ));
  return save;
}

const status = () => screen.getByRole('status').textContent;
const saveButton = () => screen.getByRole('button', { name: 'Save' });
const typeInto = (label: string, value: string) => {
  fireEvent.input(screen.getByLabelText(label, { exact: false }), { target: { value } });
  flush();
};
const type = (value: string) => typeInto('Text', value);
/** Lets the action's promise settle, then applies its writes. */
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flush();
}

describe('saving', () => {
  it('has no save controls without onSave', () => {
    render(() => <Editor bricks={bricks} collection={pages} doc={doc()} previewUrl="/preview" />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('marks edits as unsaved and saves the document', async () => {
    const save = setup(async () => ({ ok: true }));
    expect(status()).toBe('All changes saved');
    expect(saveButton()).toBeDisabled();

    type('Changed');
    expect(status()).toBe('Unsaved changes');
    fireEvent.click(saveButton());
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.lastCall?.[0]).toMatchObject({ id: 'home-id', slug: 'home', fields: { title: 'Home' } });
    expect(save.mock.lastCall?.[0].entries?.[0]?.data.text).toBe('Changed');
    expect(status()).toBe('All changes saved');
    expect(saveButton()).toBeDisabled();

    type('Welcome');
    expect(status()).toBe('Unsaved changes');
  });

  it('counts a document whose stored fields lack defaults as saved', () => {
    setup(async () => ({ ok: true }), { source: { ...doc(), fields: {} } });
    expect(status()).toBe('All changes saved');
  });

  it('shows a saving state while the save is in flight', async () => {
    let finish!: (result: SaveResult) => void;
    setup(() => new Promise((resolve) => (finish = resolve)));
    type('Changed');
    fireEvent.click(saveButton());
    flush();
    expect(status()).toBe('Saving…');
    expect(saveButton()).toBeDisabled();
    finish({ ok: true });
    await settle();
    expect(status()).toBe('All changes saved');
  });

  it('stays unsaved when typing continues while a save is in flight', async () => {
    let finish!: (result: SaveResult) => void;
    const save = setup(() => new Promise((resolve) => (finish = resolve)));
    type('First');
    fireEvent.click(saveButton());
    flush();
    type('Second');
    finish({ ok: true });
    await settle();
    expect(save.mock.lastCall?.[0].entries?.[0]?.data.text).toBe('First');
    expect(status()).toBe('Unsaved changes');
    expect(saveButton()).toBeEnabled();
  });

  it('does not call onSave when the document is invalid, and links problems to entries', async () => {
    const save = setup(async () => ({ ok: true }));
    type('');
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    flush();
    fireEvent.click(saveButton());
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved: fix this problem first.');
    fireEvent.click(screen.getByRole('button', { name: 'Heading 1 › text: Text is required' }));
    flush();
    expect(screen.getByRole('button', { name: 'Heading', current: true })).toBeInTheDocument();
    expect(status()).toBe('Unsaved changes');
  });

  it('shows problems the server reports and stays unsaved', async () => {
    setup(async () => ({ ok: false, issues: [{ entryId: 't', path: ['items', 0, 'name'], message: 'Taken' }] }));
    type('Changed');
    fireEvent.click(saveButton());
    await settle();
    expect(screen.getByRole('button', { name: 'Tags 2 › items › 0 › name: Taken' })).toBeInTheDocument();
    expect(status()).toBe('Unsaved changes');
  });

  it('shows problems elsewhere in the document as plain text', async () => {
    setup(async () => ({ ok: false, issues: [{ path: ['id'], message: 'Bad id' }] }));
    type('Changed');
    fireEvent.click(saveButton());
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Bad id');
    expect(screen.queryByRole('button', { name: /Bad id/ })).toBeNull();
  });

  it('shows an error when saving fails', async () => {
    setup(async () => {
      throw new Error('Disk full');
    });
    type('Changed');
    fireEvent.click(saveButton());
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save: Disk full");
    expect(status()).toBe('Unsaved changes');
    expect(saveButton()).toBeEnabled();
  });

  it('saves with Ctrl+S or Cmd+S, only when there are changes', async () => {
    const save = setup(async () => ({ ok: true }));
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    await settle();
    expect(save).not.toHaveBeenCalled();
    type('Changed');
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports unsaved changes through onDirtyChange', async () => {
    const onDirtyChange = vi.fn<(dirty: boolean) => void>();
    const onSave = async (): Promise<SaveResult> => ({ ok: true });
    render(() => <Editor bricks={bricks} collection={pages} doc={doc()} previewUrl="/preview" onSave={onSave} onDirtyChange={onDirtyChange} />);
    flush();
    expect(onDirtyChange.mock.calls).toEqual([[false]]);
    type('Changed');
    type('Changed again');
    expect(onDirtyChange.mock.calls).toEqual([[false], [true]]);
    fireEvent.click(saveButton());
    await settle();
    expect(onDirtyChange.mock.calls).toEqual([[false], [true], [false]]);
  });

  it('reports false when the save controls go away while dirty', () => {
    const onDirtyChange = vi.fn<(dirty: boolean) => void>();
    const save = async (): Promise<SaveResult> => ({ ok: true });
    const [onSave, setOnSave] = createSignal<typeof save | undefined>(() => save);
    render(() => <Editor bricks={bricks} collection={pages} doc={doc()} previewUrl="/preview" onSave={onSave()} onDirtyChange={onDirtyChange} />);
    flush();
    type('Changed');
    setOnSave(undefined);
    flush();
    expect(onDirtyChange.mock.calls).toEqual([[false], [true], [false]]);
  });

  it('warns before leaving with unsaved changes', async () => {
    setup(async () => ({ ok: true }));
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    type('Changed');
    expect(leave()).toBe(true);
    fireEvent.click(saveButton());
    await settle();
    expect(leave()).toBe(false);
  });
});

describe('saving a new document', () => {
  it('is unsaved from the start and saved once onSave succeeds', async () => {
    const onDirtyChange = vi.fn<(dirty: boolean) => void>();
    const save = vi.fn<OnSave>(async () => ({ ok: true }));
    const draft = pages.create('draft');
    render(() => <Editor bricks={bricks} collection={pages} doc={draft} isNew previewUrl="/preview" onSave={save} onDirtyChange={onDirtyChange} />);
    flush();
    expect(status()).toBe('Unsaved changes');
    expect(saveButton()).toBeEnabled();
    expect(onDirtyChange.mock.calls).toEqual([[true]]);
    fireEvent.click(saveButton());
    await settle();
    expect(save.mock.lastCall?.[0]).toEqual({ id: draft.id, slug: 'draft', fields: { title: 'Untitled' }, entries: [] });
    expect(status()).toBe('All changes saved');
    expect(onDirtyChange.mock.calls).toEqual([[true], [false]]);
  });
});

describe('saving the details and the slug', () => {
  it('validates the details first and links their problems to the form', async () => {
    const save = setup(async () => ({ ok: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    flush();
    typeInto('Title', '');
    fireEvent.click(screen.getByRole('button', { name: 'Heading' }));
    flush();
    fireEvent.click(saveButton());
    await settle();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Details › title: Title is required' }));
    flush();
    expect(screen.getByRole('button', { name: 'Details', current: true })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Edit details' })).toBeInTheDocument();
  });

  it('links a details problem from the server to the form', async () => {
    setup(async () => ({ ok: false, issues: [{ path: ['fields', 'title'], message: 'Taken' }] }));
    type('Changed');
    fireEvent.click(saveButton());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Details › title: Taken' }));
    flush();
    expect(screen.getByRole('button', { name: 'Details', current: true })).toBeInTheDocument();
  });

  it('saves a renamed slug', async () => {
    const save = setup(async () => ({ ok: true }));
    typeInto('Slug', 'welcome');
    expect(status()).toBe('Unsaved changes');
    fireEvent.click(saveButton());
    await settle();
    expect(save.mock.lastCall?.[0]).toMatchObject({ id: 'home-id', slug: 'welcome' });
    expect(status()).toBe('All changes saved');
    expect(saveButton()).toBeDisabled();
  });

  it('does not save an invalid slug and focuses the slug input from the problem', async () => {
    const save = setup(async () => ({ ok: true }));
    typeInto('Slug', 'Bad Slug');
    fireEvent.click(saveButton());
    await settle();
    expect(save).not.toHaveBeenCalled();
    const link = screen.getByRole('button', { name: /^Slug: Slug must be lowercase/ });
    expect(document.activeElement).not.toBe(screen.getByLabelText('Slug', { exact: false }));
    fireEvent.click(link);
    flush();
    expect(document.activeElement).toBe(screen.getByLabelText('Slug', { exact: false }));
    // The selection is left alone.
    expect(screen.getByRole('button', { name: 'Heading', current: true })).toBeInTheDocument();
  });

  it('rejects a reserved slug before saving', async () => {
    const save = setup(async () => ({ ok: true }));
    typeInto('Slug', 'admin');
    fireEvent.click(saveButton());
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Slug: The slug "admin" is reserved' })).toBeInTheDocument();
  });

  it('focuses the slug input for a slug problem the server reports', async () => {
    setup(async () => ({ ok: false, issues: [{ path: ['slug'], message: 'Another document in Pages already uses the slug "home"' }] }));
    type('Changed');
    fireEvent.click(saveButton());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Slug: Another document in Pages already uses the slug "home"' }));
    flush();
    expect(document.activeElement).toBe(screen.getByLabelText('Slug', { exact: false }));
    expect(status()).toBe('Unsaved changes');
  });

  it('saves a document without a body', async () => {
    const save = setup(async () => ({ ok: true }), { source: author(), collection: authors });
    typeInto('Bio', 'Mathematician');
    fireEvent.click(saveButton());
    await settle();
    expect(save.mock.lastCall?.[0]).toEqual({ id: 'ada-id', slug: 'ada', fields: { name: 'Ada', bio: 'Mathematician' } });
    expect(status()).toBe('All changes saved');
  });
});

describe('a save the server rejects', () => {
  // The server's bricks are stricter than the editor's (e.g. a deploy changed
  // a schema while the editor was open), so the editor's own check passes
  // and only Content.save on the server finds the problem.
  const strictHeading = defineBrick({
    name: 'heading',
    schema: { text: fields.text({ label: 'Text', maxLength: 5 }) },
    component: () => null,
  });

  it('shows the server issues, links them to the entry, stays unsaved and stores nothing', async () => {
    const store = createMemoryStore({ pages: [doc()] });
    const content = createContent({ store, collections: [pages], bricks: [strictHeading, bricks[1]!] });
    const stored = async () => (await content.get('pages', { slug: 'home' }))?.entries?.[0]?.data.text;
    setup((next) => content.save('pages', next));
    type('Much too long');
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    flush();
    fireEvent.click(saveButton());
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved: fix this problem first.');
    expect(status()).toBe('Unsaved changes');
    expect(await stored()).toBe('Welcome');
    fireEvent.click(screen.getByRole('button', { name: 'Heading 1 › text: Text must be at most 5 characters' }));
    flush();
    expect(screen.getByRole('button', { name: 'Heading', current: true })).toBeInTheDocument();

    // Fixing it saves.
    type('Short');
    fireEvent.click(saveButton());
    await settle();
    expect(status()).toBe('All changes saved');
    expect(await stored()).toBe('Short');
  });
});

describe('after a save', () => {
  const note = () => screen.queryByText(/Saving moves this document to a new address/);

  it('compares the slug with the one last saved', async () => {
    setup(async () => ({ ok: true }));
    typeInto('Slug', 'welcome');
    expect(note()).toBeInTheDocument();
    fireEvent.click(saveButton());
    await settle();
    expect(note()).not.toBeInTheDocument();
    typeInto('Slug', 'home');
    expect(note()).toBeInTheDocument();
  });

  it('treats a new document as saved once it is created', async () => {
    setup(async () => ({ ok: true }), { source: pages.create('draft'), isNew: true });
    typeInto('Slug', 'other');
    expect(note()).not.toBeInTheDocument();
    fireEvent.click(saveButton());
    await settle();
    expect(status()).toBe('All changes saved');
    typeInto('Slug', 'third');
    expect(note()).toBeInTheDocument();
  });
});
