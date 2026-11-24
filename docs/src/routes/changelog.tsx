// /changelog: CHANGELOG.md from the repository, with each release's
// additions and its upgrading notes. Not editable content: it changes with
// the code, in the same pull request.
import { createMemo } from 'solid-js';

import markdownStyles from '../bricks/markdown.module.css';
import { changelogBody } from '../changelog.ts';
import { highlighter } from '../highlight/index.ts';
import { DocsNav } from '../layouts/DocsLayout.tsx';
import { Head } from '../layouts/Head.tsx';
import styles from '../layouts/layouts.module.css';
import { Shell } from '../layouts/Shell.tsx';
import { renderMarkdown } from '../markdown.ts';

export default function Changelog() {
  const html = createMemo(() => renderMarkdown(changelogBody, highlighter()));
  return (
    <Shell>
      <Head title="Changelog" description="What each Mortar release adds, and what to change when you upgrade." />
      <div class={styles.docs}>
        <DocsNav />
        <main class={styles.main}>
          <article class={styles.article}>
            <p class={styles.eyebrow}>Releases</p>
            <h1 class={styles.title}>Changelog</h1>
            {/* oxlint-disable-next-line solid/no-innerhtml -- The repository's own CHANGELOG.md, rendered by markdown.ts. */}
            <div class={markdownStyles.markdown} innerHTML={html()} />
          </article>
        </main>
      </div>
    </Shell>
  );
}
