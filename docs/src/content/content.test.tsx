// The docs' content in the browser: pages read the published content, a
// save through the admin's content lands in session storage, showEdits()
// makes pages read again (as after hydration), and resetEdits() brings
// back the published site.
import { ContentContext, useContent } from '@mortar-kit/core';
import { render } from '@solidjs/testing-library';
import { createMemo, flush, Loading } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';

import { docs } from '../collections.ts';
import { editableContent, hasEdits, resetEdits, showEdits, source } from './content.ts';

function Title() {
  const content = useContent();
  const guide = createMemo(() => content.get(docs, { slug: 'introduction' }));
  return <h1>{guide()?.fields.title}</h1>;
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flush();
};

afterEach(() => {
  resetEdits();
  sessionStorage.clear();
});

describe('docs content in the browser', () => {
  it('shows this tab’s edits after showEdits(), and the published site after resetEdits()', async () => {
    const { container } = render(() => (
      <ContentContext value={source}>
        <Loading>
          <Title />
        </Loading>
      </ContentContext>
    ));
    await settle();
    expect(container.querySelector('h1')?.textContent).toBe('Introduction');

    const guide = await editableContent.get('docs', { slug: 'introduction' });
    expect(await editableContent.save('docs', { ...guide, fields: { ...guide!.fields, title: 'My intro' } })).toEqual({ ok: true });
    expect(sessionStorage.getItem('mortar-docs:changes')).toContain('My intro');
    await settle();
    flush();
    expect(hasEdits()).toBe(true);
    // Saving doesn't make pages read again (the admin refreshes itself)…
    expect(container.querySelector('h1')?.textContent).toBe('Introduction');
    // …loading a page does.
    showEdits();
    await settle();
    expect(container.querySelector('h1')?.textContent).toBe('My intro');

    resetEdits();
    await settle();
    expect(hasEdits()).toBe(false);
    expect(sessionStorage.getItem('mortar-docs:changes')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('Introduction');
  });
});
