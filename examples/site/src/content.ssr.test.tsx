// The example's content on the server, without JavaScript: a post rendered
// through its layout with a brick that loads the latest posts, over a
// memory store, under <NoHydration> with noScripts as public pages are.
import { createContent, createMemoryStore, PageView, ContentContext, type DocOf } from '@mortar-kit/core';
import { renderToStream } from '@solidjs/web';
import { NoHydration } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { bricks } from './bricks/index.ts';
import { collections, type posts } from './collections.ts';
import { PostLayout } from './layouts/PostLayout.tsx';

const post = (slug: string, title: string, date: string): DocOf<typeof posts> => ({
  id: slug,
  slug,
  fields: { title, date, excerpt: `About ${title}`, cover: { src: '', alt: '', title: '', asset: '' } },
  entries: [],
});

describe('a post page without JavaScript', () => {
  it('renders the layout and loaded bricks into plain HTML', async () => {
    const first = post('first', 'First post', '2026-01-01');
    const second = post('second', 'Second post', '2026-02-01');
    const content = createContent({ store: createMemoryStore({ posts: [first, second] }), collections, bricks });
    const html = await renderToStream(
      () => (
        <NoHydration>
          <ContentContext value={content}>
            <PostLayout post={second}>
              <PageView bricks={bricks} entries={[{ brick: 'latest-posts', id: 'l', data: { heading: 'More', limit: 5 } }]} />
            </PostLayout>
          </ContentContext>
        </NoHydration>
      ),
      { noScripts: true },
    );
    expect(html).toContain('<h1>Second post</h1>');
    expect(html).toContain('1 February 2026');
    expect(html.indexOf('/posts/second')).toBeLessThan(html.indexOf('/posts/first'));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('_hk');
  });
});
