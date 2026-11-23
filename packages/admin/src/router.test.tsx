// <AdminRoute>: the admin's location in the URL's search parameters, and
// the leave guard: router navigation away from unsaved changes asks first.
import { createContent, createMemoryStore, type Doc } from '@mortar-kit/core';
import { createRouter, memoryHistory, useNavigate } from '@solidjs/router';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminRoute } from './router.tsx';
import { authors, bricks, doc, pages } from './test/bricks.tsx';

const collections = [pages, authors];

async function settle() {
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  flush();
}

function setup(start: string, confirmLeave: (question: string) => boolean) {
  const store = createMemoryStore({ pages: [doc(), { id: 'about-id', slug: 'about', fields: { title: 'About' }, entries: [] } as Doc] });
  const content = createContent({ store, collections, bricks });
  const history = memoryHistory(start);
  let navigate!: (to: string) => void;
  function Page() {
    navigate = useNavigate();
    return <AdminRoute bricks={bricks} collections={collections} content={content} previewUrl="/preview" confirmLeave={confirmLeave} />;
  }
  function Elsewhere() {
    return <p>Elsewhere</p>;
  }
  const Router = createRouter({ history, routes: [{ path: '/admin', component: Page }, { path: '/elsewhere', component: Elsewhere }] });
  render(() => <Router />);
  return { history, go: (to: string) => navigate(to), store };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('<AdminRoute>', () => {
  it('opens the document the URL names, and puts the open document in the URL', async () => {
    const { history } = setup('/admin?collection=pages&id=about-id', () => true);
    await settle();
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('about');
    history.set({ value: '/admin?collection=pages&id=home-id' });
    await settle();
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('home');
  });

  it('asks before leaving unsaved changes, and stays when told to', async () => {
    const confirmLeave = vi.fn(() => false);
    const { history, go } = setup('/admin?collection=pages&id=about-id', confirmLeave);
    await settle();
    fireEvent.input(screen.getByLabelText('Slug'), { target: { value: 'about-us' } });
    flush();
    await settle();
    expect(screen.getByRole('status').textContent).toBe('Unsaved changes');
    go('/elsewhere');
    await new Promise((resolve) => setTimeout(resolve, 150));
    await settle();
    expect(confirmLeave).toHaveBeenCalledWith('Leave the editor? Your unsaved changes will be lost.');
    expect(history.get()).toBe('/admin?collection=pages&id=about-id');

    confirmLeave.mockReturnValue(true);
    go('/elsewhere');
    await new Promise((resolve) => setTimeout(resolve, 150));
    await settle();
    expect(history.get()).toBe('/elsewhere');
  });

  it('leaves without asking when nothing is unsaved', async () => {
    const confirmLeave = vi.fn(() => false);
    const { history, go } = setup('/admin?collection=pages&id=about-id', confirmLeave);
    await settle();
    go('/elsewhere');
    await settle();
    expect(confirmLeave).not.toHaveBeenCalled();
    expect(history.get()).toBe('/elsewhere');
  });
});
