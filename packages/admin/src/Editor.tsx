// <Editor>: the admin panel. A sidebar lists the page's entries and shows the
// generated form for the selected one; the rest is a live preview iframe.
import { brickMap, type AnyBrick, type Page } from '@mortar-kit/core';
import { createEffect, createMemo, deep, For, Show, snapshot } from 'solid-js';

import { BrickForm } from './BrickForm.tsx';
import { PreviewFrame } from './PreviewFrame.tsx';
import { createEditorStore } from './state.ts';
import './editor.css';

export interface EditorProps {
  /** The bricks this site defines. */
  bricks: readonly AnyBrick[];
  /** The page to edit. Edits are kept in the editor; a new `page` value replaces them. */
  page: Page;
  /** URL of the app route that renders `<PreviewPage>` from `@mortar-kit/admin/preview`. */
  previewUrl: string;
  /** Called with a plain copy of the page after every change. */
  onChange?: (page: Page) => void;
}

export function Editor(props: EditorProps) {
  const editor = createEditorStore(
    () => props.bricks,
    () => props.page,
  );
  const byName = createMemo(() => brickMap(props.bricks));
  const selected = createMemo(() => editor.state.page.find((e) => e.id === editor.state.selected));

  createEffect(
    () => deep(editor.state.page),
    // Braces: a returned value would be taken as the effect's cleanup (e.g. a signal setter's result).
    (page) => {
      props.onChange?.(snapshot(page));
    },
    { defer: true },
  );

  return (
    <div class="mortar-editor">
      <aside class="mortar-sidebar">
        <h2 class="mortar-heading">Page</h2>
        <ol class="mortar-entries">
          <For each={editor.state.page} keyed={(entry) => entry.id}>
            {(entry) => (
              <li>
                <button
                  type="button"
                  class="mortar-entry"
                  aria-current={editor.state.selected === entry().id ? 'true' : undefined}
                  onClick={() => editor.select(entry().id)}
                >
                  {byName().get(entry().brick)?.label ?? `Unknown brick "${entry().brick}"`}
                </button>
              </li>
            )}
          </For>
        </ol>
        <Show when={selected()} keyed>
          {(entry) => (
            <section class="mortar-panel" aria-label="Edit brick">
              <Show
                when={byName().get(entry.brick)}
                fallback={<p class="mortar-issue">No brick named "{entry.brick}" is defined.</p>}
              >
                {(brick) => (
                  <>
                    <h2 class="mortar-heading">{brick().label}</h2>
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
