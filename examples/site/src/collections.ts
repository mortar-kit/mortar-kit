// The site's collections. Pages are documents too (a title and description
// for the head, plus a brick body); posts have a body as well; categories
// and products are plain data, with each product referencing its category.
import { defineCollection, fields } from '@mortar-kit/core';

export const pages = defineCollection({
  name: 'pages',
  label: 'Pages',
  fields: {
    title: fields.text({ label: 'Title', required: true, maxLength: 70, default: 'Untitled page' }),
    description: fields.textarea({ label: 'Description', help: 'Shown in search results and link previews.', maxLength: 160 }),
  },
  body: true,
  // The app's own route segments, which a page at /:slug would clash with.
  reservedSlugs: ['admin', 'posts', 'products', 'categories'],
});

export const posts = defineCollection({
  name: 'posts',
  label: 'Posts',
  fields: {
    title: fields.text({ label: 'Title', required: true, maxLength: 120, default: 'Untitled post' }),
    date: fields.date({ label: 'Published', required: true, default: '2026-01-01' }),
    excerpt: fields.textarea({ label: 'Excerpt', help: 'Shown in post lists.', maxLength: 200 }),
    cover: fields.image({ label: 'Cover image' }),
  },
  body: true,
  sort: { field: 'date', order: 'desc' },
});

export const categories = defineCollection({
  name: 'categories',
  label: 'Categories',
  fields: {
    name: fields.text({ label: 'Name', required: true, default: 'New category' }),
    intro: fields.textarea({ label: 'Intro' }),
  },
});

export const products = defineCollection({
  name: 'products',
  label: 'Products',
  fields: {
    name: fields.text({ label: 'Name', required: true, default: 'New product' }),
    price: fields.number({ label: 'Price', min: 0, step: 0.01 }),
    category: fields.reference({ label: 'Category', collection: 'categories', required: true }),
    image: fields.image({ label: 'Image' }),
    description: fields.textarea({ label: 'Description' }),
  },
});

/** Every collection, in the order the admin lists them. */
export const collections = [pages, posts, products, categories] as const;
