// <Editor>: generated forms write to the page, validation shows per field,
// entries can be added, moved, duplicated and removed, and the preview
// iframe receives the page after its ready handshake.
import type { Page } from '@mortar-kit/core';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { Editor } from './Editor.tsx';
import { bricks, page } from './test/bricks.tsx';

function setup(source: Page = page()) {
  const onChange = vi.fn<(page: Page) => void>();
  const result = render(() => <Editor bricks={bricks} page={source} previewUrl="/preview" onChange={onChange} />);
  const last = () => onChange.mock.lastCall?.[0];
  return { ...result, onChange, last };
}

const input = (label: string) => screen.getByLabelText(label, { exact: false }) as HTMLInputElement;
/** Labels of the entries in the sidebar list, in order. */
const entries = () => [...document.querySelectorAll('.mortar-entry')].map((b) => b.textContent);
const click = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  flush();
};

describe('<Editor>', () => {
  it('lists entries and shows the first entry’s form', () => {
    setup();
    expect(entries()).toEqual(['Heading', 'Tags']);
    expect(input('Text').value).toBe('Welcome');
    expect(input('Size').value).toBe('2');
  });

  it('writes text, select and checkbox changes to the page', () => {
    const { last } = setup();
    fireEvent.input(input('Text'), { target: { value: 'Changed' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'loud' } });
    fireEvent.change(input('Shown'), { target: { checked: false } });
    flush();
    expect(last()?.entries[0]?.data).toEqual({ text: 'Changed', size: 2, tone: 'loud', shown: false });
  });

  it('keeps partial numbers in the input and commits complete ones', () => {
    const { last } = setup();
    const size = input('Size');
    fireEvent.input(size, { target: { value: '4' } });
    flush();
    expect(last()?.entries[0]?.data.size).toBe(4);
    fireEvent.input(size, { target: { value: '' } });
    flush();
    expect(size.value).toBe('');
    expect(last()?.entries[0]?.data.size).toBe(4);
  });

  it('commits any finite number and keeps the typed text', () => {
    const { last } = setup();
    const size = input('Size');
    for (const [text, n] of [['0.50', 0.5], ['1e1', 10], ['3.0', 3]] as const) {
      fireEvent.input(size, { target: { value: text } });
      flush();
      expect(last()?.entries[0]?.data.size).toBe(n);
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
    const [latest, setLatest] = createSignal<Page>();
    render(() => (
      <>
        <Editor bricks={bricks} page={page()} previewUrl="/preview" onChange={setLatest} />
        <output data-testid="latest">{latest()?.entries[0]?.data.text as string}</output>
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
    expect(last()?.entries[1]?.data.items).toEqual([{ name: 'new' }, { name: 'b' }]);
    expect(names().map((i) => i.value)).toEqual(['new', 'b']);
  });

  it('adds a brick after the selected entry and shows its form', () => {
    const { last } = setup();
    click('Add Tags');
    expect(entries()).toEqual(['Heading', 'Tags', 'Tags']);
    expect(screen.getByRole('button', { name: 'Tags', current: true })).toBe(document.querySelectorAll('.mortar-entry')[1]);
    expect(last()?.entries[1]?.data).toEqual({ items: [] });
    expect(screen.getByRole('button', { name: 'Add Tag' })).toBeInTheDocument();
    expect((document.querySelector('.mortar-add-menu') as HTMLDetailsElement).open).toBe(false);
  });

  it('moves and duplicates entries', () => {
    const { last } = setup();
    expect(screen.getByRole('button', { name: 'Move Heading 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Tags 2 down' })).toBeDisabled();
    click('Move Heading 1 down');
    expect(entries()).toEqual(['Tags', 'Heading']);
    click('Duplicate Heading 2');
    expect(entries()).toEqual(['Tags', 'Heading', 'Heading']);
    expect(last()?.entries.map((e) => e.data.text)).toEqual([undefined, 'Welcome', 'Welcome']);
    expect(last()?.entries[2]?.id).not.toBe('h');
    // The duplicate is selected: editing it leaves the original alone.
    fireEvent.input(input('Text'), { target: { value: 'Copy' } });
    flush();
    expect(last()?.entries.map((e) => e.data.text)).toEqual([undefined, 'Welcome', 'Copy']);
  });

  it('removes an entry only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { last } = setup();
    click('Remove Heading 1');
    expect(confirm).toHaveBeenCalledWith('Remove "Heading" from the page?');
    expect(entries()).toEqual(['Heading', 'Tags']);
    confirm.mockReturnValue(true);
    click('Remove Heading 1');
    expect(entries()).toEqual(['Tags']);
    expect(last()?.entries.map((e) => e.id)).toEqual(['t']);
    expect(screen.getByRole('button', { name: 'Tags', current: true })).toBeInTheDocument();
    click('Remove Tags 1');
    expect(screen.getByText('This page is empty. Add a brick to start.')).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('lists an unknown brick with a warning and lets it be removed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup({ entries: [{ brick: 'gone', id: 'g', data: { a: 1 } }, ...page().entries] });
    expect(entries()).toEqual(['⚠ Unknown brick "gone"', 'Heading', 'Tags']);
    expect(screen.getByText(/No brick named "gone" is defined/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate Unknown brick "gone" 1' })).toBeDisabled();
    click('Remove Unknown brick "gone" 1');
    expect(entries()).toEqual(['Heading', 'Tags']);
    expect(input('Text').value).toBe('Welcome');
    confirm.mockRestore();
  });

  it('posts the page to the preview after it reports ready, and on every change', () => {
    const { container } = setup();
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe('/preview');
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'mortar:ready' }, origin: 'https://evil.test', source: frame.contentWindow }));
    flush();
    expect(post).not.toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'mortar:ready' }, origin: location.origin, source: frame.contentWindow }));
    flush();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.lastCall?.[0]).toMatchObject({ type: 'mortar:page', page: { entries: [{ id: 'h' }, { id: 't' }] } });
    expect(post.mock.lastCall?.[1]).toBe(location.origin);

    fireEvent.input(input('Text'), { target: { value: 'Live' } });
    flush();
    expect(post).toHaveBeenCalledTimes(2);
    const sent = post.mock.lastCall?.[0] as { page: Page } | undefined;
    expect(sent?.page.entries[0]?.data.text).toBe('Live');
  });
});
