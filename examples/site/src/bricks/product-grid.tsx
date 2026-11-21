// Example brick that loads data: products, all or of one category (picked
// from the categories collection), as a grid of cards.
import { defineBrick, fields } from '@mortar-kit/core';
import { Show } from 'solid-js';

import { products } from '../collections.ts';
import { ProductCards } from '../layouts/ProductCards.tsx';
import styles from './product-grid.module.css';

export const productGrid = defineBrick({
  name: 'product-grid',
  label: 'Product grid',
  schema: {
    heading: fields.text({ label: 'Heading', default: 'Products' }),
    category: fields.reference({ label: 'Category', collection: 'categories', help: 'None shows every category.' }),
    limit: fields.number({ label: 'How many', min: 1, max: 24, default: 6 }),
  },
  load: (data, content) => content.list(products, { where: data.category ? { category: data.category } : undefined, limit: data.limit }),
  component: (props) => (
    <section class={styles.grid}>
      <Show when={props.data.heading}>
        <h2>{props.data.heading}</h2>
      </Show>
      <ProductCards products={props.loaded} />
    </section>
  ),
});
