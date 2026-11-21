// One category and its products, at /categories/<slug>.
import { useContent } from '@mortar-kit/core';
import { useParams } from '@solidjs/router';
import { createMemo, Show } from 'solid-js';

import { categories } from '../collections.ts';
import { CategoryLayout } from '../layouts/CategoryLayout.tsx';
import { NotFound } from '../layouts/NotFound.tsx';

export default function Category() {
  const params = useParams<{ slug: string }>();
  const content = useContent();
  const category = createMemo(() => content.get(categories, { slug: params.slug }));
  return (
    <Show when={category()} fallback={<NotFound what="category" />}>
      {(c) => (
        <main>
          <CategoryLayout category={c()} />
        </main>
      )}
    </Show>
  );
}
