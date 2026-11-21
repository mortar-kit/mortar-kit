// The site's collections. Pages are documents too: a title and description
// for the head, plus a brick body.
import { defineCollection, fields } from '@mortar-kit/core';

export const pages = defineCollection({
  name: 'pages',
  label: 'Pages',
  fields: {
    title: fields.text({ label: 'Title', required: true, maxLength: 70, default: 'Untitled page' }),
    description: fields.textarea({ label: 'Description', help: 'Shown in search results and link previews.', maxLength: 160 }),
  },
  body: true,
  // Route segments of the app, which a page slug would clash with.
  reservedSlugs: ['admin'],
});

/** Every collection, in the order the admin lists them. */
export const collections = [pages] as const;
