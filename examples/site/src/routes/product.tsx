// One product, at /products/<slug>.
import { useContent } from '@mortar-kit/core';
import { useParams } from '@solidjs/router';
import { createMemo, Show } from 'solid-js';

import { products } from '../collections.ts';
import { NotFound } from '../layouts/NotFound.tsx';
import { ProductLayout } from '../layouts/ProductLayout.tsx';

export default function Product() {
  const params = useParams<{ slug: string }>();
  const content = useContent();
  const product = createMemo(() => content.get(products, { slug: params.slug }));
  return (
    <Show when={product()} fallback={<NotFound what="product" />}>
      {(p) => (
        <main>
          <ProductLayout product={p()} />
        </main>
      )}
    </Show>
  );
}
