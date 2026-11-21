// Bricks shared by core's node tests (no JSX: the components render nothing).
import { defineBrick } from '../brick.ts';
import { fields } from '../fields.ts';
import type { Page } from '../page.ts';

export const heading = defineBrick({
  name: 'heading',
  schema: {
    text: fields.text({ label: 'Text', required: true, default: 'Hello' }),
    size: fields.number({ label: 'Size', min: 1, max: 6, default: 2 }),
  },
  component: () => null,
});

export const bricks = [heading];

export const page = (): Page => ({
  entries: [
    { brick: 'heading', id: 'a', data: { text: 'First' } },
    { brick: 'heading', id: 'b', data: { text: 'Second', size: 3 } },
  ],
});
