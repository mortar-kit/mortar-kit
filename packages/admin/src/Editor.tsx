// <Editor>: edits one document. The sidebar has its title and slug, the
// save controls (when the app passes `onSave`), a "Details" item for the
// collection's fields, and, when the collection has a body, its entries
// (with add, move, duplicate and remove); below them, the generated form
// for the selected item. The rest is a live preview iframe.
import { brickMap, isValidSlug, type AnyBrick, type AnyCollection, type Doc, type PageEntry, type SaveResult } from '@mortar-kit/core';
import { createEffect, createMemo, createSignal, deep, For, Show, snapshot } from 'solid-js';

import { BrickForm, FieldsForm } from './BrickForm.tsx';
import styles from './Editor.module.css';
import { PreviewFrame } from './PreviewFrame.tsx';
import { SaveBar } from './SaveBar.tsx';
import common from './common.module.css';
import { createEditorStore, FIELDS, type EditorStore } from './state.ts';

export interface EditorProps {
  /** The bricks this site defines. */
  bricks: readonly AnyBrick[];
  /** The collection the document belongs to. */
  collection: AnyCollection;
  /** The document to edit. Edits are kept in the editor; a new `doc` value replaces them. */
  doc: Doc;
  /** A new document that was never saved: it starts unsaved, and the first save creates it (the editor then treats it as saved). */
  isNew?: boolean;
  /** URL of the app route that renders `<PreviewPage>` from `@mortar-kit/admin/preview`. */
  previewUrl: string;
  /** Bump it after saved content changes elsewhere, so bricks in the preview load again. Saves here do it already. */
  refresh?: number;
  /** Called with a plain copy of the document after every change. */
  onChange?: (doc: Doc) => void;
  /**
   * Saves the document; without it there is no Save button. Resolve with a
   * `SaveResult` (e.g. from `Content.save`) to report validation problems,
   * or reject if saving failed. The editor validates before calling it too.
   */
  onSave?: (doc: Doc) => Promise<SaveResult | void>;
  /** Deletes the document; without it there is no Delete button. The editor doesn't ask first: the handler does. */
  onRemove?: () => void;
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
    () => props.collection,
    () => props.doc,
  );
  const byName = createMemo(() => brickMap(props.bricks));
  const entries = () => (props.collection.body ? (editor.state.doc.entries ?? []) : []);
  const selected = createMemo(() => entries().find((e) => e.id === editor.state.selected));
  let slugInput: HTMLInputElement | undefined;
  // The slug as last saved, and whether the document exists yet. Reset when the app passes another document.
  const [saved, setSaved] = createSignal(() => ({ slug: props.doc.slug, exists: props.isNew !== true }));
  // Successful saves, so the preview reloads what bricks loaded.
  const [saves, setSaves] = createSignal(0);

  createEffect(
    () => deep(editor.state.doc),
    // Braces: a returned value would be taken as the effect's cleanup (e.g. a signal setter's result).
    (doc) => {
      props.onChange?.(snapshot(doc));
    },
    { defer: true },
  );

  /** Adds after the selected entry, or at the end. */
  const add = (brickName: string) => {
    const index = entries().findIndex((e) => e.id === editor.state.selected);
    editor.addEntry(brickName, index === -1 ? undefined : index + 1);
  };

  const slugProblem = () => {
    const slug = editor.state.doc.slug;
    if (!isValidSlug(slug)) return 'Use lowercase letters and digits, with single dashes between (e.g. about-us).';
    if (props.collection.reservedSlugs.includes(slug)) return `"${slug}" is reserved.`;
    return undefined;
  };

  return (
    <div class={styles.editor}>
      <aside class={styles.sidebar}>
        <header class={styles.header}>
          <h2 class={styles.heading}>{props.collection.label}</h2>
          <div class={styles.titleRow}>
            <h1 class={styles.title}>{props.collection.titleOf(editor.state.doc)}</h1>
            <Show when={props.onRemove}>
              {(onRemove) => (
                <button type="button" class={[common.button, styles.delete]} onClick={() => onRemove()()}>
                  Delete
                </button>
              )}
            </Show>
          </div>
          <label class={styles.slug}>
            <span class={styles.slugLabel}>Slug</span>
            <input
              ref={(el) => (slugInput = el)}
              class={styles.slugInput}
              value={editor.state.doc.slug}
              aria-invalid={slugProblem() ? 'true' : undefined}
              onInput={(e) => editor.setSlug(e.currentTarget.value)}
            />
            <Show when={slugProblem()}>{(message) => <small class={common.issue}>{message()}</small>}</Show>
            <Show when={saved().exists && !slugProblem() && editor.state.doc.slug !== saved().slug}>
              <small class={common.help}>Saving moves this document to a new address; links to the old one will break. References to it are kept.</small>
            </Show>
          </label>
        </header>
        <Show when={props.onSave}>
          {(onSave) => (
            <SaveBar
              editor={editor}
              bricks={props.bricks}
              collection={props.collection}
              source={props.doc}
              isNew={props.isNew}
              onSave={onSave()}
              onSlugIssue={() => slugInput?.focus()}
              onSaved={(doc) => {
                setSaved({ slug: doc.slug, exists: true });
                setSaves((n) => n + 1);
              }}
              onDirtyChange={props.onDirtyChange}
            />
          )}
        </Show>
        <button
          type="button"
          class={[styles.entry, styles.details]}
          aria-current={editor.state.selected === FIELDS ? 'true' : undefined}
          onClick={() => editor.select(FIELDS)}
        >
          Details
        </button>
        <Show when={props.collection.body}>
          <div class={styles.toolbar}>
            <h2 class={styles.heading}>Body</h2>
            <AddMenu bricks={props.bricks} onAdd={add} />
          </div>
          <Show when={entries().length > 0} fallback={<p class={styles.empty}>The body is empty. Add a brick to start.</p>}>
            <ol class={styles.entries} aria-label="Body entries">
              <For each={entries()} keyed={(entry) => entry.id}>
                {(entry, index) => <EntryRow entry={entry()} index={index()} count={entries().length} brick={byName().get(entry().brick)} editor={editor} />}
              </For>
            </ol>
          </Show>
        </Show>
        <Show when={editor.state.selected === FIELDS}>
          <section aria-label="Edit details">
            <h2 class={styles.heading}>Details</h2>
            <FieldsForm collection={props.collection} data={editor.state.doc.fields} editor={editor} />
          </section>
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
      <PreviewFrame url={props.previewUrl} collection={props.collection.name} doc={editor.state.doc} refresh={(props.refresh ?? 0) + saves()} />
    </div>
  );
}

/** One entry in the sidebar list: select it, or move, duplicate or remove it. */
function EntryRow(props: { entry: PageEntry; index: number; count: number; brick: AnyBrick | undefined; editor: EditorStore }) {
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
          disabled={props.index === props.count - 1}
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
            if (window.confirm(`Remove "${label()}" from the body?`)) props.editor.removeEntry(id());
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
