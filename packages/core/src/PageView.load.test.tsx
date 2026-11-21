// Bricks that load data, in the browser: the loading fallback, re-loading
// only when the data the loader read changes (keeping the old result until
// the new one lands), other entries staying live meanwhile, and errors.
import { render } from '@solidjs/testing-library';
import { createStore, flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { defineBrick } from './brick.ts';
import { defineCollection } from './collection.ts';
import { ContentContext } from './content.ts';
import type { DocSummary } from './doc.ts';
import type { PageEntry } from './entries.ts';
import { fields } from './fields.ts';
import { PageView } from './PageView.tsx';
import type { ContentSource, ListOptions } from './store.ts';

const posts = defineCollection({ name: 'posts', fields: { title: fields.text({ label: 'Title' }) } });

const latest = defineBrick({
  name: 'latest',
  schema: { heading: fields.text({ label: 'Heading', default: 'Latest' }), limit: fields.number({ label: 'Limit', default: 2 }) },
  load: (data, content) => content.list(posts, { limit: data.limit }),
  component: (props) => (
    <section>
      <h2>{props.data.heading}</h2>
      <p class="titles">{props.loaded.map((post) => post.fields.title).join(', ')}</p>
    </section>
  ),
});

const note = defineBrick({ name: 'note', schema: { text: fields.text({ label: 'Text' }) }, component: (props) => <p class="note">{props.data.text}</p> });

/** A source whose list calls wait until `answer` (or `fail`) is called. */
function slowSource() {
  const pending: { options?: ListOptions; resolve: (docs: DocSummary[]) => void; reject: (e: unknown) => void }[] = [];
  const list = vi.fn(
    (_collection: string, options?: ListOptions) =>
      new Promise<DocSummary[]>((resolve, reject) => {
        pending.push({ options, resolve, reject });
      }),
  );
  const source: ContentSource = { list, get: async () => null };
  const titles = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, slug: `p${i}`, fields: { title: `Post ${i + 1}` } }));
  return {
    source,
    list,
    answer: async () => {
      const call = pending.shift()!;
      call.resolve(titles(call.options?.limit ?? 0));
      await Promise.resolve();
      await Promise.resolve();
      flush();
    },
    fail: async (error: unknown) => {
      pending.shift()!.reject(error);
      await Promise.resolve();
      await Promise.resolve();
      flush();
    },
  };
}

function setup(source: ContentSource, extra: Partial<Parameters<typeof PageView>[0]> = {}) {
  const [state, setState] = createStore<{ entries: PageEntry[] }>({
    entries: [
      { brick: 'latest', id: 'l', data: { heading: 'Latest', limit: 2 } },
      { brick: 'note', id: 'n', data: { text: 'Hello' } },
    ],
  });
  const result = render(() => (
    <ContentContext value={source}>
      <PageView bricks={[latest, note]} entries={state.entries} loadingFallback={() => <p class="loading">Loading…</p>} {...extra} />
    </ContentContext>
  ));
  const text = (selector: string) => result.container.querySelector(selector)?.textContent;
  const edit = (fn: (entries: PageEntry[]) => void) => {
    setState((s) => fn(s.entries));
    flush();
  };
  return { ...result, text, edit };
}

describe('a brick with load', () => {
  it('shows the loading fallback, then what it loaded', async () => {
    const slow = slowSource();
    const { text } = setup(slow.source);
    flush();
    expect(text('.loading')).toBe('Loading…');
    expect(text('.note')).toBe('Hello');
    await slow.answer();
    expect(text('.loading')).toBeUndefined();
    expect(text('.titles')).toBe('Post 1, Post 2');
    expect(slow.list).toHaveBeenCalledWith('posts', { limit: 2 });
  });

  it('loads again only when data the loader read changes, keeping the old result meanwhile', async () => {
    const slow = slowSource();
    const { text, edit } = setup(slow.source);
    flush();
    await slow.answer();
    edit((entries) => {
      entries[0]!.data.heading = 'Recent';
    });
    expect(text('h2')).toBe('Recent');
    expect(slow.list).toHaveBeenCalledTimes(1);

    edit((entries) => {
      entries[0]!.data.limit = 3;
    });
    expect(slow.list).toHaveBeenCalledTimes(2);
    expect(text('.loading')).toBeUndefined();
    expect(text('.titles')).toBe('Post 1, Post 2');
    // Other entries stay live while the load is in flight.
    edit((entries) => {
      entries[1]!.data.text = 'Still live';
    });
    expect(text('.note')).toBe('Still live');
    await slow.answer();
    expect(text('.titles')).toBe('Post 1, Post 2, Post 3');
  });

  it('shows the error fallback when a load fails, and recovers when the data changes', async () => {
    const slow = slowSource();
    const { text, edit } = setup(slow.source, { errorFallback: (entry, error) => <p class="error">{`${entry.id}: ${String(error)}`}</p> });
    flush();
    await slow.fail(new Error('offline'));
    expect(text('.error')).toBe('l: Error: offline');
    expect(text('.note')).toBe('Hello');
    edit((entries) => {
      entries[0]!.data.limit = 1;
    });
    await slow.answer();
    expect(text('.error')).toBeUndefined();
    expect(text('.titles')).toBe('Post 1');
  });

  it('explains a missing ContentContext', () => {
    const { container } = render(() => (
      <PageView bricks={[latest]} entries={[{ brick: 'latest', id: 'l', data: {} }]} errorFallback={(_, error) => <p class="error">{String(error)}</p>} />
    ));
    flush();
    expect(container.querySelector('.error')?.textContent).toContain('brick "latest" loads data; provide a ContentContext');
  });
});
