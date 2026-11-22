// A grid of linked cards, e.g. the home page's ways into the docs.
import { defineBrick, fields } from '@mortar-kit/core';
import { For, Show } from 'solid-js';

import styles from './cards.module.css';

export const cards = defineBrick({
  name: 'cards',
  label: 'Cards',
  schema: {
    heading: fields.text({ label: 'Heading' }),
    items: fields.list({
      label: 'Cards',
      max: 9,
      of: fields.object({
        label: 'Card',
        fields: {
          title: fields.text({ label: 'Title', required: true, default: 'A card' }),
          text: fields.textarea({ label: 'Text' }),
          href: fields.url({ label: 'Link' }),
        },
      }),
    }),
  },
  component: (props) => (
    <section class={styles.cards}>
      <Show when={props.data.heading}>
        <h2>{props.data.heading}</h2>
      </Show>
      <div class={styles.grid}>
        <For each={props.data.items}>
          {(item) => (
            <a class={styles.card} href={item.href || undefined}>
              <strong>{item.title}</strong>
              <Show when={item.text}>
                <span>{item.text}</span>
              </Show>
            </a>
          )}
        </For>
      </div>
    </section>
  ),
});
