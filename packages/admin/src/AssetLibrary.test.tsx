// Assets in the admin: the rail's Assets view (upload, filter, delete,
// refused while a document uses the file) and an image field's picker,
// against createContent over memory stores.
import { createContent, createMemoryBlobStore, createMemoryStore, defineCollection, fields, type Doc } from '@mortar-kit/core';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Admin } from './Admin.tsx';
import { bricks } from './test/bricks.tsx';

const people = defineCollection({
  name: 'people',
  label: 'People',
  fields: { name: fields.text({ label: 'Name', required: true }), photo: fields.image({ label: 'Photo' }) },
});

async function settle() {
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  flush();
}

function setup(withBlobs = true) {
  const store = createMemoryStore({ people: [{ id: 'ada-id', slug: 'ada', fields: { name: 'Ada' } }] });
  const blobs = createMemoryBlobStore();
  const content = createContent({ store, blobs: withBlobs ? blobs : undefined, collections: [people], bricks });
  render(() => <Admin bricks={bricks} collections={[people]} content={content} previewUrl="/preview" />);
  return { store, blobs, content };
}

const nav = () => within(screen.getByRole('navigation', { name: 'Content' }));
const file = (name: string, type = 'image/png') => new File([new Uint8Array([1, 2, 3])], name, { type });
const upload = async (scope: HTMLElement, ...files: File[]) => {
  const input = scope.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
  await settle();
};
const tiles = (scope = document.body) => within(scope).queryAllByRole('listitem').filter((li) => li.closest('[aria-label="Assets"]') && li.parentElement?.getAttribute('aria-label') === 'Assets');
const tileNames = (scope?: HTMLElement) => tiles(scope).map((li) => li.querySelector('[title]')?.textContent);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('assets in <Admin>', () => {
  it('has no Assets button without a blob store', async () => {
    setup(false);
    await settle();
    expect(nav().queryByRole('button', { name: 'Assets' })).toBeNull();
  });

  it('uploads, filters and deletes files in the Assets view', async () => {
    const { blobs } = setup();
    await settle();
    fireEvent.click(nav().getByRole('button', { name: 'Assets' }));
    await settle();
    expect(nav().getByRole('button', { name: 'Assets', current: true })).toBeInTheDocument();
    expect(screen.getByText('No images, videos, audio or PDFs yet.')).toBeInTheDocument();
    const library = screen.getByRole('region', { name: 'Asset library' });
    await upload(library, file('Team Photo.png'), file('notes.txt', 'text/plain'));
    expect(tileNames()).toEqual(['team-photo.png']);
    expect(within(library).getByRole('alert').textContent).toContain(`"notes.txt" isn't a file type`);
    expect((await blobs.list()).length).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    await settle();
    expect(tileNames()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'All files' }));
    await settle();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete team-photo.png' }));
    await settle();
    expect(tileNames()).toEqual([]);
    expect(await blobs.list()).toEqual([]);
  });

  it('picks an uploaded image for a field, stores its key, and refuses to delete it while used', async () => {
    const { store, content } = setup();
    const uploaded = await content.assets!.upload(file('portrait.png'));
    const key = uploaded.ok ? uploaded.asset.key : '';
    await settle();
    fireEvent.click(within(screen.getByRole('list', { name: 'People documents' })).getByRole('button', { name: 'Ada' }));
    await settle();
    const photo = screen.getByRole('group', { name: 'Photo' });
    fireEvent.click(within(photo).getByRole('button', { name: 'Choose…' }));
    await settle();
    const dialog = screen.getByRole('dialog', { name: 'Choose: Photo' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose portrait.png' }));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(photo.querySelector('img')?.getAttribute('src')).toBe(`/uploads/${key}`);
    expect(within(photo).queryByLabelText('Or a URL')).toBeNull();
    expect(within(photo).getByRole('button', { name: 'Replace…' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();
    expect(((await store.get('people', 'ada')) as Doc).fields.photo).toEqual({ src: '', alt: '', asset: key });

    fireEvent.click(nav().getByRole('button', { name: 'Assets' }));
    await settle();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete portrait.png' }));
    await settle();
    const alert = within(screen.getByRole('region', { name: 'Asset library' })).getByRole('alert');
    expect(alert.textContent).toContain(`Can't delete "portrait.png"`);
    fireEvent.click(within(alert).getByRole('button', { name: 'People › Ada › photo' }));
    await settle();
    expect(screen.getByRole('group', { name: 'Photo' })).toBeInTheDocument();
  });

  it('uploads into the picker and picks the file', async () => {
    setup();
    await settle();
    fireEvent.click(within(screen.getByRole('list', { name: 'People documents' })).getByRole('button', { name: 'Ada' }));
    await settle();
    const photo = screen.getByRole('group', { name: 'Photo' });
    fireEvent.click(within(photo).getByRole('button', { name: 'Choose…' }));
    await settle();
    const dialog = screen.getByRole('dialog', { name: 'Choose: Photo' });
    await upload(dialog, file('clip.mp4', 'video/mp4'));
    expect(within(dialog).getByRole('alert').textContent).toContain(`isn't one of the images this takes`);
    await upload(dialog, file('new.jpg', 'image/jpeg'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(photo.querySelector('img')?.getAttribute('src')).toMatch(/^\/uploads\/new-[a-z0-9]{6}\.jpg$/);
    fireEvent.click(within(photo).getByRole('button', { name: 'Remove' }));
    flush();
    expect(photo.querySelector('img')).toBeNull();
    expect(within(photo).getByLabelText('Or a URL')).toBeInTheDocument();
  });
});
