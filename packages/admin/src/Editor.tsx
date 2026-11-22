// <Editor>: edits one document. Its outline panel has the slug, a "Details"
// item for the collection's fields and, when the collection has a body, its
// entries (with add, move, duplicate and remove); inside <Admin> the outline
// goes in the admin's panel instead. A top bar names the document and holds
// Delete and the save controls (when the app passes `onRemove`/`onSave`); the
// live preview fills the middle, and the inspector on the right (resizable
// from its left edge) shows the generated form for the selected item.
// Clicking a brick in the preview selects it; ⌘/Ctrl-clicking a link there
// calls `onFollowLink` (by default, opens it in a new tab).
import { brickMap, isValidSlug, type AnyBrick, type AnyCollection, type Doc, type PageEntry, type SaveResult } from '@mortar-kit/core';
import { Portal } from '@solidjs/web';
import { createEffect, createMemo, createSignal, deep, For, Show, snapshot } from 'solid-js';

import { BrickForm, FieldsForm } from './BrickForm.tsx';
import { useAdmin } from './context.ts';
import styles from './Editor.module.css';
import './tokens.css';
import './theme-slot.css';
import { PreviewFrame } from './PreviewFrame.tsx';
import { createInspectorWidth, ResizeHandle } from './ResizeHandle.tsx';
import { SaveBar } from './SaveBar.tsx';
import common from './common.module.css';
import { BackIcon, CloseIcon, CopyIcon, DetailsIcon, DownIcon, PlusIcon, TrashIcon, UpIcon } from './icons.tsx';
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
  /**
   * Called when a same-origin link is ⌘/Ctrl-clicked in the preview (a plain
   * click selects the brick instead). Default: opens it in a new tab.
   * `<Admin>` opens the document it points to (see `AdminProps.resolveLink`).
   */
  onFollowLink?: (url: URL) => void;
}

export function Editor(props: EditorProps) {
  const editor = createEditorStore(
    () => props.bricks,
    () => props.collection,
    () => props.doc,
  );
  const admin = useAdmin();
  const inspector = createInspectorWidth();
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

  const selectedLabel = () => {
    if (editor.state.selected === FIELDS) return 'Details';
    const entry = selected();
    return entry ? (byName().get(entry.brick)?.label ?? entry.brick) : undefined;
  };

  // The document's outline: slug, Details, the body's entries and the Add
  // menu. Inside <Admin> it goes in the admin's panel (beside its collections
  // rail); a standalone editor shows it in its own panel.
  const outline = (
    <div class={styles.outline}>
      <Show when={admin}>
        {(a) => (
          <button type="button" class={styles.back} onClick={() => a().showList()}>
            <BackIcon />
            All {props.collection.label.toLowerCase()}
          </button>
        )}
      </Show>
      <label class={styles.slug}>
        <span class={styles.label}>Slug</span>
        <span class={styles.slugField}>
          <input
            ref={(el) => (slugInput = el)}
            class={styles.slugInput}
            value={editor.state.doc.slug}
            aria-invalid={slugProblem() ? 'true' : undefined}
            onInput={(e) => editor.setSlug(e.currentTarget.value)}
          />
        </span>
        <Show when={slugProblem()}>{(message) => <small class={common.issue}>{message()}</small>}</Show>
        <Show when={saved().exists && !slugProblem() && editor.state.doc.slug !== saved().slug}>
          <small class={common.help}>Saving moves this document to a new address; links to the old one will break. References to it are kept.</small>
        </Show>
      </label>
      <button
        type="button"
        class={[styles.item, styles.details]}
        aria-current={editor.state.selected === FIELDS ? 'true' : undefined}
        onClick={() => editor.select(FIELDS)}
      >
        <DetailsIcon />
        Details
      </button>
      <Show when={props.collection.body}>
        <h2 class={styles.label}>Body</h2>
        <Show when={entries().length > 0} fallback={<p class={styles.empty}>The body is empty. Add a brick to start.</p>}>
          <ol class={styles.entries} aria-label="Body entries">
            <For each={entries()} keyed={(entry) => entry.id}>
              {(entry, index) => <EntryRow entry={entry()} index={index()} count={entries().length} brick={byName().get(entry().brick)} editor={editor} />}
            </For>
          </ol>
        </Show>
        <AddMenu bricks={props.bricks} onAdd={add} />
      </Show>
    </div>
  );

  return (
    <div class={[styles.editor, admin && styles.embedded]} style={{ '--inspector-width': inspector.width() === undefined ? undefined : `${inspector.width()}px` }}>
      <Show when={admin} fallback={<aside class={styles.panel}>{outline}</aside>}>
        {(a) => <Show when={a().outline()}>{(mount) => <Portal mount={mount()}>{outline}</Portal>}</Show>}
      </Show>
      <header class={styles.topbar}>
        <div class={styles.crumbs}>
          <span class={styles.crumb}>{props.collection.label}</span>
          <span class={styles.crumbSep} aria-hidden="true">
            ›
          </span>
          <h1 class={styles.title}>{props.collection.titleOf(editor.state.doc)}</h1>
          <Show when={selectedLabel()}>
            {(label) => (
              <>
                <span class={styles.crumbSep} aria-hidden="true">
                  ›
                </span>
                <span class={styles.crumb}>{label()}</span>
              </>
            )}
          </Show>
        </div>
        <div class={styles.actions}>
          <Show when={props.onRemove}>
            {(onRemove) => (
              <button type="button" class={styles.delete} aria-label="Delete" title="Delete this document" onClick={() => onRemove()()}>
                <TrashIcon />
              </button>
            )}
          </Show>
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
        </div>
      </header>
      <div class={styles.stage}>
        <div class={styles.frame}>
          <PreviewFrame
            url={props.previewUrl}
            collection={props.collection.name}
            body={props.collection.body}
            doc={editor.state.doc}
            refresh={(props.refresh ?? 0) + saves()}
            selected={typeof editor.state.selected === 'string' ? editor.state.selected : null}
            onSelect={(id) => {
              if (entries().some((e) => e.id === id)) editor.select(id);
            }}
            onLink={(url) => (props.onFollowLink ? props.onFollowLink(url) : window.open(url.href, '_blank', 'noopener'))}
          />
        </div>
      </div>
      <ResizeHandle width={inspector.width()} onResize={inspector.setWidth} />
      <aside class={styles.inspector} aria-label="Inspector">
        <Show when={editor.state.selected === FIELDS}>
          <section aria-label="Edit details" class={styles.section}>
            <div class={styles.inspectorHead}>
              <h2 class={styles.inspectorTitle}>Details</h2>
              <p class={styles.inspectorSub}>{props.collection.label} fields</p>
            </div>
            <FieldsForm collection={props.collection} data={editor.state.doc.fields} editor={editor} />
          </section>
        </Show>
        <Show when={selected()} keyed>
          {(entry) => (
            <section aria-label="Edit brick" class={styles.section}>
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
                    <div class={styles.inspectorHead}>
                      <h2 class={styles.inspectorTitle}>{brick().label}</h2>
                      <p class={styles.inspectorSub}>
                        Brick {entries().findIndex((e) => e.id === entry.id) + 1} of {entries().length}
                      </p>
                    </div>
                    <BrickForm brick={brick()} entry={entry} editor={editor} />
                  </>
                )}
              </Show>
            </section>
          )}
        </Show>
        <Show when={editor.state.selected === null || (editor.state.selected !== FIELDS && !selected())}>
          <p class={styles.nothing}>Pick Details or a brick to edit it.</p>
        </Show>
      </aside>
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
        class={styles.item}
        aria-current={props.editor.state.selected === id() ? 'true' : undefined}
        onClick={() => props.editor.select(id())}
      >
        <Show when={!props.brick}>
          <span aria-hidden="true">⚠ </span>
        </Show>
        {label()}
      </button>
      <div class={styles.rowActions}>
        <button
          type="button"
          class={styles.iconButton}
          aria-label={`Move ${name()} up`}
          title="Move up"
          disabled={props.index === 0}
          onClick={() => props.editor.moveEntry(id(), props.index - 1)}
        >
          <UpIcon />
        </button>
        <button
          type="button"
          class={styles.iconButton}
          aria-label={`Move ${name()} down`}
          title="Move down"
          disabled={props.index === props.count - 1}
          onClick={() => props.editor.moveEntry(id(), props.index + 1)}
        >
          <DownIcon />
        </button>
        <button
          type="button"
          class={styles.iconButton}
          aria-label={`Duplicate ${name()}`}
          title="Duplicate"
          disabled={!props.brick}
          onClick={() => props.editor.duplicateEntry(id())}
        >
          <CopyIcon />
        </button>
        <button
          type="button"
          class={styles.iconButton}
          aria-label={`Remove ${name()}`}
          title="Remove"
          onClick={() => {
            if (window.confirm(`Remove "${label()}" from the body?`)) props.editor.removeEntry(id());
          }}
        >
          <CloseIcon />
        </button>
      </div>
    </li>
  );
}

/** "Add brick" disclosure at the foot of the outline, listing every brick by label (it opens upwards). */
function AddMenu(props: { bricks: readonly AnyBrick[]; onAdd: (brickName: string) => void }) {
  let menu: HTMLDetailsElement | undefined;
  return (
    <details class={styles.addMenu} ref={(el) => (menu = el)}>
      <summary>
        <PlusIcon />
        Add brick
      </summary>
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
