// <Admin>: the whole admin panel. A narrow sidebar lists the collections and
// the documents of the open one (with a form to create a document); the
// rest is the <Editor> for the open document. Where it is (collection and
// document id) can live in the app's URL (`location` + `onNavigate`, so
// the app's own leave guard covers switching documents) or in the admin
// itself, which then asks before leaving unsaved changes.
import {
  collectionMap,
  isValidSlug,
  type AnyBrick,
  type AnyCollection,
  type Content,
  type Doc,
  type Referrer,
  type SaveResult,
} from '@mortar-kit/core';
import { createEffect, createMemo, createSignal, For, Loading, refresh, Show } from 'solid-js';

import styles from './Admin.module.css';
import { AdminContext, type AdminApi, type AdminLocation } from './context.ts';
import { Editor } from './Editor.tsx';
import common from './common.module.css';

export interface AdminProps {
  /** The bricks this site defines. */
  bricks: readonly AnyBrick[];
  /** The site's collections, in the order the sidebar lists them. */
  collections: readonly AnyCollection[];
  /**
   * Reads and writes. Reads should be uncached, so the admin always shows
   * what is saved (the app's server functions, or `createContent` in tests).
   */
  content: Content;
  /** URL of the app route that renders `<PreviewPage>` from `@mortar-kit/admin/preview`. */
  previewUrl: string;
  /** Where the admin is, when the app keeps it (e.g. in the URL). Without it the admin keeps it itself. */
  location?: AdminLocation;
  /** With `location`: called to go somewhere; the app updates `location` (or doesn't, e.g. when its guard says no). */
  onNavigate?: (to: AdminLocation) => void;
  /** Whether the open document has unsaved changes; see `EditorProps.onDirtyChange`. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function Admin(props: AdminProps) {
  const [own, setOwn] = createSignal<AdminLocation>(() => ({ collection: props.collections[0]?.name ?? '' }));
  const loc = () => props.location ?? own();
  const byName = createMemo(() => collectionMap(props.collections));
  const collection = createMemo(() => byName().get(loc().collection));
  const list = createMemo(() => {
    const c = collection();
    return c ? props.content.list(c.name) : [];
  });

  // A new document not saved yet. A plain variable for the open document (so
  // saving it never makes the editor reload), a signal for the sidebar row.
  let draft: { collection: string; doc: Doc } | undefined;
  const [draftRow, setDraftRow] = createSignal<{ collection: string; doc: Doc } | null>(null);
  const doc = createMemo(() => {
    const { collection: name, id } = loc();
    if (!id || !byName().has(name)) return null;
    if (draft && draft.collection === name && draft.doc.id === id) return draft.doc;
    return props.content.get(name, { id });
  });

  const [dirty, setDirty] = createSignal(false);
  const [blocked, setBlocked] = createSignal<Referrer[]>([]);
  const [refreshes, setRefreshes] = createSignal(0);
  // The save in flight, if any. Not reactive state: only navigation reads it.
  let saving: Promise<unknown> | undefined;

  const reportDirty = (value: boolean) => {
    setDirty(value);
    props.onDirtyChange?.(value);
  };

  // Leaving an unsaved new document drops it.
  createEffect(
    () => loc().id,
    (id) => {
      if (draft && draft.doc.id !== id) {
        draft = undefined;
        setDraftRow(null);
      }
    },
  );

  /**
   * Goes somewhere: through the app when it keeps the location (its guard
   * decides); otherwise after a save in flight, asking if changes are
   * unsaved. Resolves false if the admin itself declined.
   */
  const go = async (to: AdminLocation): Promise<boolean> => {
    setBlocked([]);
    if (props.location && props.onNavigate) {
      props.onNavigate(to);
      return true;
    }
    if (saving) await saving.catch(() => {});
    if (dirty() && !window.confirm('Leave this document? Your unsaved changes will be lost.')) return false;
    setOwn(to);
    return true;
  };

  const save = (c: AnyCollection, next: Doc): Promise<SaveResult> => {
    const pending = props.content.save(c.name, next).then((result) => {
      if (result.ok) {
        if (draft?.doc.id === next.id) setDraftRow(null);
        refresh(list);
      }
      return result;
    });
    saving = pending;
    const done = () => {
      if (saving === pending) saving = undefined;
    };
    pending.then(done, done);
    return pending;
  };

  /** Opens a new, unsaved document; nothing is stored until its first save. */
  const create = async (c: AnyCollection, slug: string) => {
    const previous = draft;
    const created = { collection: c.name, doc: c.create(slug) };
    draft = created;
    setDraftRow(created);
    if (!(await go({ collection: c.name, id: created.doc.id }))) {
      draft = previous;
      setDraftRow(previous ?? null);
    }
  };

  const remove = async (c: AnyCollection, target: Doc) => {
    if (!window.confirm(`Delete "${c.titleOf(target)}"? This can't be undone.`)) return;
    if (draft?.doc.id === target.id && draftRow()) {
      draft = undefined;
      setDraftRow(null);
      reportDirty(false);
      void go({ collection: c.name });
      return;
    }
    const result = await props.content.remove(c.name, target.id);
    if (!result.ok) {
      setBlocked(result.referencedBy);
      return;
    }
    // Nothing is unsaved any more: the app's guard mustn't ask.
    reportDirty(false);
    refresh(list);
    setRefreshes((n) => n + 1);
    void go({ collection: c.name });
  };

  const api: AdminApi = {
    get collections() {
      return props.collections;
    },
    get content() {
      return props.content;
    },
    go: (to) => void go(to),
  };

  return (
    <AdminContext value={api}>
      <div class={styles.admin}>
        <nav class={styles.nav} aria-label="Content">
          <ul class={styles.collections}>
            <For each={props.collections}>
              {(c) => (
                <li>
                  <button
                    type="button"
                    class={styles.collection}
                    aria-current={loc().collection === c.name ? 'true' : undefined}
                    onClick={() => void go({ collection: c.name })}
                  >
                    {c.label}
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Show when={collection()} fallback={<p class={common.issue}>Unknown collection "{loc().collection}".</p>}>
            {(c) => (
              <section aria-label={c().label}>
                <h2 class={styles.heading}>{c().label}</h2>
                <Loading fallback={<p class={common.help}>Loading…</p>}>
                  <ol class={styles.docs} aria-label={`${c().label} documents`}>
                    <Show when={draftRow()?.collection === c().name && draftRow()}>
                      {(row) => (
                        <li>
                          <button
                            type="button"
                            class={styles.doc}
                            aria-current={loc().id === row().doc.id ? 'true' : undefined}
                            onClick={() => void go({ collection: row().collection, id: row().doc.id })}
                          >
                            {c().titleOf(row().doc)} <span class={common.help}>(new, unsaved)</span>
                          </button>
                        </li>
                      )}
                    </Show>
                    <For each={list()} keyed={(d) => d.id}>
                      {(d) => (
                        <li>
                          <button
                            type="button"
                            class={styles.doc}
                            aria-current={loc().id === d().id ? 'true' : undefined}
                            onClick={() => void go({ collection: c().name, id: d().id })}
                          >
                            {c().titleOf(d())}
                          </button>
                        </li>
                      )}
                    </For>
                  </ol>
                  <NewForm collection={c()} taken={list().map((d) => d.slug)} onCreate={(slug) => void create(c(), slug)} />
                </Loading>
              </section>
            )}
          </Show>
        </nav>
        <main class={styles.main}>
          <Show when={blocked().length > 0}>
            <div role="alert" class={styles.blocked}>
              <p class={common.issue}>Can't delete: other documents use this one. Change or remove these references first:</p>
              <ul>
                <For each={blocked()}>
                  {(r) => (
                    <li>
                      <button type="button" class={styles.link} onClick={() => void go({ collection: r.collection, id: r.id })}>
                        {referrerLabel(byName().get(r.collection), r)}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
          <Show when={collection()}>
            {(c) => (
              <Show when={loc().id} fallback={<p class={styles.placeholder}>Open a document, or create one.</p>}>
                <Loading fallback={<p class={styles.placeholder}>Loading…</p>}>
                  <Show when={doc()} keyed fallback={<p class={styles.placeholder}>This document doesn't exist (it may have been deleted).</p>}>
                    {(d) => (
                      <Editor
                        bricks={props.bricks}
                        collection={c()}
                        doc={d}
                        isNew={draft?.doc === d}
                        previewUrl={props.previewUrl}
                        refresh={refreshes()}
                        onSave={(next) => save(c(), next)}
                        onRemove={() => void remove(c(), d)}
                        onDirtyChange={reportDirty}
                      />
                    )}
                  </Show>
                </Loading>
              </Show>
            )}
          </Show>
        </main>
      </div>
    </AdminContext>
  );
}

/** "Products › Blue mug › Category" for a reference in a document's fields or one of its bricks. */
function referrerLabel(c: AnyCollection | undefined, r: Referrer): string {
  const where = r.entryId === undefined ? r.path.slice(1) : ['body', ...r.path];
  return [c?.label ?? r.collection, r.title, ...where].join(' › ');
}

/** Creates a document from a slug, checked as it is typed. Nothing is stored until the first save. */
function NewForm(props: { collection: AnyCollection; taken: readonly string[]; onCreate: (slug: string) => void }) {
  const [slug, setSlug] = createSignal('');
  const problem = () => {
    const s = slug();
    if (s === '') return undefined;
    if (!isValidSlug(s)) return 'Use lowercase letters and digits, with single dashes between.';
    if (props.collection.reservedSlugs.includes(s)) return `"${s}" is reserved.`;
    if (props.taken.includes(s)) return `"${s}" is already used.`;
    return undefined;
  };
  return (
    <form
      class={styles.newForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (slug() === '' || problem()) return;
        props.onCreate(slug());
        setSlug('');
      }}
    >
      <label class={styles.newLabel}>
        <span>New document slug</span>
        <input class={styles.input} value={slug()} placeholder="e.g. hello-world" aria-invalid={problem() ? 'true' : undefined} onInput={(e) => setSlug(e.currentTarget.value)} />
      </label>
      <Show when={problem()}>{(message) => <small class={common.issue}>{message()}</small>}</Show>
      <button type="submit" class={common.button} disabled={slug() === '' || problem() !== undefined}>
        Create
      </button>
    </form>
  );
}
