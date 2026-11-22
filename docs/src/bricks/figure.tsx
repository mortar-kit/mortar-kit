// An image with an optional caption: uploaded through the admin's asset
// library (kept in this tab, like every edit) or linked by URL.
import { defineBrick, fields } from '@mortar-kit/core';
import { Show } from 'solid-js';

import styles from './figure.module.css';

export const figure = defineBrick({
  name: 'figure',
  label: 'Figure',
  schema: {
    image: fields.image({ label: 'Image', required: true }),
    caption: fields.text({ label: 'Caption' }),
  },
  component: (props) => (
    <figure class={styles.figure}>
      <Show when={props.data.image.src}>
        <img src={props.data.image.src} alt={props.data.image.alt} />
      </Show>
      <Show when={props.data.caption}>
        <figcaption>{props.data.caption}</figcaption>
      </Show>
    </figure>
  ),
});
