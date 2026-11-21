// One post, at /posts/<slug>: its layout around its brick body.
import { PageView, useContent } from '@mortar-kit/core';
import { useParams } from '@solidjs/router';
import { createMemo, Show } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { posts } from '../collections.ts';
import { NotFound } from '../layouts/NotFound.tsx';
import { PostLayout } from '../layouts/PostLayout.tsx';

export default function Post() {
  const params = useParams<{ slug: string }>();
  const content = useContent();
  const post = createMemo(() => content.get(posts, { slug: params.slug }));
  return (
    <Show when={post()} fallback={<NotFound what="post" />}>
      {(p) => (
        <main>
          <PostLayout post={p()}>
            <PageView bricks={bricks} entries={p().entries ?? []} />
          </PostLayout>
        </main>
      )}
    </Show>
  );
}
