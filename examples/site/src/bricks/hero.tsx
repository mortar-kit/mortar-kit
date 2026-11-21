// Example brick: a page-top hero with a heading, intro text and one button.
import { defineBrick, fields } from '@mortar-kit/core';
import { Show } from 'solid-js';

import styles from './hero.module.css';

export const hero = defineBrick({
  name: 'hero',
  label: 'Hero',
  schema: {
    heading: fields.text({ label: 'Heading', required: true, default: 'Build pages from bricks' }),
    intro: fields.textarea({ label: 'Intro', default: 'Define your sections once, then compose pages from them.' }),
    ctaLabel: fields.text({ label: 'Button label', default: 'Get started' }),
    ctaHref: fields.url({ label: 'Button link', default: '/' }),
    align: fields.select({ label: 'Alignment', options: { center: 'Centre', left: 'Left' } }),
  },
  component: (props) => (
    <section class={styles.hero} data-align={props.data.align}>
      <h1>{props.data.heading}</h1>
      <Show when={props.data.intro}>
        <p>{props.data.intro}</p>
      </Show>
      <Show when={props.data.ctaLabel && props.data.ctaHref}>
        <a class={styles.button} href={props.data.ctaHref}>
          {props.data.ctaLabel}
        </a>
      </Show>
    </section>
  ),
});
