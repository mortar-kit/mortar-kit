// Public home page: the stored "home" page rendered with the site's bricks,
// with its title and description in the document head. The page loads
// during SSR (App wraps routes in <Loading>).
import { PageView } from '@mortar-kit/core';
import { Meta, Title } from '@solidjs/meta';
import { createMemo, Show } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { pages } from '../collections.ts';
import { getDoc } from '../content.ts';

export default function Home() {
  const page = createMemo(() => getDoc('pages', { slug: 'home' }));
  return (
    <main>
      <Show when={page()} fallback={<p>No page stored yet. Open the editor and save one.</p>}>
        {(p) => (
          <>
            <PageHead fields={p().fields} />
            <PageView bricks={bricks} entries={p().entries ?? []} />
          </>
        )}
      </Show>
    </main>
  );
}

/** The page's title and description as head tags. */
function PageHead(props: { fields: Record<string, unknown> }) {
  const fields = createMemo(() => pages.normalize(props.fields));
  return (
    <>
      <Title>{fields().title}</Title>
      <Show when={fields().description}>{(description) => <Meta name="description" content={description()} />}</Show>
    </>
  );
}
