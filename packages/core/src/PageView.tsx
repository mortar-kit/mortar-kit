// Renders a page: each entry is looked up by brick name and rendered with its
// data. Entries are keyed by id, so reordering moves existing DOM instead of
// re-creating it (which matters for the live preview). Each entry's data is
// normalized into the brick's shape through a projection, so stale or
// hand-edited data can't crash a brick, and unchanged parts keep their
// identity (lists inside a brick don't remount on every edit).
import { createMemo, createProjection, dynamicComponent, For } from 'solid-js';

import { brickMap, type AnyBrick } from './brick.ts';
import type { Page } from './page.ts';

export interface PageViewProps {
  /** The bricks this site defines. */
  bricks: readonly AnyBrick[];
  /** The entries to render, in order. */
  page: Page;
}

/** Renders every entry of `page` with its brick's component. Unknown bricks render nothing. */
export function PageView(props: PageViewProps) {
  const byName = createMemo(() => brickMap(props.bricks));
  return (
    <For each={props.page} keyed={(entry) => entry.id}>
      {(entry) => {
        const brick = createMemo(() => byName().get(entry().brick));
        const data = createProjection(() => brick()?.normalize(entry().data) ?? {});
        const Brick = dynamicComponent(() => brick()?.component);
        return <Brick data={data} />;
      }}
    </For>
  );
}
