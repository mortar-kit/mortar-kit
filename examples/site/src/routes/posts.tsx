// Every post, newest first, with its date and excerpt.
import { useContent } from '@mortar-kit/core';
import { createMemo, For } from 'solid-js';

import { posts } from '../collections.ts';
import { formatDate } from '../format.ts';
import { Head } from '../layouts/Head.tsx';
import styles from '../layouts/layouts.module.css';

export default function Posts() {
  const content = useContent();
  const list = createMemo(() => content.list(posts));
  return (
    <main>
      <Head title="Posts" description="Everything we've written." />
      <header class={styles.header}>
        <a class={styles.back} href="/">
          ← Home
        </a>
        <h1>Posts</h1>
      </header>
      <ul class={[styles.list, styles.header]}>
        <For each={list()}>
          {(post) => (
            <li>
              <a href={`/posts/${post.slug}`}>{post.fields.title}</a>
              <time datetime={post.fields.date}>{formatDate(post.fields.date)}</time>
              <p>{post.fields.excerpt}</p>
            </li>
          )}
        </For>
      </ul>
    </main>
  );
}
