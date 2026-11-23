// @mortar-kit/admin/preview: the preview iframe's side. Render <PreviewPage>
// on an app route (e.g. /admin/preview); it renders the real bricks with the
// site's own styles and shows whatever document the editor posts to it,
// inside the app's layout for that collection when it passes one. Bricks
// that load data read `content`, again after every save. Kept free of
// editor code so the route stays small. A collection without a layout
// previews as <DocPreview> (its fields, then its body) when the page is
// given the collections. Clicking a brick selects it in the
// editor, and links are followed with ⌘/Ctrl-click (see PreviewPicker).
import { brickMap, ContentContext, PageView, type AnyBrick, type AnyCollection, type ContentSource, type Doc } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, createStore, Errored, onSettled, reconcile, Show } from 'solid-js';

import { DocPreview } from './DocPreview.tsx';
import styles from './preview.module.css';
import { PreviewPicker } from './PreviewPicker.tsx';
import { isDocMessage, isHelloMessage, isRefreshMessage, isSelectMessage, type LinkMessage, type ReadyMessage, type SelectMessage } from './protocol.ts';

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
   * The same collections the editor uses. A collection without a layout
   * then previews as `<DocPreview>`: its title, fields and body.
   */
  collections?: readonly AnyCollection[];
  /**
   * How each collection's documents preview, by collection name: usually
   * the site's own layout, e.g. a post's title and date around its body.
   * Without one, a collection previews as `<DocPreview>` (given
   * `collections`), or else as its body alone.
   */
  layouts?: Readonly<Record<string, PreviewLayout>>;
}

/** Renders the document the parent editor posts; empty until the first message. */
export function PreviewPage(props: PreviewPageProps) {
  const [state, setState] = createStore<{ collection: string; body: boolean; doc: Doc | null }>({ collection: '', body: false, doc: null });
  // Bumped on every save: loaders read it, so they load again.
  const [version, setVersion] = createSignal(0);
  // The selected entry's id, as the editor last said (or a click here, until it answers).
  const [selected, setSelected] = createSignal<string | null>(null);
  const byName = createMemo(() => brickMap(props.bricks));
  const collection = createMemo(() => props.collections?.find((c) => c.name === state.collection));
  const label = (id: string) => {
    const entry = state.doc?.entries?.find((e) => e.id === id);
    return entry ? (byName().get(entry.brick)?.label ?? `Unknown brick "${entry.brick}"`) : '';
  };
  const select = (id: string) => {
    setSelected(id);
    const message: SelectMessage = { type: 'mortar:select', id };
    window.parent.postMessage(message, location.origin);
  };
  const follow = (href: string) => {
    const message: LinkMessage = { type: 'mortar:link', href };
    window.parent.postMessage(message, location.origin);
  };
  const versioned: ContentSource = {
    // Same arity as the caller's: a GET server function sends its arguments
    // as JSON, where a trailing undefined turns into null.
    list: (collection, options) => (options === undefined ? props.content!.list(collection) : props.content!.list(collection, options)),
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
      if (isSelectMessage(event.data)) setSelected(event.data.id);
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
              wrap={(id, view) => (
                <div data-mortar-entry={id} class={styles.entry}>
                  {view}
                </div>
              )}
            />
          );
          return (
            <Errored fallback={(error) => <p role="alert" class={styles.missing}>The preview failed: {String(error())}</p>}>
              <Show
                when={props.layouts?.[state.collection]}
                fallback={
                  <Show
                    when={collection()}
                    fallback={
                      <Show when={state.body} fallback={<p role="note" class={styles.note}>There is no preview for this collection.</p>}>
                        {body}
                      </Show>
                    }
                  >
                    {(c) => (
                      <DocPreview collection={c()} doc={doc} collections={props.collections}>
                        {state.body ? body : null}
                      </DocPreview>
                    )}
                  </Show>
                }
              >
                {(layout) => layout()(doc, body)}
              </Show>
            </Errored>
          );
        }}
      </Show>
      <PreviewPicker selected={selected()} label={label} onSelect={select} onLink={follow} />
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

export { DocPreview, type DocPreviewProps } from './DocPreview.tsx';
export type { DocMessage, HelloMessage, LinkMessage, ReadyMessage, RefreshMessage, SelectMessage } from './protocol.ts';
