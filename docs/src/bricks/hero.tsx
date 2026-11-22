// The home page's opening: a heading, a line of intro and up to two links.
import { defineBrick, fields } from '@mortar-kit/core';
import { Show } from 'solid-js';

import styles from './hero.module.css';

export const hero = defineBrick({
  name: 'hero',
  label: 'Hero',
  schema: {
    heading: fields.text({ label: 'Heading', required: true, default: 'Mortar' }),
    intro: fields.textarea({ label: 'Intro' }),
    primaryLabel: fields.text({ label: 'Main button', default: 'Get started' }),
    primaryHref: fields.url({ label: 'Main button link', default: '/docs/introduction' }),
    secondaryLabel: fields.text({ label: 'Second button' }),
    secondaryHref: fields.url({ label: 'Second button link' }),
  },
  component: (props) => (
    <section class={styles.hero}>
      <h1>{props.data.heading}</h1>
      <Show when={props.data.intro}>
        <p class={styles.intro}>{props.data.intro}</p>
      </Show>
      <div class={styles.actions}>
        <Show when={props.data.primaryLabel && props.data.primaryHref}>
          <a class={styles.primary} href={props.data.primaryHref}>
            {props.data.primaryLabel}
          </a>
        </Show>
        <Show when={props.data.secondaryLabel && props.data.secondaryHref}>
          <a class={styles.secondary} href={props.data.secondaryHref}>
            {props.data.secondaryLabel}
          </a>
        </Show>
      </div>
    </section>
  ),
});
