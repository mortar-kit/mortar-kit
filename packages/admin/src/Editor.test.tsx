// <Editor>: generated forms write to the page, validation shows per field,
// and the preview iframe receives the page after its ready handshake.
import type { Page } from '@mortar-kit/core';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { Editor } from './Editor.tsx';
import { bricks, page } from './test/bricks.tsx';

function setup() {
  const onChange = vi.fn<(page: Page) => void>();
  const result = render(() => <Editor bricks={bricks} page={page()} previewUrl="/preview" onChange={onChange} />);
  const last = () => onChange.mock.lastCall?.[0];
  return { ...result, onChange, last };
}

const input = (label: string) => screen.getByLabelText(label, { exact: false }) as HTMLInputElement;

describe('<Editor>', () => {
  it('lists entries and shows the first entry’s form', () => {
    setup();
    expect(screen.getAllByRole('button', { name: /Heading|Tags/ }).map((b) => b.textContent)).toEqual(['Heading', 'Tags']);
    expect(input('Text').value).toBe('Welcome');
    expect(input('Size').value).toBe('2');
  });

  it('writes text, select and checkbox changes to the page', () => {
    const { last } = setup();
    fireEvent.input(input('Text'), { target: { value: 'Changed' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'loud' } });
    fireEvent.change(input('Shown'), { target: { checked: false } });
    flush();
    expect(last()?.[0]?.data).toEqual({ text: 'Changed', size: 2, tone: 'loud', shown: false });
  });

  it('keeps partial numbers in the input and commits complete ones', () => {
    const { last } = setup();
    const size = input('Size');
    fireEvent.input(size, { target: { value: '4' } });
    flush();
    expect(last()?.[0]?.data.size).toBe(4);
    fireEvent.input(size, { target: { value: '' } });
    flush();
    expect(size.value).toBe('');
    expect(last()?.[0]?.data.size).toBe(4);
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
    expect(last()?.[1]?.data.items).toEqual([{ name: 'new' }, { name: 'b' }]);
    expect(names().map((i) => i.value)).toEqual(['new', 'b']);
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
    expect(post.mock.lastCall?.[0]).toMatchObject({ type: 'mortar:page', page: [{ id: 'h' }, { id: 't' }] });
    expect(post.mock.lastCall?.[1]).toBe(location.origin);

    fireEvent.input(input('Text'), { target: { value: 'Live' } });
    flush();
    expect(post).toHaveBeenCalledTimes(2);
    const sent = post.mock.lastCall?.[0] as { page: Page } | undefined;
    expect(sent?.page[0]?.data.text).toBe('Live');
  });
});
