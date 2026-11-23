// Forms in bricks. A brick with an `action` renders <ActionForm>; the app
// says, through BrickActionsContext, where such a form posts and how to read
// back what happened (with Solid's router: a form action over one server
// function that calls `Content.runAction`, and its submissions). The form
// carries the entry's reference (collection, document, entry), never its
// data: the server reads that from storage. PageView gives each entry its
// reference and its submission.
import type { JSX } from '@solidjs/web';
import { createContext, useContext } from 'solid-js';

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
 * uses) can take over the submit when the page has scripts.
 */
export function ActionForm(props: ActionFormProps) {
  const actions = useContext(BrickActionsContext);
  const ref = useContext(EntryRefContext);
  const action = () => {
    const r = ref?.();
    return actions && r ? actions.action(r) : undefined;
  };
  return (
    <form method="post" action={action() as string | undefined} class={props.class} aria-label={props['aria-label']}>
      {props.children}
    </form>
  );
}
