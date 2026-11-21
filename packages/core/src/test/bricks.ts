// Bricks shared by core's node tests (no JSX: the components render nothing).
import { defineBrick } from '../brick.ts';
import { defineCollection } from '../collection.ts';
import { fields } from '../fields.ts';

export const heading = defineBrick({
  name: 'heading',
  schema: {
    text: fields.text({ label: 'Text', required: true, default: 'Hello' }),
    size: fields.number({ label: 'Size', min: 1, max: 6, default: 2 }),
  },
  component: () => null,
});

export const bricks = [heading];

export const posts = defineCollection({
  name: 'posts',
  label: 'Posts',
  fields: {
    title: fields.text({ label: 'Title', required: true, default: 'Untitled' }),
    date: fields.date({ label: 'Date' }),
  },
  body: true,
  sort: { field: 'date', order: 'desc' },
  reservedSlugs: ['admin'],
});

export const categories = defineCollection({
  name: 'categories',
  label: 'Categories',
  fields: { name: fields.text({ label: 'Name', required: true }) },
});
