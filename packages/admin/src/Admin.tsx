// <Admin>: the whole admin panel. A rail lists the collections; beside it a
// panel lists the documents of the open one (with a form to create a
// document) or, while a document is open, that document's outline (from
// its <Editor>; the rail button of the open collection shows its list
// again). The rest is the <Editor> for the open document. Where it is (collection and
// document id) can live in the app's URL (`location` + `onNavigate`, so
// the app's own leave guard covers switching documents) or in the admin
// itself, which then asks before leaving unsaved changes. With a blob store
// (`content.assets`), the rail's Assets button opens the asset library.
// An `orderable` collection's documents can be reordered in the list: drag
// a row, or use its move up/down buttons (`content.move`).
import {
  collectionMap,
  isValidSlug,
  resolveUrl,
  type AssetKind,
  type AnyBrick,
  type AnyCollection,
  type Content,
  type Doc,
  type Referrer,
  type SaveResult,
} from '@mortar-kit/core';
import { createEffect, createMemo, createSignal, flush, For, Loading, onSettled, refresh, Show } from 'solid-js';

import { Account, type AdminUser } from './Account.tsx';
import styles from './Admin.module.css';
import { AssetLibrary } from './AssetLibrary.tsx';
import { AdminContext, type AdminApi, type AdminLocation } from './context.ts';
import { Editor } from './Editor.tsx';
import common from './common.module.css';
import { errorMessage } from './errors.ts';
import { CloseIcon, DownIcon, GripIcon, UpIcon } from './icons.tsx';
import { Mark } from './Mark.tsx';
import { referrerLabel } from './referrer.ts';

/** The asset library's filters, in the panel. */
const KINDS: readonly [label: string, kind: AssetKind | undefined][] = [
  ['All files', undefined],
  ['Images', 'image'],
  ['Video', 'video'],
  ['Audio', 'audio'],
  ['Documents', 'document'],
];

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
  /**
   * Maps a URL of the site to the document it shows, e.g. `/posts/hello` to
   * `{ collection: 'posts', slug: 'hello' }`. ⌘/Ctrl-clicking a link in the
   * preview opens that document in the admin; a link it doesn't map opens
   * in a new tab. Default: the collections' `url` patterns (`resolveUrl`).
   */
  resolveLink?: (url: URL) => { collection: string; slug: string } | undefined;
  /** The signed-in user (`auth.user()` from `@mortar-kit/auth`): shown at the foot of the rail, with Sign out. */
  user?: AdminUser | null;
  /** Where Sign out posts. Default `/admin/auth/sign-out`. */
  signOutUrl?: string;
}

export function Admin(props: AdminProps) {
  const [own, setOwn] = createSignal<AdminLocation>(() => ({ collection: props.collections[0]?.name ?? '' }));
  const loc = () => props.location ?? own();
  const inAssets = () => loc().view === 'assets' && props.content.assets !== undefined;
  const [kind, setKind] = createSignal<AssetKind | undefined>(undefined);
  const byName = createMemo(() => collectionMap(props.collections));
  const collection = createMemo(() => byName().get(loc().collection));
  const list = createMemo(() => {
    const c = collection();
    return c && !inAssets() ? props.content.list(c.name) : [];
  });

  // A new document not saved yet. A plain variable for the open document (so
  // saving it never makes the editor reload), a signal for the sidebar row.
  // `pending` is one just created, until the location reaches it (the app's
  // guard may decline); then it becomes `draft`, the open one.
  let draft: { collection: string; doc: Doc } | undefined;
  let pending: { collection: string; doc: Doc } | undefined;
  const [draftRow, setDraftRow] = createSignal<{ collection: string; doc: Doc } | null>(null);
  const isDraft = (d: Doc) => draft?.doc === d || pending?.doc === d;
  const doc = createMemo(() => {
    const { collection: name, id } = loc();
    if (!id || !byName().has(name) || inAssets()) return null;
    for (const d of [draft, pending]) if (d && d.collection === name && d.doc.id === id) return d.doc;
    return props.content.get(name, { id });
  });

  const [dirty, setDirty] = createSignal(false);
  const [blocked, setBlocked] = createSignal<Referrer[]>([]);
  const [refreshes, setRefreshes] = createSignal(0);
  // The panel's slot for the editor's outline, and whether the panel shows the document list instead.
  let outlineSlot: HTMLElement | undefined;
  const [outline, setOutline] = createSignal<HTMLElement>();
  onSettled(() => {
    setOutline(outlineSlot);
  });
  const [listing, setListing] = createSignal(false);
  const showList = () => !loc().id || !collection() || listing();
  // The save in flight, if any. Not reactive state: only navigation reads it.
  let saving: Promise<unknown> | undefined;

  const reportDirty = (value: boolean) => {
    setDirty(value);
    props.onDirtyChange?.(value);
  };

  // Arriving at a new document opens it; leaving an unsaved one drops it.
  createEffect(
    () => loc().id,
    (id) => {
      setListing(false);
      if (pending && pending.doc.id === id) {
        draft = pending;
        pending = undefined;
        setDraftRow(draft);
      } else if (draft && draft.doc.id !== id) {
        draft = undefined;
        setDraftRow(null);
      }
    },
  );

  /**
   * Goes somewhere: through the app when it keeps the location (its guard
   * decides); otherwise after a save in flight, asking if changes are
   * unsaved (unless `force`).
   */
  const go = async (to: AdminLocation, force = false): Promise<void> => {
    setBlocked([]);
    if (props.location && props.onNavigate) {
      props.onNavigate(to);
      return;
    }
    if (saving) await saving.catch(() => {});
    if (!force && dirty() && !window.confirm('Leave this document? Your unsaved changes will be lost.')) return;
    setOwn(to);
  };

  const save = (c: AnyCollection, next: Doc): Promise<SaveResult> => {
    const pending = props.content.save(c.name, next).then((result) => {
      if (result.ok) {
        if (draft?.doc.id === next.id) setDraftRow(null);
        // After the editor has marked itself saved: writes made while the
        // list refreshes would wait for it, and the app's guard reads them.
        setTimeout(() => refresh(list));
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
  const create = (c: AnyCollection, slug: string) => {
    pending = { collection: c.name, doc: c.create(slug) };
    void go({ collection: c.name, id: pending.doc.id });
  };

  // Reordering an orderable collection: the row being dragged, the gap it
  // would drop into (an index from 0 to the number of rows), and the last
  // move's failure.
  const [dragged, setDragged] = createSignal<string | null>(null);
  const [dropAt, setDropAt] = createSignal<number | null>(null);
  const [listError, setListError] = createSignal<string | null>(null);
  const canReorder = (c: AnyCollection) => c.orderable && props.content.move !== undefined;

  /** Moves a document to `index` in the manual order, then shows the list as stored. */
  const move = async (c: AnyCollection, id: string, index: number) => {
    setListError(null);
    try {
      await props.content.move?.(c.name, id, index);
    } catch (error) {
      setListError(`Couldn't reorder: ${await errorMessage(error)}`);
    }
    refresh(list);
  };

  /** Drops the dragged row into the gap it is over, if that moves it. */
  const drop = (c: AnyCollection, rows: readonly Doc[]) => {
    const id = dragged();
    const at = dropAt();
    setDragged(null);
    setDropAt(null);
    const from = rows.findIndex((d) => d.id === id);
    if (id === null || at === null || from === -1) return;
    const to = at > from ? at - 1 : at;
    if (to !== from) void move(c, id, to);
  };

  /** Back to the collection's list with nothing unsaved (the document is gone), so neither the admin nor the app asks. */
  const leaveRemoved = (c: AnyCollection) => {
    reportDirty(false);
    // Apply the dirty change now: the app's guard reads it as soon as it navigates.
    flush();
    void go({ collection: c.name }, true);
  };

  const remove = async (c: AnyCollection, target: Doc) => {
    if (!window.confirm(`Delete "${c.titleOf(target)}"? This can't be undone.`)) return;
    if (draft?.doc.id === target.id && draftRow()) {
      leaveRemoved(c);
      return;
    }
    setListError(null);
    let result;
    try {
      result = await props.content.remove(c.name, target.id);
    } catch (error) {
      setListError(`Couldn't delete "${c.titleOf(target)}": ${await errorMessage(error)}`);
      return;
    }
    if (!result.ok) {
      setBlocked(result.referencedBy);
      return;
    }
    // Leave first: refreshing the list starts an async refresh, and writes
    // made while it is in flight (the dirty change) would wait for it.
    leaveRemoved(c);
    refresh(list);
    setRefreshes((n) => n + 1);
  };

  const api: AdminApi = {
    get collections() {
      return props.collections;
    },
    get content() {
      return props.content;
    },
    go: (to) => void go(to),
    outline: () => outline(),
    showList: () => setListing(true),
  };

  /** A link ⌘/Ctrl-clicked in the preview: open the document it shows, or a new tab. */
  const followLink = async (url: URL) => {
    const target = props.resolveLink ? props.resolveLink(url) : resolveUrl(props.collections, url);
    const found = target && byName().has(target.collection) ? await props.content.get(target.collection, { slug: target.slug }) : null;
    if (target && found) void go({ collection: target.collection, id: found.id });
    else window.open(url.href, '_blank', 'noopener');
  };

  /** A rail button: the open collection's shows its document list again; another opens that collection. */
  const pick = (c: AnyCollection) => {
    if (loc().collection === c.name && loc().id && !inAssets()) setListing(true);
    else void go({ collection: c.name });
  };

  /** A document row: the open document goes back to its outline; another opens. */
  const openDoc = (collectionName: string, id: string) => {
    if (loc().collection === collectionName && loc().id === id) setListing(false);
    else void go({ collection: collectionName, id });
  };

  /** Where the drop line shows on row `index` of `count`: above it, or below the last row. Not where the drop would change nothing. */
  const dropMark = (index: number, count: number): 'before' | 'after' | undefined => {
    const at = dropAt();
    const from = list().findIndex((d) => d.id === dragged());
    if (at === null || from === -1 || at === from || at === from + 1) return undefined;
    if (at === index) return 'before';
    return at === count && index === count - 1 ? 'after' : undefined;
  };

  return (
    <AdminContext value={api}>
      <div class={styles.admin}>
        <nav class={styles.rail} aria-label="Content">
          <Mark />
          <ul class={styles.collections}>
            <For each={props.collections}>
              {(c) => (
                <li>
                  <button
                    type="button"
                    class={styles.collection}
                    data-initial={c.label.slice(0, 2)}
                    aria-current={loc().collection === c.name && !inAssets() ? 'true' : undefined}
                    onClick={() => pick(c)}
                  >
                    {c.label}
                  </button>
                </li>
              )}
            </For>
          </ul>
          <div class={styles.foot}>
            <Show when={props.content.assets}>
              <button
                type="button"
                class={styles.collection}
                data-initial="As"
                aria-current={inAssets() ? 'true' : undefined}
                onClick={() => void go({ collection: loc().collection, view: 'assets' })}
              >
                Assets
              </button>
            </Show>
            <Show when={props.user}>{(user) => <Account user={user()} signOutUrl={props.signOutUrl ?? '/admin/auth/sign-out'} />}</Show>
          </div>
        </nav>
        <aside class={styles.panel}>
          <Show when={inAssets()}>
            <section aria-label="Assets" class={styles.listSection}>
              <h2 class={styles.heading}>Assets</h2>
              <ul class={styles.docs} aria-label="Show">
                <For each={KINDS}>
                  {([label, k]) => (
                    <li>
                      <button type="button" class={styles.doc} aria-current={kind() === k ? 'true' : undefined} onClick={() => setKind(k)}>
                        {label}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>
          <div class={styles.list} hidden={!showList() || inAssets()}>
            <Show when={collection()} fallback={<p class={[styles.pad, common.issue]}>Unknown collection "{loc().collection}".</p>}>
              {(c) => (
                <section aria-label={c().label} class={styles.listSection}>
                  <h2 class={styles.heading}>{c().label}</h2>
                  <Loading fallback={<p class={[styles.pad, common.help]}>Loading…</p>}>
                    <ol class={styles.docs} aria-label={`${c().label} documents`}>
                      <Show when={!canReorder(c()) && draftRow()?.collection === c().name && draftRow()}>
                        {(row) => <DraftRow label={c().titleOf(row().doc)} current={loc().id === row().doc.id} onOpen={() => openDoc(row().collection, row().doc.id)} />}
                      </Show>
                      <For each={list()} keyed={(d) => d.id}>
                        {(d, i) => (
                          <Show
                            when={canReorder(c())}
                            fallback={
                              <li>
                                <button
                                  type="button"
                                  class={styles.doc}
                                  aria-current={loc().id === d().id ? 'true' : undefined}
                                  onClick={() => openDoc(c().name, d().id)}
                                >
                                  {c().titleOf(d())}
                                </button>
                              </li>
                            }
                          >
                            <li
                              class={styles.docRow}
                              draggable="true"
                              data-dragging={dragged() === d().id ? '' : undefined}
                              data-drop={dropMark(i(), list().length)}
                              onDragStart={(e) => {
                                setDragged(d().id);
                                if (e.dataTransfer) {
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', c().titleOf(d()));
                                }
                              }}
                              onDragOver={(e) => {
                                if (dragged() === null) return;
                                e.preventDefault();
                                const box = e.currentTarget.getBoundingClientRect();
                                setDropAt(i() + (e.clientY > box.top + box.height / 2 ? 1 : 0));
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                drop(c(), list());
                              }}
                              onDragEnd={() => {
                                setDragged(null);
                                setDropAt(null);
                              }}
                            >
                              <span class={styles.grip} aria-hidden="true">
                                <GripIcon />
                              </span>
                              <button
                                type="button"
                                class={styles.doc}
                                aria-current={loc().id === d().id ? 'true' : undefined}
                                onClick={() => openDoc(c().name, d().id)}
                              >
                                {c().titleOf(d())}
                              </button>
                              <div class={styles.rowActions}>
                                <button
                                  type="button"
                                  class={styles.iconButton}
                                  aria-label={`Move ${c().titleOf(d())} up`}
                                  title="Move up"
                                  disabled={i() === 0}
                                  onClick={() => void move(c(), d().id, i() - 1)}
                                >
                                  <UpIcon />
                                </button>
                                <button
                                  type="button"
                                  class={styles.iconButton}
                                  aria-label={`Move ${c().titleOf(d())} down`}
                                  title="Move down"
                                  disabled={i() === list().length - 1}
                                  onClick={() => void move(c(), d().id, i() + 1)}
                                >
                                  <DownIcon />
                                </button>
                              </div>
                            </li>
                          </Show>
                        )}
                      </For>
                      <Show when={canReorder(c()) && draftRow()?.collection === c().name && draftRow()}>
                        {(row) => <DraftRow label={c().titleOf(row().doc)} current={loc().id === row().doc.id} onOpen={() => openDoc(row().collection, row().doc.id)} />}
                      </Show>
                    </ol>
                    <Show when={listError()}>
                      {(message) => (
                        <p role="alert" class={[styles.pad, common.issue]}>
                          {message()}
                        </p>
                      )}
                    </Show>
                    <NewForm collection={c()} taken={list().map((d) => d.slug)} onCreate={(slug) => create(c(), slug)} />
                  </Loading>
                </section>
              )}
            </Show>
          </div>
          <div class={styles.outline} hidden={showList() || inAssets()} ref={(el) => (outlineSlot = el)} />
        </aside>
        <main class={styles.main}>
          <Show when={blocked().length > 0}>
            <div role="alert" class={styles.blocked}>
              <div class={styles.blockedHead}>
                <p class={common.issue}>Can't delete: other documents use this one. Change or remove these references first:</p>
                <button type="button" class={common.button} aria-label="Dismiss" onClick={() => setBlocked([])}>
                  <CloseIcon />
                </button>
              </div>
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
          <Show when={inAssets() && props.content.assets}>
            {(assets) => (
              <div class={styles.library}>
                <AssetLibrary assets={assets()} accept={kind() ? [kind() as AssetKind] : undefined} />
              </div>
            )}
          </Show>
          <Show when={!inAssets() && collection()}>
            {(c) => (
              <Show when={loc().id} fallback={<p class={styles.placeholder}>Open a document, or create one.</p>}>
                <Loading fallback={<p class={styles.placeholder}>Loading…</p>}>
                  <Show when={doc()} keyed fallback={<p class={styles.placeholder}>This document doesn't exist (it may have been deleted).</p>}>
                    {(d) => (
                      <Editor
                        bricks={props.bricks}
                        collection={c()}
                        doc={d}
                        isNew={isDraft(d)}
                        previewUrl={props.previewUrl}
                        refresh={refreshes()}
                        onSave={(next) => save(c(), next)}
                        onRemove={() => void remove(c(), d)}
                        onDirtyChange={reportDirty}
                        onFollowLink={(url) => void followLink(url)}
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

/** The row of a new, unsaved document: first in the list, or last in a manually ordered one (where it will go). */
function DraftRow(props: { label: string; current: boolean; onOpen: () => void }) {
  return (
    <li>
      <button type="button" class={styles.doc} aria-current={props.current ? 'true' : undefined} onClick={() => props.onOpen()}>
        {props.label} <span class={styles.new}>(new, unsaved)</span>
      </button>
    </li>
  );
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
