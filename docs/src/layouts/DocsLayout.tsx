// A guide: the sidebar of every guide by section, then the guide's title,
// description and body, with links to the previous and next guides and to
// edit it in the admin.
import type { DocOf, DocSummary } from '@mortar-kit/core';
import { useContent } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { createMemo, For, Show } from 'solid-js';

import { docs, sections } from '../collections.ts';
import { Head } from './Head.tsx';
import styles from './layouts.module.css';
import { NavLink } from './NavLink.tsx';
import { Shell } from './Shell.tsx';

type Guide = DocSummary<DocOf<typeof docs>['fields']>;

/** Guides grouped by section, in sidebar order. */
function bySection(guides: Guide[]): { section: string; label: string; guides: Guide[] }[] {
  return Object.entries(sections)
    .map(([section, label]) => ({ section, label, guides: guides.filter((g) => g.fields.section === section) }))
    .filter((group) => group.guides.length > 0);
}

export const guideHref = (slug: string) => `/docs/${slug}`;

/** The sidebar of guides; also used by pages that aren't guides (the reference). */
export function DocsNav(props: { children?: JSX.Element }) {
  const content = useContent();
  const groups = createMemo(async () => bySection(await content.list(docs)));
  return (
    <nav class={styles.sidebar} aria-label="Guides">
      <For each={groups()}>
        {(group) => (
          <div class={styles.group}>
            <p class={styles.groupLabel}>{group.label}</p>
            <ul>
              <For each={group.guides}>
                {(guide) => (
                  <li>
                    <NavLink href={guideHref(guide.slug)}>{guide.fields.title}</NavLink>
                  </li>
                )}
              </For>
            </ul>
          </div>
        )}
      </For>
      {props.children}
    </nav>
  );
}

export function DocsLayout(props: { guide: DocOf<typeof docs>; children: JSX.Element }) {
  const content = useContent();
  // Previous and next in sidebar order.
  const around = createMemo(async () => {
    const id = props.guide.id;
    const all = bySection(await content.list(docs)).flatMap((g) => g.guides);
    const at = all.findIndex((g) => g.id === id);
    return { prev: at > 0 ? all[at - 1] : undefined, next: at >= 0 ? all[at + 1] : undefined };
  });
  return (
    <Shell>
      <Head title={props.guide.fields.title} description={props.guide.fields.description} />
      <div class={styles.docs}>
        <DocsNav />
        <main class={styles.main}>
          <article class={styles.article}>
            <p class={styles.eyebrow}>{sections[props.guide.fields.section]}</p>
            <h1 class={styles.title}>{props.guide.fields.title}</h1>
            <Show when={props.guide.fields.description}>
              <p class={styles.lead}>{props.guide.fields.description}</p>
            </Show>
            {props.children}
          </article>
          <footer class={styles.footer}>
            <a class={styles.edit} href={`/admin?collection=docs&id=${encodeURIComponent(props.guide.id)}`}>
              Edit this page
            </a>
            <div class={styles.pager}>
              <Show when={around().prev}>
                {(prev) => (
                  <a href={guideHref(prev().slug)} rel="prev">
                    <span>Previous</span>
                    {prev().fields.title}
                  </a>
                )}
              </Show>
              <Show when={around().next}>
                {(next) => (
                  <a href={guideHref(next().slug)} rel="next" class={styles.next}>
                    <span>Next</span>
                    {next().fields.title}
                  </a>
                )}
              </Show>
            </div>
          </footer>
        </main>
      </div>
    </Shell>
  );
}
