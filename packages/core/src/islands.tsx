// Islands: interactive bricks (`defineBrick({ interactive: true })`) on
// pages that are otherwise plain HTML. On such a page (rendered under
// <NoHydration> by createRender), PageView puts each interactive entry in
// an island: an element carrying what the browser needs to render the brick
// again (its name, normalized data, what `load` returned, its entry
// reference and latest submission, as JSON), around a <Hydration> zone with
// its own id, so its hydration keys can't collide with another island's.
// createRender sees that the page has islands and adds Solid's hydration
// bootstrap and the client entry, which calls `hydrateIslands`: each island
// hydrates on its own, the rest of the page is never touched.
//
// `islandView` is the tree inside the zone, the same on both sides (any
// difference would shift the hydration keys). The brick's data and loaded
// value are plain values there, so nothing in the zone waits on data from
// the server (the page is sent without Solid's hydration data, so a brick
// that awaits something of its own in its component would wait forever); the submission accessor is made outside the zone on both sides,
// since the router's hook (server) and `islandActions` (browser) differ.
import { getRequestEvent, hydrate, isServer, type JSX } from '@solidjs/web';
import { createMemo, createRoot, Hydration, isHydratable } from 'solid-js';

import { BrickActionsContext, EntryRefContext, type BrickActions, type EntryRef } from './actions.tsx';
import { brickMap, type AnyBrick, type Submission } from './brick.ts';
import { defaultOf, fieldInfo, type Fields } from './fields.ts';

/** The attribute that marks an island and holds its payload. */
export const ISLAND_ATTRIBUTE = 'data-mortar-island';

/** What an island's element carries to the browser (as JSON). */
export interface IslandPayload {
  /** The island's hydration id, unique in the page. */
  id: string;
  /** The brick's name. */
  brick: string;
  /** The entry's normalized data. */
  data: unknown;
  /** What the brick's `load` returned. */
  loaded?: unknown;
  /** Where the entry is stored, for its form. */
  ref?: EntryRef;
  /** The entry's latest submission when the page was rendered (after a post without JavaScript). */
  submission?: Submission<unknown>;
}

/** The tree inside an island's hydration zone. Internal: the server (PageView) and `hydrateIslands` render it alike. */
export function islandView(island: {
  brick: AnyBrick;
  data: unknown;
  loaded: unknown;
  ref: EntryRef | undefined;
  actions: BrickActions | null;
  submission: () => Submission<unknown> | undefined;
}): JSX.Element {
  const Brick = island.brick.component;
  const live = () => (island.brick.action && island.ref ? island.submission() : undefined);
  return (
    <BrickActionsContext value={island.actions}>
      <EntryRefContext value={() => island.ref}>
        <Brick data={island.data as never} loaded={island.loaded} submission={live()} />
      </EntryRefContext>
    </BrickActionsContext>
  );
}

/**
 * An entry's data as its island gets it: normalized, with `private` fields
 * at their defaults, since the payload is public. Internal (PageView): the
 * server renders the island with the same data, so both sides match.
 */
export function islandData(brick: AnyBrick, raw: unknown): Record<string, unknown> {
  const data: Record<string, unknown> = { ...brick.normalize(raw) };
  for (const [key, field] of Object.entries(brick.schema as Fields)) {
    if (fieldInfo(field)?.private) data[key] = defaultOf(field);
  }
  return data;
}

/**
 * Whether bricks rendered here become islands: on the server, inside a
 * <NoHydration> render (a page createRender sends without JavaScript).
 * Pages that hydrate as a whole render interactive bricks in place.
 */
export function rendersIslands(): boolean {
  return isServer && !isHydratable();
}

/**
 * An island on the server: the payload element around the hydration zone.
 * Internal (PageView). `payload` is read when the attribute renders, so
 * the submission it carries is the one the page shows.
 */
export function ServerIsland(props: { entry: string; payload: () => Omit<IslandPayload, 'id'>; view: () => JSX.Element }) {
  const payload = createMemo((): IslandPayload => ({ id: islandId(props.entry), ...props.payload() }));
  return (
    <div data-mortar-island={JSON.stringify(payload())} style={{ display: 'contents' }}>
      <Hydration id={payload().id}>{props.view()}</Hydration>
    </div>
  );
}

const islandIds = new WeakMap<Request, Map<string, string>>();
const unscoped = new Map<string, string>();

/**
 * The island id of an entry in the page being rendered: `mi1-`, `mi2-`…
 * in order of first render. The same entry keeps its id when the server
 * renders it again (after a load), and the trailing dash keeps one id from
 * being the start of another's keys (Solid finds an island's nodes by key
 * prefix).
 */
function islandId(entry: string): string {
  const request = getRequestEvent()?.request;
  let ids = request ? islandIds.get(request) : unscoped;
  if (!ids) islandIds.set(request!, (ids = new Map()));
  let id = ids.get(entry);
  if (!id) ids.set(entry, (id = `mi${ids.size + 1}-`));
  return id;
}

/** How many islands the page for `request` rendered. Internal: createRender adds the client scripts when there are any. */
export function islandCount(request: Request): number {
  return islandIds.get(request)?.size ?? 0;
}

/** Options for `hydrateIslands`. */
export interface HydrateIslandsOptions {
  /** The site's bricks (the same list the server renders with). */
  bricks: readonly AnyBrick[];
  /** How island forms post: `islandActions(...)`. Without it, forms post as plain HTML forms. */
  actions?: BrickActions;
  /** Where to look for islands. Default: the document. */
  root?: ParentNode;
}

/** True when the page (or `root`) has islands: the client entry's test for calling `hydrateIslands`. */
export function hasIslands(root: ParentNode = document): boolean {
  return root.querySelector(`[${ISLAND_ATTRIBUTE}]`) !== null;
}

/**
 * Hydrates every island on the page: each interactive brick the server
 * rendered on a page without JavaScript, on its own. Call it from the
 * client entry on pages that have islands (`hasIslands()`), instead of
 * hydrating the whole document. Returns a function that disposes them.
 *
 * @example
 * ```ts
 * // src/entry-client.tsx
 * if (hasIslands()) {
 *   const { bricks } = await import('./bricks/index.ts');
 *   hydrateIslands({ bricks, actions: islandActions({ action: brickActions.action, run: runBrickAction }) });
 * } else {
 *   const { Root } = await import('./Root.tsx');
 *   hydrate(() => <Root />, document);
 * }
 * ```
 */
export function hydrateIslands(options: HydrateIslandsOptions): () => void {
  const byName = brickMap(options.bricks);
  const actions = options.actions ?? null;
  const disposers: (() => void)[] = [];
  for (const element of (options.root ?? document).querySelectorAll<HTMLElement>(`[${ISLAND_ATTRIBUTE}]`)) {
    const payload = readPayload(element);
    const brick = payload && byName.get(payload.brick);
    if (!payload || !brick) {
      console.warn(`Mortar: an island of brick "${payload?.brick ?? '?'}" can't hydrate: no such brick, or its data is unreadable`);
      continue;
    }
    // Outside the hydration root, so the hook's own computations don't take hydration keys.
    const ref = payload.ref;
    const latest = createRoot((dispose) => {
      disposers.push(dispose);
      return actions && ref ? actions.useSubmission(() => ref) : () => undefined;
    });
    disposers.push(
      hydrate(
        () =>
          islandView({
            brick,
            data: payload.data,
            loaded: payload.loaded,
            ref,
            actions,
            submission: () => latest() ?? payload.submission,
          }),
        element,
        { renderId: payload.id },
      ),
    );
  }
  return () => {
    for (const dispose of disposers) dispose();
  };
}

function readPayload(element: HTMLElement): IslandPayload | null {
  try {
    const value: unknown = JSON.parse(element.getAttribute(ISLAND_ATTRIBUTE) ?? '');
    if (typeof value !== 'object' || value === null) return null;
    const payload = value as IslandPayload;
    return typeof payload.id === 'string' && typeof payload.brick === 'string' ? payload : null;
  } catch {
    return null;
  }
}
