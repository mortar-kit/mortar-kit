// The docs site's collections. `docs` holds every guide: a title and
// description for the head, a section and position for the sidebar, and a
// body of bricks (mostly Markdown). `pages` holds the few pages outside the
// guides, such as the home page.
import { defineCollection, fields } from '@mortar-kit/core';

/** Sidebar sections, in the order the sidebar shows them. */
export const sections = {
  start: 'Getting started',
  guides: 'Guides',
  admin: 'The admin',
  advanced: 'Going further',
} as const;

export const docs = defineCollection({
  name: 'docs',
  label: 'Docs',
  fields: {
    title: fields.text({ label: 'Title', required: true, maxLength: 80, default: 'Untitled guide' }),
    description: fields.textarea({ label: 'Description', help: 'Shown under the title and in search results.', maxLength: 200 }),
    section: fields.select({ label: 'Section', options: sections }),
    order: fields.number({ label: 'Position', help: 'Lower numbers come first in their section.', step: 1, default: 100 }),
  },
  body: true,
  sort: { field: 'order' },
});

export const pages = defineCollection({
  name: 'pages',
  label: 'Pages',
  fields: {
    title: fields.text({ label: 'Title', required: true, maxLength: 80, default: 'Untitled page' }),
    description: fields.textarea({ label: 'Description', maxLength: 200 }),
  },
  body: true,
});

/** Every collection, in the order the admin lists them. */
export const collections = [docs, pages] as const;
