// The docs' main brick: a run of Markdown (headings, lists, code, tables).
import { defineBrick, fields } from '@mortar-kit/core';
import { createMemo } from 'solid-js';

import { renderMarkdown } from '../markdown.ts';
import styles from './markdown.module.css';

export const markdown = defineBrick({
  name: 'markdown',
  label: 'Markdown',
  schema: {
    source: fields.textarea({ label: 'Markdown', default: 'Write **Markdown** here.' }),
  },
  component: (props) => {
    const html = createMemo(() => renderMarkdown(props.data.source));
    // oxlint-disable-next-line solid/no-innerhtml -- Rendered from the site's own Markdown (or the reader's edits in their own tab), so trusted; see markdown.ts.
    return <div class={styles.markdown} innerHTML={html()} />;
  },
});
