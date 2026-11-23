// The asset library: every uploaded file as a grid of tiles, with upload by
// button or drag and drop, search (name, title, alt text) and folders. It
// manages assets in the admin's Assets view (open a file in the viewer to
// set its default title and alt text or its folder, copy its URL, delete
// it, refused while documents use the file) and picks one for an image or
// file field in <AssetPicker>, a modal dialog around it. Uploads go into
// the folder being shown. Details and folders need `Assets.update` and the
// folder methods; without them the library hides those controls.
import { assetExtensions, collectionMap, type Asset, type AssetFolder, type AssetKind, type Assets, type Referrer } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, Loading, Match, onSettled, refresh, Show, Switch } from 'solid-js';

import styles from './AssetLibrary.module.css';
import common from './common.module.css';
import { errorMessage } from './errors.ts';
import { useAdmin } from './context.ts';
import { CloseIcon, CopyIcon, FileIcon, FolderIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon } from './icons.tsx';
import { referrerLabel } from './referrer.ts';

export interface AssetLibraryProps {
  assets: Assets;
  /** Only files of these kinds are shown and can be uploaded. Default: every kind. */
  accept?: readonly AssetKind[];
  /** Picks a file (a field's picker). Without it, the library manages files: details, copy URL, delete. */
  onPick?: (asset: Asset) => void;
}

/** "1.2 MB", "340 KB", "12 B". */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Whether an asset matches a search: every word appears in its name, title or alt text (ignoring case). */
export function matchesSearch(asset: Asset, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${asset.name} ${asset.title} ${asset.alt}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

const KIND_NAMES: Record<AssetKind, string> = { image: 'images', video: 'videos', audio: 'audio', document: 'PDFs' };

/** The folder filter: every file, files in no folder, or a folder's id. */
const ALL = '*';
const UNFILED = '';

export function AssetLibrary(props: AssetLibraryProps) {
  const admin = useAdmin();
  const all = createMemo(() => props.assets.list());
  const folders = createMemo(async (): Promise<AssetFolder[]> => (props.assets.folders ? props.assets.folders() : []));
  const hasFolders = () => props.assets.folders !== undefined && props.assets.saveFolder !== undefined;
  const [folder, setFolder] = createSignal(ALL);
  // A folder deleted elsewhere (or in another tab) falls back to every file.
  const current = () => (folder() === ALL || folder() === UNFILED || folders().some((f) => f.id === folder()) ? folder() : ALL);
  const currentFolder = () => folders().find((f) => f.id === current());
  const [query, setQuery] = createSignal('');
  const shown = () =>
    all().filter(
      (a) =>
        (!props.accept || props.accept.includes(a.kind)) &&
        (current() === ALL || a.folder === current() || (current() === UNFILED && !folders().some((f) => f.id === a.folder))) &&
        matchesSearch(a, query()),
    );
  const [busy, setBusy] = createSignal(0);
  const [problems, setProblems] = createSignal<string[]>([]);
  const [blocked, setBlocked] = createSignal<{ asset: Asset; by: Referrer[] } | null>(null);
  const [dragging, setDragging] = createSignal(false);
  const [copied, setCopied] = createSignal('');
  const [viewing, setViewing] = createSignal('');
  const viewed = () => all().find((a) => a.key === viewing());
  const [naming, setNaming] = createSignal<'new' | 'rename' | null>(null);
  const acceptAttr = () => assetExtensions(props.accept).map((ext) => `.${ext}`).join(',');
  const what = () => (props.accept ? props.accept.map((k) => KIND_NAMES[k]).join(', ') : 'images, videos, audio or PDFs');

  const upload = async (files: readonly File[]) => {
    if (files.length === 0) return;
    setProblems([]);
    setBlocked(null);
    setBusy((n) => n + files.length);
    const added: Asset[] = [];
    const failed: string[] = [];
    const allowed = assetExtensions(props.accept);
    // Into the folder being shown.
    const into = currentFolder()?.id;
    for (const file of files) {
      try {
        if (props.accept && !allowed.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) {
          failed.push(`"${file.name}" isn't one of the ${what()} this takes`);
          continue;
        }
        const result = await (into ? props.assets.upload(file, { folder: into }) : props.assets.upload(file));
        if (result.ok) added.push(result.asset);
        else failed.push(result.message);
      } catch (error) {
        failed.push(`"${file.name}" didn't upload: ${await errorMessage(error)}`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    setProblems(failed);
    refresh(all);
    // Uploading one file into a picker picks it.
    const only = added.length === 1 && failed.length === 0 ? added[0] : undefined;
    if (only && props.onPick) props.onPick(only);
  };

  const remove = async (asset: Asset) => {
    if (!window.confirm(`Delete "${asset.name}"? This can't be undone.`)) return;
    setProblems([]);
    let result;
    try {
      result = await props.assets.remove(asset.key);
    } catch (error) {
      setViewing('');
      setProblems([`Couldn't delete "${asset.name}": ${await errorMessage(error)}`]);
      return;
    }
    if (!result.ok) {
      setViewing('');
      setBlocked({ asset, by: result.referencedBy });
      return;
    }
    setBlocked(null);
    setViewing('');
    refresh(all);
  };

  const copy = async (asset: Asset) => {
    const url = new URL(asset.src, window.location.href).href;
    await navigator.clipboard?.writeText(url);
    setCopied(asset.key);
    setTimeout(() => setCopied((key) => (key === asset.key ? '' : key)), 1500);
  };

  const saveFolder = async (name: string): Promise<string | undefined> => {
    const save = props.assets.saveFolder;
    if (!save) return undefined;
    const renaming = naming() === 'rename' ? currentFolder() : undefined;
    let result;
    try {
      result = await save(renaming ? { id: renaming.id, name } : { name });
    } catch (error) {
      return errorMessage(error);
    }
    if (!result.ok) return result.message;
    setNaming(null);
    refresh(folders);
    setFolder(result.folder.id);
    return undefined;
  };

  const removeFolder = async (f: AssetFolder) => {
    if (!props.assets.removeFolder) return;
    if (!window.confirm(`Delete the folder "${f.name}"? Its files are kept, in no folder.`)) return;
    setProblems([]);
    try {
      await props.assets.removeFolder(f.id);
    } catch (error) {
      setProblems([`Couldn't delete the folder "${f.name}": ${await errorMessage(error)}`]);
      return;
    }
    setFolder(ALL);
    refresh(folders);
    refresh(all);
  };

  const folderName = (a: Asset) => folders().find((f) => f.id === a.folder)?.name;

  return (
    <section
      class={styles.library}
      aria-label="Asset library"
      data-dragging={dragging() ? '' : undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload([...(e.dataTransfer?.files ?? [])]);
      }}
    >
      <div class={styles.bar}>
        <label class={styles.upload}>
          <UploadIcon />
          Upload
          <input
            type="file"
            class={styles.fileInput}
            multiple
            accept={acceptAttr()}
            onChange={(e) => {
              const files = [...(e.currentTarget.files ?? [])];
              e.currentTarget.value = '';
              void upload(files);
            }}
          />
        </label>
        <span class={[common.help, styles.status]}>
          <Show
            when={busy() > 0}
            fallback={
              <Loading fallback={<>Or drop {what()} here.</>}>
                Or drop {what()} here
                <Show when={currentFolder()} fallback=".">
                  {(f) => <> to add them to {f().name}.</>}
                </Show>
              </Loading>
            }
          >
            Uploading {busy()} {busy() === 1 ? 'file' : 'files'}…
          </Show>
        </span>
        <label class={styles.search}>
          <SearchIcon />
          <input
            type="search"
            aria-label="Search assets"
            placeholder="Search name, title, alt text"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </label>
      </div>
      <Show when={hasFolders()}>
        <Loading>
          <div class={styles.folders} role="group" aria-label="Folders">
            <FolderChip label="All folders" current={current() === ALL} onClick={() => setFolder(ALL)} />
            <Show when={folders().length > 0}>
              <FolderChip label="Unfiled" current={current() === UNFILED} onClick={() => setFolder(UNFILED)} />
            </Show>
            <For each={folders()} keyed={(f) => f.id}>
              {(f) => <FolderChip label={f().name} icon current={current() === f().id} onClick={() => setFolder(f().id)} />}
            </For>
            <Show
              when={naming()}
              fallback={
                <>
                  <button type="button" class={styles.chipAction} onClick={() => setNaming('new')}>
                    <PlusIcon />
                    New folder
                  </button>
                  <Show when={currentFolder()}>
                    {(f) => (
                      <span class={styles.folderActions}>
                        <button type="button" class={styles.chipAction} aria-label={`Rename the folder ${f().name}`} onClick={() => setNaming('rename')}>
                          <PencilIcon />
                          Rename
                        </button>
                        <button type="button" class={styles.chipAction} aria-label={`Delete the folder ${f().name}`} onClick={() => void removeFolder(f())}>
                          <TrashIcon />
                          Delete folder
                        </button>
                      </span>
                    )}
                  </Show>
                </>
              }
            >
              {(mode) => (
                <FolderNameForm
                  label={mode() === 'new' ? 'New folder name' : 'Folder name'}
                  initial={mode() === 'rename' ? (currentFolder()?.name ?? '') : ''}
                  submit={mode() === 'new' ? 'Create' : 'Rename'}
                  onSubmit={saveFolder}
                  onCancel={() => setNaming(null)}
                />
              )}
            </Show>
          </div>
        </Loading>
      </Show>
      <Show when={problems().length > 0}>
        <ul role="alert" class={styles.problems}>
          <For each={problems()}>{(message) => <li class={common.issue}>{message}</li>}</For>
        </ul>
      </Show>
      <Show when={blocked()}>
        {(b) => (
          <div role="alert" class={styles.problems}>
            <div class={styles.blockedHead}>
              <p class={common.issue}>Can't delete "{b().asset.name}": documents use it. Change or remove these first:</p>
              <button type="button" class={common.button} aria-label="Dismiss" onClick={() => setBlocked(null)}>
                <CloseIcon />
              </button>
            </div>
            <ul>
              <For each={b().by}>
                {(r) => (
                  <li>
                    <Show when={admin} fallback={r.title}>
                      {(a) => (
                        <button type="button" class={styles.link} onClick={() => a().go({ collection: r.collection, id: r.id })}>
                          {referrerLabel(collectionMap(a().collections).get(r.collection), r)}
                        </button>
                      )}
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </div>
        )}
      </Show>
      <Loading fallback={<p class={styles.empty}>Loading…</p>}>
        <Show
          when={shown().length > 0}
          fallback={
            <p class={styles.empty}>
              <Switch fallback={<>No {what()} yet.</>}>
                <Match when={query().trim() !== ''}>Nothing matches "{query().trim()}".</Match>
                <Match when={currentFolder()}>{(f) => <>{f().name} is empty. Upload or drop files to add them.</>}</Match>
                <Match when={current() === UNFILED}>Every file is in a folder.</Match>
              </Switch>
            </p>
          }
        >
          <ul class={styles.grid} aria-label="Assets">
            <For each={shown()} keyed={(a) => a.key}>
              {(asset) => (
                <li class={styles.tile}>
                  <Show
                    when={props.onPick}
                    fallback={
                      <>
                        <button type="button" class={styles.pick} aria-label={`Open ${asset().name}`} onClick={() => setViewing(asset().key)}>
                          <Preview asset={asset()} />
                          <Caption asset={asset()} folder={current() === ALL ? folderName(asset()) : undefined} />
                        </button>
                        <div class={styles.actions}>
                          <button type="button" class={styles.action} aria-label={`Copy the URL of ${asset().name}`} title="Copy URL" onClick={() => void copy(asset())}>
                            <CopyIcon />
                            <Show when={copied() === asset().key}>
                              <span class={styles.copied}>Copied</span>
                            </Show>
                          </button>
                          <button type="button" class={styles.action} aria-label={`Delete ${asset().name}`} title="Delete" onClick={() => void remove(asset())}>
                            <TrashIcon />
                          </button>
                        </div>
                      </>
                    }
                  >
                    {(pick) => (
                      <>
                        <button type="button" class={styles.pick} aria-label={`Choose ${asset().name}`} onClick={() => pick()(asset())}>
                          <Preview asset={asset()} />
                          <Caption asset={asset()} folder={current() === ALL ? folderName(asset()) : undefined} />
                        </button>
                        <Show when={props.assets.update}>
                          <div class={styles.actions}>
                            <button type="button" class={styles.action} aria-label={`Edit the details of ${asset().name}`} title="Edit details" onClick={() => setViewing(asset().key)}>
                              <PencilIcon />
                            </button>
                          </div>
                        </Show>
                      </>
                    )}
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={viewed()}>
          {(asset) => (
            <AssetViewer
              asset={asset()}
              assets={props.assets}
              folders={folders()}
              copied={copied() === asset().key}
              onCopy={() => void copy(asset())}
              onSaved={() => refresh(all)}
              onDelete={props.onPick ? undefined : () => void remove(asset())}
              onPick={props.onPick}
              onClose={() => setViewing('')}
            />
          )}
        </Show>
      </Loading>
    </section>
  );
}

function FolderChip(props: { label: string; current: boolean; icon?: boolean; onClick: () => void }) {
  return (
    <button type="button" class={styles.chip} aria-pressed={props.current ? 'true' : 'false'} onClick={() => props.onClick()}>
      <Show when={props.icon}>
        <FolderIcon />
      </Show>
      {props.label}
    </button>
  );
}

/** A folder name typed in place: Enter saves, Escape cancels. Problems (a taken name) show beside it. */
function FolderNameForm(props: { label: string; initial: string; submit: string; onSubmit: (name: string) => Promise<string | undefined>; onCancel: () => void }) {
  const [problem, setProblem] = createSignal('');
  let input: HTMLInputElement | undefined;
  onSettled(() => {
    input?.focus();
    input?.select();
  });
  return (
    <form
      class={styles.folderForm}
      onSubmit={(e) => {
        e.preventDefault();
        void props.onSubmit(input?.value ?? '').then((message) => setProblem(message ?? ''));
      }}
    >
      <input
        ref={(el) => (input = el)}
        class={styles.folderInput}
        aria-label={props.label}
        value={props.initial}
        maxlength={60}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Inside a dialog, Escape would close it too.
          e.preventDefault();
          e.stopPropagation();
          props.onCancel();
        }}
      />
      <button type="submit" class={common.button}>
        {props.submit}
      </button>
      <button type="button" class={common.button} onClick={() => props.onCancel()}>
        Cancel
      </button>
      <Show when={problem()}>
        <small class={common.issue} role="alert">
          {problem()}
        </small>
      </Show>
    </form>
  );
}

/** A tile's picture: the image, a video frame, or a file icon with the extension. */
function Preview(props: { asset: Asset; large?: boolean }) {
  return (
    <div class={props.large ? styles.viewerPreview : styles.preview}>
      <Switch
        fallback={
          <span class={styles.fileKind}>
            <FileIcon />
            {props.asset.name.split('.').pop()}
          </span>
        }
      >
        <Match when={props.asset.kind === 'image'}>
          <img src={props.asset.src} alt={props.large ? props.asset.alt : ''} loading="lazy" />
        </Match>
        <Match when={props.asset.kind === 'video'}>
          <video src={props.asset.src} muted={!props.large} controls={props.large} preload="metadata" />
        </Match>
        <Match when={props.large && props.asset.kind === 'audio'}>
          <audio src={props.asset.src} controls preload="metadata" />
        </Match>
      </Switch>
    </div>
  );
}

function Caption(props: { asset: Asset; folder?: string }) {
  return (
    <div class={styles.caption}>
      <span class={styles.name} title={props.asset.name}>
        {props.asset.title || props.asset.name}
      </span>
      <span class={common.help}>
        {formatSize(props.asset.size)}
        <Show when={props.folder}>{(name) => <> · {name()}</>}</Show>
      </span>
    </div>
  );
}

/**
 * A modal dialog over the admin, centred whatever the page's own CSS does
 * (resets such as `* { margin: 0 }` would otherwise pin it to the top
 * left). Render it while open; it opens when mounted. Escape or the close
 * button calls `onClose`.
 */
function Modal(props: { title: string; wide?: boolean; onClose: () => void; children: JSX.Element }) {
  let dialog: HTMLDialogElement | undefined;
  onSettled(() => {
    if (!dialog) return;
    // jsdom has no showModal; the open attribute shows it there.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  return (
    <dialog
      ref={(el) => (dialog = el)}
      class={props.wide ? styles.dialog : styles.viewer}
      aria-label={props.title}
      onCancel={(e) => {
        // Close through the owner, which unmounts the dialog.
        e.preventDefault();
        props.onClose();
      }}
      onClose={() => props.onClose()}
    >
      <div class={styles.dialogHead}>
        <h2 class={styles.dialogTitle}>{props.title}</h2>
        <button type="button" class={common.button} aria-label="Close" onClick={() => props.onClose()}>
          <CloseIcon />
        </button>
      </div>
      {props.children}
    </dialog>
  );
}

interface AssetViewerProps {
  asset: Asset;
  assets: Assets;
  folders: AssetFolder[];
  copied: boolean;
  onCopy: () => void;
  onSaved: () => void;
  /** Deletes the file (the Assets view). */
  onDelete?: () => void;
  /** Picks the file (a field's picker). */
  onPick?: (asset: Asset) => void;
  onClose: () => void;
}

/**
 * One file, large, with its details: default title and alt text (copied
 * into a field when the file is picked), folder, type, size and URL.
 */
function AssetViewer(props: AssetViewerProps) {
  // Writable, and reset when the file's saved details change.
  const [title, setTitle] = createSignal(() => props.asset.title);
  const [alt, setAlt] = createSignal(() => props.asset.alt);
  const [folder, setFolder] = createSignal(() => props.asset.folder);
  const [saving, setSaving] = createSignal(false);
  const [problem, setProblem] = createSignal('');
  const [saved, setSaved] = createSignal(false);
  const editable = () => props.assets.update !== undefined;
  const changed = () => title() !== props.asset.title || alt() !== props.asset.alt || folder() !== props.asset.folder;

  const save = async (): Promise<Asset | undefined> => {
    const update = props.assets.update;
    if (!update) return props.asset;
    if (!changed()) return props.asset;
    setSaving(true);
    setProblem('');
    try {
      const details = props.asset.kind === 'image' ? { title: title(), alt: alt(), folder: folder() } : { title: title(), folder: folder() };
      const result = await update(props.asset.key, details);
      if (!result.ok) {
        setProblem(result.message);
        return undefined;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      props.onSaved();
      return result.asset;
    } catch (error) {
      setProblem(await errorMessage(error));
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={props.asset.title || props.asset.name} onClose={() => props.onClose()}>
      <div class={styles.viewerBody}>
        <Preview asset={props.asset} large />
        <form
          class={styles.viewerForm}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label class={styles.formField}>
            <span class={styles.formLabel}>Title</span>
            <input class={styles.formInput} value={title()} maxlength={200} disabled={!editable()} onInput={(e) => setTitle(e.currentTarget.value)} />
          </label>
          <Show when={props.asset.kind === 'image'}>
            <div class={styles.formField}>
              <label class={styles.formField}>
                <span class={styles.formLabel}>Alt text</span>
                <textarea
                  class={styles.formInput}
                  rows={3}
                  value={alt()}
                  maxlength={1000}
                  disabled={!editable()}
                  aria-describedby={`${props.asset.key}-alt-help`}
                  onInput={(e) => setAlt(e.currentTarget.value)}
                />
              </label>
              <small id={`${props.asset.key}-alt-help`} class={common.help}>
                Describes the image for people who can't see it. Image fields that pick it start with this.
              </small>
            </div>
          </Show>
          <Show when={props.assets.folders}>
            <label class={styles.formField}>
              <span class={styles.formLabel}>Folder</span>
              <select class={styles.formInput} disabled={!editable()} onChange={(e) => setFolder(e.currentTarget.value)}>
                <option value="" selected={folder() === ''}>
                  No folder
                </option>
                <For each={props.folders} keyed={(f) => f.id}>
                  {(f) => (
                    <option value={f().id} selected={folder() === f().id}>
                      {f().name}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </Show>
          <dl class={styles.facts}>
            <dt>File</dt>
            <dd>{props.asset.name}</dd>
            <dt>Type</dt>
            <dd>{props.asset.type}</dd>
            <dt>Size</dt>
            <dd>{formatSize(props.asset.size)}</dd>
            <Show when={props.asset.modified}>
              {(modified) => (
                <>
                  <dt>Uploaded</dt>
                  <dd>{new Date(modified()).toLocaleString()}</dd>
                </>
              )}
            </Show>
          </dl>
          <Show when={problem()}>
            <p class={common.issue} role="alert">
              {problem()}
            </p>
          </Show>
          <div class={styles.viewerActions}>
            <Show when={props.onDelete}>
              {(onDelete) => (
                <button type="button" class={common.button} aria-label={`Delete ${props.asset.name}`} onClick={() => onDelete()()}>
                  <TrashIcon />
                </button>
              )}
            </Show>
            <button type="button" class={common.button} onClick={() => props.onCopy()}>
              <CopyIcon /> {props.copied ? 'Copied' : 'Copy URL'}
            </button>
            <span class={styles.spacer} />
            <Show when={editable()}>
              <button type="submit" class={props.onPick ? common.button : styles.primary} disabled={saving() || !changed()}>
                {saving() ? 'Saving…' : saved() && !changed() ? 'Saved' : 'Save'}
              </button>
            </Show>
            <Show when={props.onPick}>
              {(pick) => (
                <button
                  type="button"
                  class={styles.primary}
                  disabled={saving()}
                  onClick={() =>
                    void save().then((asset) => {
                      if (asset) pick()(asset);
                    })
                  }
                >
                  Use this file
                </button>
              )}
            </Show>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export interface AssetPickerProps extends AssetLibraryProps {
  onPick: (asset: Asset) => void;
  /** The field's label, for the dialog's title. */
  label: string;
  /** Called when the dialog closes without a pick (Escape or the close button). */
  onClose: () => void;
}

/** The library in a modal dialog, for choosing one file. Render it while open; it opens when mounted. */
export function AssetPicker(props: AssetPickerProps) {
  return (
    <Modal title={`Choose: ${props.label}`} wide onClose={() => props.onClose()}>
      <AssetLibrary assets={props.assets} accept={props.accept} onPick={(asset) => props.onPick(asset)} />
    </Modal>
  );
}
