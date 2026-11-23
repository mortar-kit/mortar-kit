// Content.runAction: the server side of brick forms. It reads the entry's
// stored data itself; the browser only names the entry.
import { describe, expect, it } from 'vitest';

import { defineBrick, type ActionContext, type ActionInput } from './brick.ts';
import { defineCollection } from './collection.ts';
import { fields } from './fields.ts';
import { createContent, createMemoryStore } from './store.ts';

const seen: ActionInput<{ to: string }>[] = [];
const contact = defineBrick({
  name: 'contact',
  schema: { to: fields.text({ label: 'To', default: 'inbox@example.com' }) },
  action: (input) => {
    seen.push(input);
    return { got: input.form.get('name'), to: input.data.to };
  },
  component: () => null,
});
const heading = defineBrick({ name: 'heading', schema: {}, component: () => null });
const pages = defineCollection({ name: 'pages', label: 'Pages', fields: {}, body: true });
const tags = defineCollection({ name: 'tags', label: 'Tags', fields: {} });

function setup() {
  const store = createMemoryStore({
    pages: [
      {
        id: 'p1',
        slug: 'contact',
        fields: {},
        entries: [
          { brick: 'contact', id: 'c1', data: { to: 'sales@example.com' } },
          { brick: 'contact', id: 'c2', data: {} },
          { brick: 'heading', id: 'h1', data: {} },
        ],
      },
    ],
  });
  seen.length = 0;
  return createContent({ store, collections: [pages, tags], bricks: [contact, heading] });
}

const form = (fieldsIn: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fieldsIn)) data.append(k, v);
  return data;
};

describe('runAction', () => {
  it("calls the entry's brick action with the stored, normalized data", async () => {
    const content = setup();
    const request = new Request('http://site.test/');
    const context = { anything: 1 } as ActionContext;
    expect(await content.runAction({ collection: 'pages', doc: 'p1', entry: 'c1' }, form({ name: 'Ada' }), { request, context })).toEqual({
      got: 'Ada',
      to: 'sales@example.com',
    });
    expect(seen[0]?.request).toBe(request);
    expect(seen[0]?.context).toBe(context);
    expect(await content.runAction({ collection: 'pages', doc: 'p1', entry: 'c2' }, form({}))).toEqual({ got: null, to: 'inbox@example.com' });
    expect(seen[1]?.context).toEqual({});
  });

  it('takes a plain form post (URLSearchParams) as FormData', async () => {
    const content = setup();
    await content.runAction({ collection: 'pages', doc: 'p1', entry: 'c1' }, new URLSearchParams({ name: 'Grace' }));
    expect(seen[0]?.form).toBeInstanceOf(FormData);
    expect(seen[0]?.form.get('name')).toBe('Grace');
  });

  it('refuses references to no entry, or to an entry without an action', async () => {
    const content = setup();
    const bad: unknown[] = [
      { collection: 'pages', doc: 'p1', entry: 'h1' },
      { collection: 'pages', doc: 'p1', entry: 'nope' },
      { collection: 'pages', doc: 'nope', entry: 'c1' },
      { collection: 'tags', doc: 'p1', entry: 'c1' },
      { collection: 'nope', doc: 'p1', entry: 'c1' },
      { collection: 'pages', doc: 1, entry: 'c1' },
      null,
      'pages/p1/c1',
    ];
    for (const ref of bad) await expect(content.runAction(ref as never, form({}))).rejects.toThrow(/names no entry/);
    await expect(content.runAction({ collection: 'pages', doc: 'p1', entry: 'c1' }, { name: 'x' } as never)).rejects.toThrow(/posted form/);
    expect(seen).toEqual([]);
  });

  it('passes on what the action throws', async () => {
    const boom = defineBrick({
      name: 'boom',
      schema: {},
      action: (): Promise<string> => Promise.reject(new Error('down')),
      component: () => null,
    });
    const store = createMemoryStore({ pages: [{ id: 'p', slug: 'p', fields: {}, entries: [{ brick: 'boom', id: 'b', data: {} }] }] });
    const content = createContent({ store, collections: [pages], bricks: [boom] });
    await expect(content.runAction({ collection: 'pages', doc: 'p', entry: 'b' }, new FormData())).rejects.toThrow('down');
  });
});
