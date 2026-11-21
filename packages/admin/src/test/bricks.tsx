// Bricks shared by the admin tests.
import { defineBrick, fields, type Page } from '@mortar-kit/core';
import { For } from 'solid-js';

export const heading = defineBrick({
  name: 'heading',
  label: 'Heading',
  schema: {
    text: fields.text({ label: 'Text', required: true, default: 'Hello' }),
    size: fields.number({ label: 'Size', min: 1, max: 6, default: 2 }),
    tone: fields.select({ label: 'Tone', options: { plain: 'Plain', loud: 'Loud' } }),
    shown: fields.boolean({ label: 'Shown', default: true }),
  },
  component: (props) => <h2 data-tone={props.data.tone}>{props.data.text}</h2>,
});

export const tags = defineBrick({
  name: 'tags',
  label: 'Tags',
  schema: {
    items: fields.list({
      label: 'Tags',
      max: 3,
      of: fields.object({ label: 'Tag', fields: { name: fields.text({ label: 'Name', default: 'new' }) } }),
    }),
  },
  component: (props) => (
    <ul>
      <For each={props.data.items}>{(item) => <li>{item.name}</li>}</For>
    </ul>
  ),
});

export const bricks = [heading, tags];

export const page = (): Page => ({
  entries: [
    { brick: 'heading', id: 'h', data: { text: 'Welcome' } },
    { brick: 'tags', id: 't', data: { items: [{ name: 'a' }, { name: 'b' }] } },
  ],
});
