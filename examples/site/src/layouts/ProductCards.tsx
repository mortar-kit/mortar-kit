// A grid of product cards, each linking to its product page.
import type { DocSummary, InferFields } from '@mortar-kit/core';
import { For, Show } from 'solid-js';

import { products } from '../collections.ts';
import { formatPrice } from '../format.ts';
import styles from './layouts.module.css';

type Product = DocSummary<InferFields<typeof products.fields>>;

export function ProductCards(props: { products: readonly Product[] }) {
  return (
    <Show when={props.products.length > 0} fallback={<p class={styles.muted}>No products yet.</p>}>
      <ul class={styles.cards}>
        <For each={props.products}>
          {(product) => (
            <li class={styles.card}>
              <Show when={product.fields.image.src}>
                <img src={product.fields.image.src} alt={product.fields.image.alt} />
              </Show>
              <a href={products.urlOf(product)}>{product.fields.name}</a>
              <span class={styles.price}>{formatPrice(product.fields.price)}</span>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
