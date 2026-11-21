// Public home page: the stored page rendered with the site's bricks, with
// its title and description in the document head. The page loads during
// SSR (App wraps routes in <Loading>).
import { PageView } from '@mortar-kit/core';
import { Meta, Title } from '@solidjs/meta';
import { createMemo, Show } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { pageMeta } from '../page-meta.ts';
import { getPage } from '../pages.ts';

export default function Home() {
  const page = createMemo(() => getPage('home'));
  return (
    <main>
      <Show when={page()} fallback={<p>No page stored yet. Open the editor and save one.</p>}>
        {(p) => (
          <>
            <PageHead meta={p().meta} />
            <PageView bricks={bricks} page={p()} />
          </>
        )}
      </Show>
    </main>
  );
}

/** The page's title and description as head tags. */
function PageHead(props: { meta: Record<string, unknown> | undefined }) {
  const meta = createMemo(() => pageMeta.normalize(props.meta));
  return (
    <>
      <Title>{meta().title}</Title>
      <Show when={meta().description}>{(description) => <Meta name="description" content={description()} />}</Show>
    </>
  );
}
