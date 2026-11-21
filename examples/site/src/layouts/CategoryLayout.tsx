// How a category renders: its name and intro, then its products.
import { useContent, type DocOf } from '@mortar-kit/core';
import { createMemo, Loading } from 'solid-js';

import { products, type categories } from '../collections.ts';
import { Head } from './Head.tsx';
import styles from './layouts.module.css';
import { ProductCards } from './ProductCards.tsx';

export function CategoryLayout(props: { category: DocOf<typeof categories> }) {
  const content = useContent();
  const items = createMemo(() => content.list(products, { where: { category: props.category.id } }));
  return (
    <section class={styles.category}>
      <Head title={props.category.fields.name} description={props.category.fields.intro} />
      <header class={styles.header}>
        <h1>{props.category.fields.name}</h1>
        <p>{props.category.fields.intro}</p>
      </header>
      <Loading fallback={<p class={styles.muted}>Loading products…</p>}>
        <ProductCards products={items()} />
      </Loading>
    </section>
  );
}
