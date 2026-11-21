// Server rendering of <PageView> (node project: SSR codegen, isServer true).
import { renderToString } from '@solidjs/web';
import { describe, expect, it } from 'vitest';

import { defineBrick } from './brick.ts';
import { defineCollection } from './collection.ts';
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
