// A guide of the docs collection, at /docs/<slug>; /docs is the first one.
import { PageView, useContent } from '@mortar-kit/core';
import { useParams } from '@solidjs/router';
import { createMemo, Show } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { docs } from '../collections.ts';
import { DocsLayout } from '../layouts/DocsLayout.tsx';
import { NotFound } from '../layouts/NotFound.tsx';
import { Shell } from '../layouts/Shell.tsx';

/** Renders the guide stored under `slug`. */
export function GuideRoute(props: { slug: string }) {
  const content = useContent();
  const guide = createMemo(() => content.get(docs, { slug: props.slug }));
  return (
    <Show
      when={guide()}
      fallback={
        <Shell>
          <NotFound what="guide" />
        </Shell>
      }
    >
      {(g) => (
        <DocsLayout guide={g()}>
          <PageView bricks={bricks} entries={g().entries ?? []} />
        </DocsLayout>
      )}
    </Show>
  );
}

export default function Guide() {
  const params = useParams<{ slug: string }>();
  return <GuideRoute slug={params.slug} />;
}

/** /docs: the introduction. */
export function GuideIndex() {
  return <GuideRoute slug="introduction" />;
}
