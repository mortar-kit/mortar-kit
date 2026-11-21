// @mortar-kit/admin/preview: the preview iframe's side. Render <PreviewPage>
// on an app route (e.g. /admin/preview); it renders the real bricks with the
// site's own styles and shows whatever document the editor posts to it,
// inside the app's layout for that collection when it passes one. Bricks
// that load data read `content`, again after every save. Kept free of
// editor code so the route stays small.
import { ContentContext, PageView, type AnyBrick, type ContentSource, type Doc } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { createSignal, createStore, Errored, onSettled, reconcile, Show } from 'solid-js';

import styles from './preview.module.css';
import { isDocMessage, isHelloMessage, isRefreshMessage, type ReadyMessage } from './protocol.ts';

/** Renders a document of one collection the way the site does, around its rendered body. */
export type PreviewLayout = (doc: Doc, body: JSX.Element) => JSX.Element;

export interface PreviewPageProps {
  /** The same bricks the editor uses. */
  bricks: readonly AnyBrick[];
  /**
   * Where bricks with `load` read content: use uncached reads, so the
   * preview shows what is saved now. Without it such bricks show an error.
   */
  content?: ContentSource;
  /**
   * The site's layout for each collection, by name, e.g. a post's title
   * and date around its body. Without one, a collection with a body
   * previews the body alone.
   */
  layouts?: Readonly<Record<string, PreviewLayout>>;
}

/** Renders the document the parent editor posts; empty until the first message. */
export function PreviewPage(props: PreviewPageProps) {
  const [state, setState] = createStore<{ collection: string; body: boolean; doc: Doc | null }>({ collection: '', body: false, doc: null });
  // Bumped on every save: loaders read it, so they load again.
  const [version, setVersion] = createSignal(0);
  const versioned: ContentSource = {
    list: (collection, options) => props.content!.list(collection, options),
    get: (collection, ref) => props.content!.get(collection, ref),
    track: () => {
      version();
    },
  };

  onSettled(() => {
    const ready: ReadyMessage = { type: 'mortar:ready' };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      if (isHelloMessage(event.data)) window.parent.postMessage(ready, location.origin);
      if (isRefreshMessage(event.data)) setVersion((v) => v + 1);
      if (!isDocMessage(event.data)) return;
      const { collection, body, doc } = event.data;
      setState((s) => {
        s.body = body;
        if (s.doc && s.doc.id === doc.id && s.collection === collection) reconcile(doc, 'id')(s.doc);
        else {
          s.collection = collection;
          s.doc = doc;
        }
      });
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage(ready, location.origin);
    return () => window.removeEventListener('message', onMessage);
  });

  return (
    <ContentContext value={props.content ? versioned : null}>
      {/* Keyed: a layout runs once per document (edits to it flow through its reactive reads), and a failed one gets a fresh start with the next document. */}
      <Show when={state.doc} keyed>
        {(doc) => {
          const body = (
            <PageView
              bricks={props.bricks}
              entries={state.body ? (doc.entries ?? []) : []}
              fallback={(entry) => <MissingBrick name={entry.brick} />}
              loadingFallback={() => <div class={styles.note}>Loading…</div>}
              errorFallback={(entry, error) => <BrickError name={entry.brick} error={error} />}
            />
          );
          return (
            <Errored fallback={(error) => <p role="alert" class={styles.missing}>The preview failed: {String(error())}</p>}>
              <Show
                when={props.layouts?.[state.collection]}
                fallback={
                  <Show when={state.body} fallback={<p role="note" class={styles.note}>There is no preview for this collection.</p>}>
                    {body}
                  </Show>
                }
              >
                {(layout) => layout()(doc, body)}
              </Show>
            </Errored>
          );
        }}
      </Show>
    </ContentContext>
  );
}

/** Placeholder for an entry whose brick isn't defined. */
function MissingBrick(props: { name: string }) {
  return (
    <div role="note" class={styles.missing}>
      Unknown brick "{props.name}": it isn't defined, so the public site renders nothing here.
    </div>
  );
}

/** Placeholder for a brick whose load failed. */
function BrickError(props: { name: string; error: unknown }) {
  return (
    <div role="alert" class={styles.missing}>
      The "{props.name}" brick couldn't load its data: {String(props.error)}
    </div>
  );
}

export type { DocMessage, HelloMessage, ReadyMessage, RefreshMessage } from './protocol.ts';
