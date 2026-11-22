// The home page: the page stored as "home".
import { PageView, useContent } from '@mortar-kit/core';
import { createMemo, Show } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { pages } from '../collections.ts';
import { Head } from '../layouts/Head.tsx';
import styles from '../layouts/layouts.module.css';
import { NotFound } from '../layouts/NotFound.tsx';
import { Shell } from '../layouts/Shell.tsx';

export default function Home() {
  const content = useContent();
  const page = createMemo(() => content.get(pages, { slug: 'home' }));
  return (
    <Shell>
      <Show when={page()} fallback={<NotFound what="home page" />}>
        {(p) => (
          <main class={styles.page}>
            <Head title={p().fields.title} description={p().fields.description} />
            <PageView bricks={bricks} entries={p().entries ?? []} />
          </main>
        )}
      </Show>
    </Shell>
  );
}
