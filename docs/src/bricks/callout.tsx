// A highlighted note, tip or warning beside the text. Its body is Markdown.
import { defineBrick, fields } from '@mortar-kit/core';
import { createMemo, Show } from 'solid-js';

import { renderMarkdown } from '../markdown.ts';
import styles from './callout.module.css';

export const callout = defineBrick({
  name: 'callout',
  label: 'Callout',
  schema: {
    tone: fields.select({ label: 'Tone', options: { note: 'Note', tip: 'Tip', warning: 'Warning' } }),
    title: fields.text({ label: 'Title' }),
    body: fields.textarea({ label: 'Text (Markdown)', default: 'Something worth knowing.' }),
  },
  component: (props) => {
    const html = createMemo(() => renderMarkdown(props.data.body));
    return (
      <aside class={styles.callout} data-tone={props.data.tone}>
        <Show when={props.data.title}>
          <p class={styles.title}>{props.data.title}</p>
        </Show>
        {/* oxlint-disable-next-line solid/no-innerhtml -- Rendered from the site's own Markdown (or the reader's edits in their own tab), so trusted; see markdown.ts. */}
        <div class={styles.body} innerHTML={html()} />
      </aside>
    );
  },
});
