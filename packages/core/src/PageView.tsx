// Renders a page: each entry is looked up by brick name and rendered with its
// data. Entries are keyed by id, so reordering moves existing DOM instead of
// re-creating it (which matters for the live preview). Each entry's data is
// normalized into the brick's shape through a projection, so stale or
// hand-edited data can't crash a brick, and unchanged parts keep their
// identity (lists inside a brick don't remount on every edit).
import type { JSX } from '@solidjs/web';
import { createMemo, createProjection, dynamicComponent, For, Show } from 'solid-js';

import { brickMap, type AnyBrick } from './brick.ts';
import type { Page, PageEntry } from './page.ts';

export interface PageViewProps {
  /** The bricks this site defines. */
  bricks: readonly AnyBrick[];
  /** The page whose entries are rendered, in order. */
  page: Page;
  /**
   * Rendered in place of an entry whose brick isn't defined (e.g. a brick
   * that was removed from the code). Default: nothing, which suits a public
   * site; the admin preview shows a placeholder.
   */
  fallback?: (entry: PageEntry) => JSX.Element;
}

/** Renders every entry of `page` with its brick's component. */
export function PageView(props: PageViewProps) {
  const byName = createMemo(() => brickMap(props.bricks));
  return (
    <For each={props.page.entries} keyed={(entry) => entry.id}>
      {(entry) => {
        const brick = createMemo(() => byName().get(entry().brick));
        const data = createProjection(() => brick()?.normalize(entry().data) ?? {});
        const Brick = dynamicComponent(() => brick()?.component);
        return (
          <Show when={brick()} fallback={props.fallback?.(entry())}>
            <Brick data={data} />
          </Show>
        );
      }}
    </For>
  );
}
