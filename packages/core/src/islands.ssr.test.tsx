// Islands on the server: on a page rendered without JavaScript, each entry
// of an interactive brick renders in an island carrying what the browser
// needs (data, loaded value, entry reference, submission), and createRender
// adds the hydration bootstrap and the client entry only to pages that have
// one. Pages that hydrate as a whole render interactive bricks in place.
import type { ViteManifest } from '@solidjs/vite-plugin';
import { createRequestEvent, renderToStream } from '@solidjs/web';
import { provideRequestEvent } from '@solidjs/web/storage';
import { NoHydration } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { BrickActionsContext, type BrickActions } from './actions.tsx';
import { defineBrick } from './brick.ts';
import { ClientScripts } from './ClientScripts.tsx';
import { ContentContext } from './content.ts';
import { fields } from './fields.ts';
import type { IslandPayload } from './islands.tsx';
import { PageView } from './PageView.tsx';
import { createRender } from './render.tsx';
import { createMemoryStore, createContent } from './store.ts';

const counter = defineBrick({
  name: 'counter',
  interactive: true,
  schema: { label: fields.text({ label: 'Label', default: 'Count' }), secret: fields.text({ label: 'Secret', private: true }) },
  load: async (data) => ({ start: data.label.length }),
  action: async () => ({ ok: true }),
  component: (props) => (
    <button type="button">
      {props.data.label} {props.loaded?.start} {props.submission?.result ? 'sent' : 'idle'}
    </button>
  ),
});

const text = defineBrick({
  name: 'text',
  schema: { body: fields.text({ label: 'Body' }) },
  component: (props) => <p>{props.data.body}</p>,
});

const entries = [
  { brick: 'text', id: 't1', data: { body: 'Static' } },
  { brick: 'counter', id: 'c1', data: { label: 'Clicks', secret: 'inbox@example.com' } },
  { brick: 'counter', id: 'c2', data: {} },
];

const content = createContent({ store: createMemoryStore(), collections: [], bricks: [] });

const actions: BrickActions = {
  action: (ref) => `/post/${ref.entry}`,
  useSubmission: (ref) => () => (ref().entry === 'c2' ? { pending: false, result: { ok: true } } : undefined),
};

function Page() {
  return (
    <ContentContext value={content}>
      <BrickActionsContext value={actions}>
        <main>
          <PageView bricks={[counter, text]} entries={entries} doc={{ collection: 'pages', id: 'home' }} />
        </main>
      </BrickActionsContext>
    </ContentContext>
  );
}

/** The payloads of the page's islands, in order. */
function payloads(html: string): IslandPayload[] {
  return [...html.matchAll(/data-mortar-island="([^"]*)"/g)].map((m) => JSON.parse(m[1]!.replaceAll('&quot;', '"').replaceAll('&amp;', '&')));
}

describe('islands in PageView', () => {
  it('put each interactive entry of a page without JavaScript in its own island', async () => {
    const html = await renderToStream(() => (
      <NoHydration>
        <Page />
      </NoHydration>
    ));
    expect(html).toContain('<p>Static</p>');
    const [first, second] = payloads(html);
    expect(payloads(html)).toHaveLength(2);
    expect(first).toEqual({ id: first!.id, brick: 'counter', data: { label: 'Clicks', secret: '' }, loaded: { start: 6 }, ref: { collection: 'pages', doc: 'home', entry: 'c1' } });
    expect(second).toMatchObject({ brick: 'counter', data: { label: 'Count', secret: '' }, loaded: { start: 5 }, submission: { pending: false, result: { ok: true } } });
    expect(first!.id).not.toBe(second!.id);
    // A private field never reaches the page.
    expect(html).not.toContain('inbox@example.com');
    // The brick itself renders inside the island, as it would anywhere.
    expect(html).toMatch(/data-mortar-island="[^"]*" style="display:contents"><button type="button">Clicks 6 idle<\/button><\/div>/);
    expect(html).toContain('Count 5 sent');
  });

  it('render interactive bricks in place on pages that hydrate as a whole', async () => {
    const html = await renderToStream(() => <Page />);
    expect(html).not.toContain('data-mortar-island');
    expect(html).toContain('Clicks 6 idle');
  });
});

describe('createRender with islands', () => {
  const manifest = { _base: '/', 'src/entry-client.tsx': { file: 'assets/entry.js', isEntry: true } } as unknown as ViteManifest;
  const doc = (body: () => unknown) => () => (
    <html>
      <head>
        <ClientScripts />
      </head>
      <body>{body() as never}</body>
    </html>
  );
  const render = (app: () => unknown, path: string, context: Record<string, unknown>) => {
    const request = new Request(`http://site.test${path}`);
    const created = createRender({ manifest, app: doc(app) as never });
    return provideRequestEvent(createRequestEvent(request), () => created(request, context as never)) as Promise<string>;
  };

  it('adds the hydration bootstrap and the client entry to a page with islands', async () => {
    const html = await render(() => <Page />, '/', { nonce: 'n0nce', clientEntry: '/assets/entry.js' });
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain('<script nonce="n0nce">window._$HY');
    expect(head).toContain('<script type="module" src="/assets/entry.js" nonce="n0nce"></script>');
    // Ids count up per request.
    expect(payloads(html).map((p) => p.id)).toEqual(['mi1-', 'mi2-']);
    // No Solid hydration data: islands carry their own.
    expect(html).not.toContain('_$HY.r');
  });

  it('keeps a page without islands free of scripts', async () => {
    const html = await render(() => <p>Hello</p>, '/', { nonce: 'n0nce', clientEntry: '/assets/entry.js' });
    expect(html).not.toContain('<script');
  });
});
