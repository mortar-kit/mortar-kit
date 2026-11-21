// Bricks, collections and a document shared by the admin tests.
import { defineBrick, defineCollection, fields, type Doc } from '@mortar-kit/core';
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

/** A collection with a body, like a site's pages. */
export const pages = defineCollection({
  name: 'pages',
  label: 'Pages',
  fields: { title: fields.text({ label: 'Title', required: true, default: 'Untitled' }) },
  body: true,
  reservedSlugs: ['admin'],
});

/** A collection without a body: documents are fields only. */
export const authors = defineCollection({
  name: 'authors',
  label: 'Authors',
  fields: {
    name: fields.text({ label: 'Name', required: true, default: '' }),
    bio: fields.text({ label: 'Bio' }),
  },
});

/** A saved page with a heading and a tags entry. */
export const doc = (): Doc => ({
  id: 'home-id',
  slug: 'home',
  fields: { title: 'Home' },
  entries: [
    { brick: 'heading', id: 'h', data: { text: 'Welcome' } },
    { brick: 'tags', id: 't', data: { items: [{ name: 'a' }, { name: 'b' }] } },
  ],
});

/** A saved author (no body). */
export const author = (): Doc => ({ id: 'ada-id', slug: 'ada', fields: { name: 'Ada' } });
