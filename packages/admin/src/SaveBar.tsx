// The editor's save controls: whether there are unsaved changes, a Save
// button (also Ctrl/Cmd+S), a saving state, and the problems that stopped a
// save, each linking to its entry. Warns before the tab is closed with
// unsaved changes, and reports changes in that state so the app can guard
// its own navigation (the editor doesn't depend on a router).
import { brickMap, normalizePage, validatePage, type AnyBrick, type Page, type PageIssue, type SaveResult } from '@mortar-kit/core';
import { action, createEffect, createMemo, createOptimistic, createSignal, For, onSettled, Show, snapshot } from 'solid-js';

import type { EditorStore } from './state.ts';

export interface SaveBarProps {
  editor: EditorStore;
  bricks: readonly AnyBrick[];
  /** The page as last loaded; the baseline for "unsaved changes" until the first save. */
  source: Page;
  onSave: (page: Page) => Promise<SaveResult | void>;
  onDirtyChange?: (dirty: boolean) => void;
}

export function SaveBar(props: SaveBarProps) {
  // JSON of the page as last loaded or saved. Re-derived when a new page is loaded.
  const [savedJson, setSavedJson] = createSignal(() => JSON.stringify(normalizePage(props.bricks, props.source)));
  const dirty = createMemo(() => JSON.stringify(props.editor.state.page) !== savedJson());
  const [saving, setSaving] = createOptimistic(false);
  const [issues, setIssues] = createSignal<PageIssue[]>([]);
  const [error, setError] = createSignal<string>();

  const save = action(function* () {
    const page = snapshot(props.editor.state.page);
    // Check here first for quick feedback; the server validates again.
    const checked = validatePage(props.bricks, page);
    if (!checked.success) {
      setIssues(checked.issues);
      setError(undefined);
      return;
    }
    setSaving(true);
    try {
      const result = (yield props.onSave(page)) as SaveResult | void;
      setIssues(result && !result.ok ? result.issues : []);
      setError(undefined);
      if (!result || result.ok) setSavedJson(JSON.stringify(page));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    <div class="mortar-savebar">
      <div class="mortar-savebar-row">
        <span role="status" class={['mortar-save-status', { 'mortar-dirty': dirty() }]}>
          {saving() ? 'Saving…' : dirty() ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <button type="button" class="mortar-save" disabled={!canSave()} onClick={() => void save()}>
          Save
        </button>
      </div>
      <Show when={error()}>{(message) => <p role="alert" class="mortar-issue">Couldn't save: {message()}</p>}</Show>
      <Show when={issues().length > 0}>
        <div role="alert" class="mortar-issues">
          <p class="mortar-issue">Not saved: fix {issues().length === 1 ? 'this problem' : `these ${issues().length} problems`} first.</p>
          <ul>
            <For each={issues()}>{(issue) => <IssueItem issue={issue} editor={props.editor} bricks={props.bricks} />}</For>
          </ul>
        </div>
      </Show>
    </div>
  );
}

/** One problem; if it belongs to an entry, a button that selects that entry. */
function IssueItem(props: { issue: PageIssue; editor: EditorStore; bricks: readonly AnyBrick[] }) {
  const where = createMemo(() => {
    const entries = props.editor.state.page.entries;
    const index = entries.findIndex((e) => e.id === props.issue.entryId);
    const entry = entries[index];
    if (!entry) return undefined;
    const label = brickMap(props.bricks).get(entry.brick)?.label ?? entry.brick;
    const path = props.issue.path.length > 0 ? ` › ${props.issue.path.join(' › ')}` : '';
    return `${label} ${index + 1}${path}`;
  });
  return (
    <li>
      <Show when={where()} fallback={props.issue.message}>
        {(text) => (
          <button type="button" class="mortar-issue-link" onClick={() => props.editor.select(props.issue.entryId ?? null)}>
            {text()}: {props.issue.message}
          </button>
        )}
      </Show>
    </li>
  );
}
