// A page of the pages collection, at /<slug> (the home page is "home",
// at /). Read through the app's ContentContext (cached per request).
import { PageView, useContent } from '@mortar-kit/core';
import { useParams } from '@solidjs/router';
import { createMemo, Show } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { pages } from '../collections.ts';
import { NotFound } from '../layouts/NotFound.tsx';
import { PageLayout } from '../layouts/PageLayout.tsx';

/** Renders the page stored under `slug`. */
export function PageRoute(props: { slug: string }) {
  const content = useContent();
  const page = createMemo(() => content.get(pages, { slug: props.slug }));
  return (
    <Show when={page()} fallback={<NotFound what="page" />}>
      {(p) => (
        <main>
          <PageLayout page={p()}>
            <PageView bricks={bricks} entries={p().entries ?? []} doc={{ collection: pages.name, id: p().id }} />
          </PageLayout>
        </main>
      )}
    </Show>
  );
}

export default function Page() {
  const params = useParams<{ slug: string }>();
  return <PageRoute slug={params.slug} />;
}
