// Forms in bricks. A brick with an `action` renders <ActionForm>; the app
// says, through BrickActionsContext, where such a form posts and how to read
// back what happened (with Solid's router: a form action over one server
// function that calls `Content.runAction`, and its submissions). The form
// carries the entry's reference (collection, document, entry), never its
// data: the server reads that from storage. PageView gives each entry its
// reference and its submission. On an island (an `interactive` brick on a
// page without JavaScript) there is no router: `islandActions` posts in the
// background itself, through the app's server function.
import { isResponseEnvelope, type JSX } from '@solidjs/web';
import { decodeResponse } from '@solidjs/web/server-functions';
import { createContext, createStore, useContext } from 'solid-js';

import type { Submission } from './brick.ts';

/** Where an entry is stored: what a form post names, so the server can read the entry's data. */
export interface EntryRef {
  /** The collection's name. */
  collection: string;
  /** The document's id. */
  doc: string;
  /** The entry's id in the document's body. */
  entry: string;
}

/**
 * How the app connects brick forms to the server. Provide it with
 * `BrickActionsContext` around the site; without it, a `<ActionForm>`
 * renders but doesn't post anywhere.
 *
 * @example
 * ```ts
 * // With @solidjs/router; runBrickAction is a "use server" function that calls content.runAction.
 * const post = formAction(runBrickAction, 'mortar-brick-action');
 * export const brickActions: BrickActions = {
 *   action: (ref) => post.with(ref),
 *   useSubmission: (ref) => {
 *     const all = useSubmissions(post, (input) => sameEntry(input[0], ref()));
 *     return () => {
 *       const last = all.at(-1);
 *       return last && { pending: last.result === undefined && last.error === undefined, result: last.result, error: last.error };
 *     };
 *   },
 * };
 * ```
 */
export interface BrickActions {
  /** The `action` attribute of an entry's form: the URL (or the router's form action) its post goes to. */
  action(ref: EntryRef): string | JSX.SerializableAttributeValue;
  /**
   * The entry's latest submission, for its component. Called once per
   * entry while rendering (hooks are fine); `ref` is an accessor because an
   * entry can move to another document in the admin preview.
   */
  useSubmission(ref: () => EntryRef): () => Submission<unknown> | undefined;
  /**
   * Sends an entry's form in the background. When present, `<ActionForm>`
   * stops the browser's own post and calls it; without it, the post goes to
   * `action(ref)` (where a router may take it over). `islandActions` has it.
   */
  submit?(ref: EntryRef, form: FormData): void;
}

/** What `islandActions` needs from the app. */
export interface IslandActionsOptions {
  /** The forms' `action` attribute, as on the server (`brickActions.action`), for a post before the island hydrates. */
  action: BrickActions['action'];
  /** Runs an entry's action on the server: the app's server function that calls `Content.runAction`. */
  run(ref: EntryRef, form: FormData): Promise<unknown>;
}

/**
 * `BrickActions` for islands (interactive bricks on pages without the
 * router): a form post calls `run` in the background and only its brick
 * updates, pending until the result (or error) is back. Pass it to
 * `hydrateIslands`.
 *
 * @example
 * ```ts
 * // src/islands.ts; runBrickAction is the "use server" function brickActions posts to.
 * hydrateIslands({ bricks, actions: islandActions({ action: brickActions.action, run: runBrickAction }) });
 * ```
 */
export function islandActions(options: IslandActionsOptions): BrickActions {
  const [latest, setLatest] = createStore<Record<string, Submission<unknown>>>({});
  return {
    action: options.action,
    useSubmission: (ref) => () => latest[entryKey(ref())],
    async submit(ref, form) {
      const key = entryKey(ref);
      if (latest[key]?.pending) return;
      setLatest((s) => {
        s[key] = { pending: true };
      });
      try {
        const result = await settle(await options.run(ref, form));
        setLatest((s) => {
          s[key] = { pending: false, result };
        });
      } catch (error) {
        setLatest((s) => {
          s[key] = { pending: false, error };
        });
      }
    },
  };
}

/**
 * A server function's answer as its value. One that sets response metadata
 * (`respond(value, { revalidate })`, which tells the router what to reload)
 * reaches a direct call as the whole response, which the router would
 * otherwise decode; on the server it's an envelope around the value.
 */
async function settle(answer: unknown): Promise<unknown> {
  if (isResponseEnvelope(answer)) return answer.value;
  if (answer instanceof Response) {
    if (!answer.ok) throw new Error(`The form post failed (${answer.status})`);
    return answer.body ? decodeResponse(answer) : undefined;
  }
  return answer;
}

/** One string per entry, for keying submissions. */
function entryKey(ref: EntryRef): string {
  return JSON.stringify([ref.collection, ref.doc, ref.entry]);
}

/** Provides the app's `BrickActions` to every `PageView` below it. */
export const BrickActionsContext = createContext<BrickActions | null>(null);

/** The entry being rendered, for its <ActionForm>. Internal: PageView provides it. */
export const EntryRefContext = createContext<(() => EntryRef | undefined) | null>(null);

/** True when `value` names the same entry as `ref`: for filtering submissions by entry. */
export function sameEntry(value: unknown, ref: EntryRef | undefined): boolean {
  if (!ref || typeof value !== 'object' || value === null) return false;
  const v = value as Partial<EntryRef>;
  return v.collection === ref.collection && v.doc === ref.doc && v.entry === ref.entry;
}

/** Props of `ActionForm`. */
export interface ActionFormProps {
  /** The form's class. */
  class?: string;
  /** Labels the form for assistive technology. */
  'aria-label'?: string;
  /** The form's fields and its submit button. */
  children?: JSX.Element;
}

/**
 * A form that posts to its brick's `action`. Use it in the component of a
 * brick that declares one. It's a plain `<form method="post">`, so it works
 * without JavaScript; the router (or whatever the app's `BrickActions`
 * uses) can take over the submit when the page has scripts, and on an
 * island `BrickActions.submit` sends it in the background.
 */
export function ActionForm(props: ActionFormProps) {
  const actions = useContext(BrickActionsContext);
  const ref = useContext(EntryRefContext);
  const action = () => {
    const r = ref?.();
    return actions && r ? actions.action(r) : undefined;
  };
  const onSubmit = (event: SubmitEvent) => {
    const r = ref?.();
    if (!actions?.submit || !r || event.defaultPrevented) return;
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    actions.submit(r, new FormData(form, event.submitter));
  };
  return (
    <form method="post" action={action() as string | undefined} class={props.class} aria-label={props['aria-label']} onSubmit={onSubmit}>
      {props.children}
    </form>
  );
}
