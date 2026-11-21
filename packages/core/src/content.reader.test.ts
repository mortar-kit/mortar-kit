// contentReader: typed reads by collection object, with options cleaned so
// they can cross a server function (plain JSON, no undefined values).
import { describe, expect, it, vi } from 'vitest';

import { contentReader } from './content.ts';
import type { ContentSource } from './store.ts';
import { posts } from './test/bricks.ts';

describe('contentReader', () => {
  it('reads by collection name and drops undefined options', async () => {
    const list = vi.fn<ContentSource['list']>(async () => []);
    const get = vi.fn<ContentSource['get']>(async () => null);
    const reader = contentReader({ list, get });
    await reader.list(posts);
    await reader.list(posts, { where: undefined, limit: 3 });
    await reader.list(posts, { where: { title: 'A', date: undefined as never }, sort: { field: 'date', order: undefined } });
    await reader.get(posts, { slug: 'a' });
    expect(list.mock.calls).toEqual([['posts'], ['posts', { limit: 3 }], ['posts', { where: { title: 'A' }, sort: { field: 'date' } }]]);
    expect(get.mock.calls).toEqual([['posts', { slug: 'a' }]]);
    expect(JSON.stringify(list.mock.calls[1]?.[1])).toBe('{"limit":3}');
  });
});
