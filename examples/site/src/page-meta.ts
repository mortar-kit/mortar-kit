// The page-level data every page of this site has: a title and a
// description, edited under "Page settings" in the editor and rendered into
// the document head by the routes.
import { definePageMeta, fields } from '@mortar-kit/core';

export const pageMeta = definePageMeta({
  title: fields.text({ label: 'Title', required: true, maxLength: 70, default: 'Untitled page' }),
  description: fields.textarea({ label: 'Description', help: 'Shown in search results and link previews.', maxLength: 160 }),
});
