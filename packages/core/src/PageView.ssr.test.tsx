// Server rendering of <PageView> (node project: SSR codegen, isServer true).
import { renderToStream, renderToString } from '@solidjs/web';
import { For, NoHydration } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { defineBrick } from './brick.ts';
import { defineCollection } from './collection.ts';
import { ContentContext } from './content.ts';
import { fields } from './fields.ts';
import { PageView } from './PageView.tsx';
import { createContent, createMemoryStore } from './store.ts';

const heading = defineBrick({
  name: 'heading',
  schema: { text: fields.text({ label: 'Text' }) },
  component: (props) => <h2>{props.data.text}</h2>,
});

describe('<PageView> on the server', () => {
  it('renders brick markup to HTML', () => {
    const html = renderToString(() => <PageView bricks={[heading]} entries={[{ brick: 'heading', id: 'a', data: { text: 'Hello SSR' } }]} />);
    expect(html).toContain('Hello SSR');
    expect(html).toContain('<h2');
  });
});

describe('a stored document on the server', () => {
  it('loads through the content rules and renders its body', async () => {
    const pages = defineCollection({ name: 'pages', fields: { title: fields.text({ label: 'Title' }) }, body: true });
    const store = createMemoryStore({ pages: [{ id: 'home', slug: 'home', fields: {}, entries: [{ brick: 'heading', id: 'a', data: { text: 'Stored page' } }] }] });
    const content = createContent({ store, collections: [pages], bricks: [heading] });
    const doc = await content.get('pages', { slug: 'home' });
    const html = renderToString(() => <PageView bricks={[heading]} entries={doc!.entries ?? []} />);
    expect(html).toContain('Stored page');
  });
});

describe('a brick with load on the server', () => {
  const posts = defineCollection({ name: 'posts', fields: { title: fields.text({ label: 'Title' }) } });
  const latest = defineBrick({
    name: 'latest',
    schema: { limit: fields.number({ label: 'Limit', default: 2 }) },
    load: (data, content) => content.list(posts, { limit: data.limit }),
    component: (props) => (
      <ul>
        <For each={props.loaded}>{(post) => <li>{post.fields.title}</li>}</For>
      </ul>
    ),
  });
  const content = () =>
    createContent({
      store: createMemoryStore({
        posts: [
          { id: 'a', slug: 'a', fields: { title: 'Alpha' } },
          { id: 'b', slug: 'b', fields: { title: 'Beta' } },
          { id: 'c', slug: 'c', fields: { title: 'Gamma' } },
        ],
      }),
      collections: [posts],
      bricks: [latest],
    });

  it('renders the loaded data into a page without scripts', async () => {
    const html = await renderToStream(
      () => (
        <NoHydration>
          <ContentContext value={content()}>
            <PageView bricks={[latest]} entries={[{ brick: 'latest', id: 'l', data: { limit: 2 } }]} loadingFallback={() => <p>Loading</p>} />
          </ContentContext>
        </NoHydration>
      ),
      { noScripts: true },
    );
    expect(html).toContain('<li>Alpha</li><li>Beta</li>');
    expect(html).not.toContain('Gamma');
    expect(html).not.toContain('Loading');
    expect(html).not.toContain('<script');
  });

  it('types what load returns as props.loaded', () => {
    defineBrick({
      name: 'typed',
      schema: {},
      load: async () => ({ count: 3 }),
      component: (props) => (
        <p>
          {props.loaded.count satisfies number}
          {
            // @ts-expect-error -- not part of what load returns
            props.loaded.missing
          }
        </p>
      ),
    });
    defineBrick({
      name: 'plain',
      schema: {},
      component: (props) => <p>{String(props.loaded satisfies undefined)}</p>,
    });
  });
});
