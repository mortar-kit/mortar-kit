// Example brick: a video, uploaded or linked, with an optional caption.
import { defineBrick, fields } from '@mortar-kit/core';
import { Show } from 'solid-js';

import styles from './video.module.css';

export const video = defineBrick({
  name: 'video',
  label: 'Video',
  schema: {
    video: fields.file({ label: 'Video', accept: ['video'], required: true }),
    caption: fields.text({ label: 'Caption' }),
  },
  component: (props) => (
    <figure class={styles.video}>
      <Show when={props.data.video.src}>
        <video src={props.data.video.src} controls preload="metadata" />
      </Show>
      <Show when={props.data.caption}>
        <figcaption>{props.data.caption}</figcaption>
      </Show>
    </figure>
  ),
});
