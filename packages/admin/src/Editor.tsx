// <Editor>: the admin panel. A sidebar lists the page's entries (with add,
// move, duplicate and remove) and shows the generated form for the selected
// one, with save controls when the app passes `onSave`; the rest is a live
// preview iframe.
import { brickMap, type AnyBrick, type Page, type PageEntry, type SaveResult } from '@mortar-kit/core';
import { createEffect, createMemo, deep, For, Show, snapshot } from 'solid-js';

import { BrickForm } from './BrickForm.tsx';
import styles from './Editor.module.css';
import { PreviewFrame } from './PreviewFrame.tsx';
import { SaveBar } from './SaveBar.tsx';
import common from './common.module.css';
import { createEditorStore, type EditorStore } from './state.ts';

export interface EditorProps {
  /** The bricks this site defines. */
  bricks: readonly AnyBrick[];
  /** The page to edit. Edits are kept in the editor; a new `page` value replaces them. */
  page: Page;
  /** URL of the app route that renders `<PreviewPage>` from `@mortar-kit/admin/preview`. */
  previewUrl: string;
  /** Called with a plain copy of the page after every change. */
  onChange?: (page: Page) => void;
  /**
   * Saves the page; without it there is no Save button. Resolve with a
   * `SaveResult` (e.g. from `savePage`) to report validation problems, or
   * reject if saving failed. The editor validates before calling it too.
   */
  onSave?: (page: Page) => Promise<SaveResult | void>;
  /**
   * Called with whether there are unsaved changes, initially and whenever
   * that changes (only with `onSave`), and with false if the save controls
   * go away while dirty (the editor unmounts or `onSave` is removed). Use it
   * to guard in-app navigation, e.g. with the router's `useBeforeLeave`;
   * closing the tab is already guarded.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

export function Editor(props: EditorProps) {
  const editor = createEditorStore(
    () => props.bricks,
    () => props.page,
  );
  const byName = createMemo(() => brickMap(props.bricks));
  const selected = createMemo(() => editor.state.page.entries.find((e) => e.id === editor.state.selected));

  createEffect(
    () => deep(editor.state.page),
    // Braces: a returned value would be taken as the effect's cleanup (e.g. a signal setter's result).
    (page) => {
      props.onChange?.(snapshot(page));
    },
    { defer: true },
  );

  /** Adds after the selected entry, or at the end. */
  const add = (brickName: string) => {
    const index = editor.state.page.entries.findIndex((e) => e.id === editor.state.selected);
    editor.addEntry(brickName, index === -1 ? undefined : index + 1);
  };

  return (
    <div class={styles.editor}>
      <aside class={styles.sidebar}>
        <div class={styles.toolbar}>
          <h2 class={styles.heading}>Page</h2>
          <AddMenu bricks={props.bricks} onAdd={add} />
        </div>
        <Show when={props.onSave}>
          {(onSave) => <SaveBar editor={editor} bricks={props.bricks} source={props.page} onSave={onSave()} onDirtyChange={props.onDirtyChange} />}
        </Show>
        <Show when={editor.state.page.entries.length > 0} fallback={<p class={styles.empty}>This page is empty. Add a brick to start.</p>}>
          <ol class={styles.entries} aria-label="Page entries">
            <For each={editor.state.page.entries} keyed={(entry) => entry.id}>
              {(entry, index) => (
                <EntryRow entry={entry()} index={index()} brick={byName().get(entry().brick)} editor={editor} />
              )}
            </For>
          </ol>
        </Show>
        <Show when={selected()} keyed>
          {(entry) => (
            <section aria-label="Edit brick">
              <Show
                when={byName().get(entry.brick)}
                fallback={
                  <p class={common.issue}>
                    No brick named "{entry.brick}" is defined. Its data is kept as it is; remove the entry if it's no longer needed.
                  </p>
                }
              >
                {(brick) => (
                  <>
                    <h2 class={styles.heading}>{brick().label}</h2>
                    <BrickForm brick={brick()} entry={entry} editor={editor} />
                  </>
                )}
              </Show>
            </section>
          )}
        </Show>
      </aside>
      <PreviewFrame url={props.previewUrl} page={editor.state.page} />
    </div>
  );
}

/** One entry in the sidebar list: select it, or move, duplicate or remove it. */
function EntryRow(props: { entry: PageEntry; index: number; brick: AnyBrick | undefined; editor: EditorStore }) {
  const label = () => props.brick?.label ?? `Unknown brick "${props.entry.brick}"`;
  // Position makes each action's name unique when a brick appears twice.
  const name = () => `${label()} ${props.index + 1}`;
  const id = () => props.entry.id;
  return (
    <li class={[styles.entryRow, !props.brick && styles.unknown]}>
      <button
        type="button"
        class={styles.entry}
        aria-current={props.editor.state.selected === id() ? 'true' : undefined}
        onClick={() => props.editor.select(id())}
      >
        <Show when={!props.brick}>
          <span aria-hidden="true">⚠ </span>
        </Show>
        {label()}
      </button>
      <div class={common.rowActions}>
        <button
          type="button"
          class={common.button}
          aria-label={`Move ${name()} up`}
          disabled={props.index === 0}
          onClick={() => props.editor.moveEntry(id(), props.index - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          class={common.button}
          aria-label={`Move ${name()} down`}
          disabled={props.index === props.editor.state.page.entries.length - 1}
          onClick={() => props.editor.moveEntry(id(), props.index + 1)}
        >
          ↓
        </button>
        <button type="button" class={common.button} aria-label={`Duplicate ${name()}`} disabled={!props.brick} onClick={() => props.editor.duplicateEntry(id())}>
          ⧉
        </button>
        <button
          type="button"
          class={common.button}
          aria-label={`Remove ${name()}`}
          onClick={() => {
            if (window.confirm(`Remove "${label()}" from the page?`)) props.editor.removeEntry(id());
          }}
        >
          ✕
        </button>
      </div>
    </li>
  );
}

/** "Add brick" disclosure listing every brick by label. */
function AddMenu(props: { bricks: readonly AnyBrick[]; onAdd: (brickName: string) => void }) {
  let menu: HTMLDetailsElement | undefined;
  return (
    <details class={styles.addMenu} ref={(el) => (menu = el)}>
      <summary>Add brick</summary>
      <ul>
        <For each={props.bricks}>
          {(brick) => (
            <li>
              <button
                type="button"
                class={styles.addItem}
                aria-label={`Add ${brick.label}`}
                onClick={() => {
                  props.onAdd(brick.name);
                  if (menu) menu.open = false;
                }}
              >
                {brick.label}
              </button>
            </li>
          )}
        </For>
      </ul>
    </details>
  );
}
