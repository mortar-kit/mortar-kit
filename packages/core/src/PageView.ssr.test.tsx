// Server rendering of <PageView> (node project: SSR codegen, isServer true).
import { renderToString } from '@solidjs/web';
import { describe, expect, it } from 'vitest';

import { defineBrick } from './brick.ts';
import { fields } from './fields.ts';
import { PageView } from './PageView.tsx';
import { createMemoryStore, loadPage } from './store.ts';

const heading = defineBrick({
  name: 'heading',
  schema: { text: fields.text({ label: 'Text' }) },
  component: (props) => <h2>{props.data.text}</h2>,
});

describe('<PageView> on the server', () => {
  it('renders brick markup to HTML', () => {
    const html = renderToString(() => (
      <PageView bricks={[heading]} page={{ entries: [{ brick: 'heading', id: 'a', data: { text: 'Hello SSR' } }] }} />
    ));
    expect(html).toContain('Hello SSR');
    expect(html).toContain('<h2');
  });
});

describe('a stored page on the server', () => {
  it('loads through a store and renders', async () => {
    const store = createMemoryStore({ home: { entries: [{ brick: 'heading', id: 'a', data: { text: 'Stored page' } }] } });
    const page = await loadPage(store, [heading], 'home');
    const html = renderToString(() => <PageView bricks={[heading]} page={page!} />);
    expect(html).toContain('Stored page');
  });
});
