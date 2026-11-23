// Renders brick entries (a page, a document's body): each entry is looked
// up by brick name and rendered with its data. Entries are keyed by id, so
// reordering moves existing DOM instead of re-creating it (which matters
// for the live preview). Each entry's data is normalized into the brick's
// shape through a projection, so stale or hand-edited data can't crash a
// brick, and unchanged parts keep their identity (lists inside a brick
// don't remount on every edit). A brick with `load` gets what it loaded,
// through a deferred memo under its own <Loading>: the first load shows
// the loading fallback (never in a server-rendered page, which waits), and
// later loads keep the previous result on screen until the new one lands.
// Given the document it renders (`doc`), it tells each entry where it is
// stored, so a brick's <ActionForm> can post to its action, and hands the
// brick its latest submission (BrickActionsContext).
import type { JSX } from '@solidjs/web';
import { createDeferred, createMemo, createProjection, dynamicComponent, Errored, For, Loading, Show, useContext } from 'solid-js';

import { BrickActionsContext, EntryRefContext, type EntryRef } from './actions.tsx';
import { brickMap, type AnyBrick } from './brick.ts';
import { ContentContext, contentReader } from './content.ts';
import type { PageEntry } from './entries.ts';

export interface PageViewProps {
  /** The bricks this site defines. */
  bricks: readonly AnyBrick[];
  /** The entries to render, in order: a page's or a document's body. */
  entries: readonly PageEntry[];
  /**
   * The document the entries belong to. Bricks with an `action` need it:
   * their forms name the entry by collection, document and entry id, so
   * the server can read its stored data. Without it, their forms don't post.
   */
  doc?: { collection: string; id: string };
  /**
   * Rendered in place of an entry whose brick isn't defined (e.g. a brick
   * that was removed from the code). Default: nothing, which suits a public
   * site; the admin preview shows a placeholder.
   */
  fallback?: (entry: PageEntry) => JSX.Element;
  /** Shown while a brick's first load is in flight. Default: nothing. */
  loadingFallback?: (entry: PageEntry) => JSX.Element;
  /**
   * Shown in place of a brick whose load failed. Without it, the error
   * reaches the app's own error boundary (a server render fails with it);
   * the admin preview passes one. It clears when the brick loads again: when
   * data its loader read before its first `await` changes, or the source's
   * `track` signal does.
   */
  errorFallback?: (entry: PageEntry, error: unknown) => JSX.Element;
  /**
   * Renders around each entry, given its id (stable for the entry's life).
   * Default: nothing around it. The admin preview marks entries with it, so
   * a click can find the entry it landed in.
   */
  wrap?: (id: string, view: JSX.Element) => JSX.Element;
}

/** Renders every entry with its brick's component. Bricks that load data read `ContentContext`. */
export function PageView(props: PageViewProps) {
  const byName = createMemo(() => brickMap(props.bricks));
  const source = useContext(ContentContext);
  const actions = useContext(BrickActionsContext);
  return (
    <For each={props.entries} keyed={(entry) => entry.id}>
      {(entry) => {
        const brick = createMemo(() => byName().get(entry().brick));
        const data = createProjection(() => brick()?.normalize(entry().data) ?? {});
        const Brick = dynamicComponent(() => brick()?.component);
        const loads = createMemo(() => brick()?.load !== undefined);
        const ref = (): EntryRef | undefined => (props.doc ? { collection: props.doc.collection, doc: props.doc.id, entry: entry().id } : undefined);
        // Asked once per entry, whatever its brick: the app's hook may use the router.
        const submission = actions ? actions.useSubmission(() => ref() ?? { collection: '', doc: '', entry: '' }) : () => undefined;
        const live = () => (brick()?.action && ref() ? submission() : undefined);
        const loaded = createDeferred(() => {
          const b = brick();
          if (!b?.load) return undefined;
          if (!source) throw new Error(`Mortar: brick "${b.name}" loads data; provide a ContentContext around the page`);
          source.track?.();
          return b.load(data, contentReader(source));
        });
        const view = () => (
          <Loading fallback={props.loadingFallback?.(entry())}>
            <Brick data={data} loaded={loaded()} submission={live()} />
          </Loading>
        );
        // A function: created inside EntryRefContext below, so ActionForm can read it.
        const rendered = () => (
          <Show when={brick()} fallback={props.fallback?.(entry())}>
            <Show when={loads()} fallback={<Brick data={data} loaded={undefined} submission={live()} />}>
              <Show when={props.errorFallback} fallback={view()}>
                {(onError) => <Errored fallback={(error) => onError()(entry(), error())}>{view()}</Errored>}
              </Show>
            </Show>
          </Show>
        );
        // In JSX, so props.wrap and the entry are read where they're tracked.
        return <EntryRefContext value={ref}>{props.wrap ? props.wrap(entry().id, rendered()) : rendered()}</EntryRefContext>;
      }}
    </For>
  );
}
