// Server rendering of <PageView> (node project: SSR codegen, isServer true).
import { renderToString } from '@solidjs/web';
import { describe, expect, it } from 'vitest';

import { defineBrick } from './brick.ts';
import { fields } from './fields.ts';
import { PageView } from './PageView.tsx';

const heading = defineBrick({
  name: 'heading',
  schema: { text: fields.text({ label: 'Text' }) },
  component: (props) => <h2>{props.data.text}</h2>,
});

describe('<PageView> on the server', () => {
  it('renders brick markup to HTML', () => {
    const html = renderToString(() => (
      <PageView bricks={[heading]} page={[{ brick: 'heading', id: 'a', data: { text: 'Hello SSR' } }]} />
    ));
    expect(html).toContain('Hello SSR');
    expect(html).toContain('<h2');
  });
});
