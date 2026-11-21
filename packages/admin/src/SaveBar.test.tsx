// Saving from <Editor>: dirty state, the saving state, local and server
// validation problems, failures, the keyboard shortcut and the
// leave-page warning.
import type { Page, SaveResult } from '@mortar-kit/core';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { Editor } from './Editor.tsx';
import { bricks, page } from './test/bricks.tsx';

function setup(onSave: (page: Page) => Promise<SaveResult | void>) {
  const save = vi.fn(onSave);
  render(() => <Editor bricks={bricks} page={page()} previewUrl="/preview" onSave={save} />);
  return save;
}

const status = () => screen.getByRole('status').textContent;
const saveButton = () => screen.getByRole('button', { name: 'Save' });
const type = (value: string) => {
  fireEvent.input(screen.getByLabelText('Text', { exact: false }), { target: { value } });
  flush();
};
/** Lets the action's promise settle, then applies its writes. */
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flush();
}

describe('saving', () => {
  it('has no save controls without onSave', () => {
    render(() => <Editor bricks={bricks} page={page()} previewUrl="/preview" />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('marks edits as unsaved and saves the page', async () => {
    const save = setup(async () => ({ ok: true }));
    expect(status()).toBe('All changes saved');
    expect(saveButton()).toBeDisabled();

    type('Changed');
    expect(status()).toBe('Unsaved changes');
    fireEvent.click(saveButton());
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.lastCall?.[0].entries[0]?.data.text).toBe('Changed');
    expect(status()).toBe('All changes saved');
    expect(saveButton()).toBeDisabled();

    type('Welcome');
    expect(status()).toBe('Unsaved changes');
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

  it('does not call onSave when the page is invalid, and links problems to entries', async () => {
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
