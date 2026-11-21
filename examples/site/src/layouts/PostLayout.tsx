// How a post renders: title, date and cover above its body.
import type { DocOf } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';

import type { posts } from '../collections.ts';
import { formatDate } from '../format.ts';
import { Head } from './Head.tsx';
import styles from './layouts.module.css';

export function PostLayout(props: { post: DocOf<typeof posts>; children: JSX.Element }) {
  return (
    <article>
      <Head title={props.post.fields.title} description={props.post.fields.excerpt} />
      <header class={styles.header}>
        <a class={styles.back} href="/posts">
          ← All posts
        </a>
        <h1>{props.post.fields.title}</h1>
        <time datetime={props.post.fields.date}>{formatDate(props.post.fields.date)}</time>
        <Show when={props.post.fields.cover.src}>
          <img class={styles.cover} src={props.post.fields.cover.src} alt={props.post.fields.cover.alt} />
        </Show>
      </header>
      {props.children}
    </article>
  );
}
