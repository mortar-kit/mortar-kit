// The editor's save controls: whether there are unsaved changes, a Save
// button (also Ctrl/Cmd+S), a saving state, and the problems that stopped a
// save, each linking to its entry, field or the slug. Warns before the
// tab is closed with unsaved changes, and reports changes in that state so
// the app can guard its own navigation (the editor doesn't depend on a router).
import {
  brickMap,
  normalizeDoc,
  validateDoc,
  type AnyBrick,
  type AnyCollection,
  type Doc,
  type DocIssue,
  type SaveResult,
} from '@mortar-kit/core';
import { action, createEffect, createMemo, createOptimistic, createSignal, For, onSettled, Show, snapshot } from 'solid-js';

import styles from './SaveBar.module.css';
import common from './common.module.css';
import { errorMessage } from './errors.ts';
import { FIELDS, type EditorStore } from './state.ts';

export interface SaveBarProps {
  editor: EditorStore;
  bricks: readonly AnyBrick[];
  collection: AnyCollection;
  /** The document as last loaded; the baseline for "unsaved changes" until the first save. */
  source: Doc;
  /** A new document that was never saved: unsaved from the start. */
  isNew?: boolean;
  onSave: (doc: Doc) => Promise<SaveResult | void>;
  /** Called when a problem with the slug is clicked (the editor focuses its slug input). */
  onSlugIssue?: () => void;
  /** Called with the document after each successful save. */
  onSaved?: (doc: Doc) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function SaveBar(props: SaveBarProps) {
  // JSON of the document as last loaded or saved ("" for a new one). Re-derived when another document is loaded.
  const [savedJson, setSavedJson] = createSignal(() =>
    props.isNew ? '' : JSON.stringify(normalizeDoc(props.collection, props.bricks, props.source)),
  );
  const dirty = createMemo(() => JSON.stringify(props.editor.state.doc) !== savedJson());
  const [saving, setSaving] = createOptimistic(false);
  const [issues, setIssues] = createSignal<DocIssue[]>([]);
  const [error, setError] = createSignal<string>();

  const save = action(function* () {
    const doc = snapshot(props.editor.state.doc);
    // Check here first for quick feedback; the server validates again.
    const checked = validateDoc(props.collection, props.bricks, doc);
    if (!checked.success) {
      setIssues(checked.issues);
      setError(undefined);
      return;
    }
    setSaving(true);
    try {
      const result = (yield props.onSave(doc)) as SaveResult | void;
      setIssues(result && !result.ok ? result.issues : []);
      setError(undefined);
      if (!result || result.ok) {
        setSavedJson(JSON.stringify(doc));
        props.onSaved?.(doc);
      }
    } catch (e) {
      setError((yield errorMessage(e)) as string);
    }
  });

  const canSave = () => dirty() && !saving();

  // Last value reported, so unmounting while dirty can report false.
  let reported = false;
  createEffect(
    () => dirty(),
    (value) => {
      reported = value;
      props.onDirtyChange?.(value);
    },
  );

  onSettled(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty()) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        if (canSave()) void save();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeyDown);
      // Without save controls there is nothing unsaved to guard.
      if (reported) props.onDirtyChange?.(false);
    };
  });

  return (
    <div class={styles.saveBar}>
      <div class={styles.row}>
        <span role="status" class={[styles.status, dirty() && styles.dirty]}>
          {saving() ? 'Saving…' : dirty() ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <button type="button" class={styles.save} disabled={!canSave()} onClick={() => void save()}>
          Save
        </button>
      </div>
      <Show when={error()}>
        {(message) => (
          <p role="alert" class={[styles.popover, common.issue]}>
            Couldn't save: {message()}
          </p>
        )}
      </Show>
      <Show when={issues().length > 0}>
        <div role="alert" class={[styles.popover, styles.issues]}>
          <p class={common.issue}>Not saved: fix {issues().length === 1 ? 'this problem' : `these ${issues().length} problems`} first.</p>
          <ul>
            <For each={issues()}>
              {(issue) => <IssueItem issue={issue} editor={props.editor} bricks={props.bricks} onSlugIssue={props.onSlugIssue} />}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}

/**
 * One problem, as a button that shows where it is: the entry, the field in
 * the document's details, or the slug. Problems elsewhere are plain text.
 */
function IssueItem(props: { issue: DocIssue; editor: EditorStore; bricks: readonly AnyBrick[]; onSlugIssue?: () => void }) {
  const kind = () => {
    const { entryId, path } = props.issue;
    if (entryId !== undefined) return 'entry';
    if (path[0] === 'fields' && path.length > 1) return 'fields';
    if (path[0] === 'slug') return 'slug';
    return undefined;
  };
  const where = createMemo(() => {
    const k = kind();
    if (k === 'fields') return ['Details', ...props.issue.path.slice(1)].join(' › ');
    if (k === 'slug') return 'Slug';
    if (k !== 'entry') return undefined;
    const entries = props.editor.state.doc.entries ?? [];
    const index = entries.findIndex((e) => e.id === props.issue.entryId);
    const entry = entries[index];
    if (!entry) return undefined;
    const label = brickMap(props.bricks).get(entry.brick)?.label ?? entry.brick;
    const path = props.issue.path.length > 0 ? ` › ${props.issue.path.join(' › ')}` : '';
    return `${label} ${index + 1}${path}`;
  });
  const go = () => {
    const k = kind();
    if (k === 'slug') props.onSlugIssue?.();
    else props.editor.select(k === 'fields' ? FIELDS : (props.issue.entryId ?? null));
  };
  return (
    <li>
      <Show when={where()} fallback={props.issue.message}>
        {(text) => (
          <button type="button" class={styles.issueLink} onClick={go}>
            {text()}: {props.issue.message}
          </button>
        )}
      </Show>
    </li>
  );
}
