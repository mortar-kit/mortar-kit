// Example brick that loads data: the newest posts, each with its excerpt
// and a link to its page.
import { defineBrick, fields } from '@mortar-kit/core';
import { For, Show } from 'solid-js';

import { posts } from '../collections.ts';
import { formatDate } from '../format.ts';
import styles from './latest-posts.module.css';

export const latestPosts = defineBrick({
  name: 'latest-posts',
  label: 'Latest posts',
  schema: {
    heading: fields.text({ label: 'Heading', default: 'Latest posts' }),
    limit: fields.number({ label: 'How many', min: 1, max: 12, default: 3 }),
  },
  load: (data, content) => content.list(posts, { limit: data.limit }),
  component: (props) => (
    <section class={styles.posts}>
      <Show when={props.data.heading}>
        <h2>{props.data.heading}</h2>
      </Show>
      <Show when={props.loaded.length > 0} fallback={<p class={styles.empty}>No posts yet.</p>}>
        <ul>
          <For each={props.loaded}>
            {(post) => (
              <li>
                <a href={`/posts/${post.slug}`}>{post.fields.title}</a>
                <time datetime={post.fields.date}>{formatDate(post.fields.date)}</time>
                <Show when={post.fields.excerpt}>
                  <p>{post.fields.excerpt}</p>
                </Show>
              </li>
            )}
          </For>
        </ul>
        <a class={styles.all} href="/posts">
          All posts
        </a>
      </Show>
    </section>
  ),
});
