// Public home page: the stored page rendered with the site's bricks. The
// page loads during SSR (App wraps routes in <Loading>).
import { PageView } from '@mortar-kit/core';
import { createMemo, Show } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { getPage } from '../pages.ts';

export default function Home() {
  const page = createMemo(() => getPage('home'));
  return (
    <main>
      <Show when={page()} fallback={<p>No page stored yet. Open the editor and save one.</p>}>
        {(p) => <PageView bricks={bricks} page={p()} />}
      </Show>
    </main>
  );
}
