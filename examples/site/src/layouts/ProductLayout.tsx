// How a product renders: name, price, image and description, with a link
// to its category (read through the reference; nothing if it's missing).
import { useContent, type DocOf } from '@mortar-kit/core';
import { createMemo, Loading, Show } from 'solid-js';

import { categories, type products } from '../collections.ts';
import { formatPrice } from '../format.ts';
import { Head } from './Head.tsx';
import styles from './layouts.module.css';

export function ProductLayout(props: { product: DocOf<typeof products> }) {
  const content = useContent();
  const category = createMemo(() => (props.product.fields.category ? content.get(categories, { id: props.product.fields.category }) : null));
  return (
    <article class={styles.product}>
      <Head title={props.product.fields.name} description={props.product.fields.description} />
      <Show when={props.product.fields.image.src}>
        <img class={styles.cover} src={props.product.fields.image.src} alt={props.product.fields.image.alt} />
      </Show>
      <div>
        <Loading>
          <Show when={category()}>
            {(c) => (
              <a class={styles.back} href={`/categories/${c().slug}`}>
                {c().fields.name}
              </a>
            )}
          </Show>
        </Loading>
        <h1>{props.product.fields.name}</h1>
        <p class={styles.price}>{formatPrice(props.product.fields.price)}</p>
        <p>{props.product.fields.description}</p>
      </div>
    </article>
  );
}
