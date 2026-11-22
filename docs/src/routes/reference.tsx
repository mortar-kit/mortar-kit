// The API reference: /reference lists every export by package, and
// /reference/<name> shows one. Generated from the packages' sources (see
// scripts/reference.mjs), so it isn't editable content.
import { useParams } from '@solidjs/router';
import { createMemo, For, Show } from 'solid-js';

import { DocsNav } from '../layouts/DocsLayout.tsx';
import { Head } from '../layouts/Head.tsx';
import styles from '../layouts/layouts.module.css';
import { NotFound } from '../layouts/NotFound.tsx';
import { Shell } from '../layouts/Shell.tsx';
import { findEntry, listEntries, referenceHref } from '../reference/api.ts';
import { Entry } from '../reference/Entry.tsx';

export function ReferenceIndex() {
  const modules = createMemo(() => listEntries());
  return (
    <Shell>
      <Head title="API reference" description="Every export of the Mortar packages." />
      <div class={styles.docs}>
        <DocsNav />
        <main class={styles.main}>
          <article class={styles.article}>
            <p class={styles.eyebrow}>Reference</p>
            <h1 class={styles.title}>API reference</h1>
            <p class={styles.lead}>Every export of the Mortar packages, generated from their TypeScript sources and comments.</p>
            <For each={modules()}>
              {(group) => (
                <section class={styles.module}>
                  <h2 id={group.module}>
                    <code>{group.module}</code>
                  </h2>
                  <dl class={styles.index}>
                    <For each={group.entries}>
                      {(entry) => (
                        <div>
                          <dt>
                            <a href={referenceHref(entry.name)}>
                              <code>{entry.name}</code>
                            </a>
                            <span class={styles.kind}>{entry.kind}</span>
                          </dt>
                          <dd>{entry.summary}</dd>
                        </div>
                      )}
                    </For>
                  </dl>
                </section>
              )}
            </For>
          </article>
        </main>
      </div>
    </Shell>
  );
}

export function ReferenceEntry() {
  const params = useParams<{ name: string }>();
  const found = createMemo(() => findEntry(params.name));
  return (
    <Shell>
      <Show when={found().entry} fallback={<NotFound what="export with that name" />}>
        {(entry) => (
          <div class={styles.docs}>
            <Head title={entry().name} description={entry().summary.split('\n')[0]} />
            <DocsNav />
            <main class={styles.main}>
              <p class={styles.back}>
                <a href={`/reference#${entry().module}`}>← {entry().module}</a>
              </p>
              <Entry entry={entry()} names={found().names} />
            </main>
          </div>
        )}
      </Show>
    </Shell>
  );
}
