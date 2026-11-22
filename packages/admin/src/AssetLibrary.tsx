// The asset library: every uploaded file as a grid of tiles, with upload by
// button or drag and drop. It manages assets in the admin's Assets view
// (copy a URL, delete, refused while documents use the file) and picks one
// for an image or file field in <AssetPicker>, a modal dialog around it.
import { assetExtensions, collectionMap, type Asset, type AssetKind, type Assets, type Referrer } from '@mortar-kit/core';
import { createMemo, createSignal, For, Loading, Match, onSettled, refresh, Show, Switch } from 'solid-js';

import styles from './AssetLibrary.module.css';
import common from './common.module.css';
import { useAdmin } from './context.ts';
import { CloseIcon, CopyIcon, FileIcon, TrashIcon, UploadIcon } from './icons.tsx';
import { referrerLabel } from './referrer.ts';

export interface AssetLibraryProps {
  assets: Assets;
  /** Only files of these kinds are shown and can be uploaded. Default: every kind. */
  accept?: readonly AssetKind[];
  /** Picks a file (a field's picker). Without it, the library manages files: copy URL, delete. */
  onPick?: (asset: Asset) => void;
}

/** "1.2 MB", "340 KB", "12 B". */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const KIND_NAMES: Record<AssetKind, string> = { image: 'images', video: 'videos', audio: 'audio', document: 'PDFs' };

export function AssetLibrary(props: AssetLibraryProps) {
  const admin = useAdmin();
  const all = createMemo(() => props.assets.list());
  const shown = () => all().filter((a) => !props.accept || props.accept.includes(a.kind));
  const [busy, setBusy] = createSignal(0);
  const [problems, setProblems] = createSignal<string[]>([]);
  const [blocked, setBlocked] = createSignal<{ asset: Asset; by: Referrer[] } | null>(null);
  const [dragging, setDragging] = createSignal(false);
  const [copied, setCopied] = createSignal('');
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
    for (const file of files) {
      try {
        if (props.accept && !allowed.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) {
          failed.push(`"${file.name}" isn't one of the ${what()} this takes`);
          continue;
        }
        const result = await props.assets.upload(file);
        if (result.ok) added.push(result.asset);
        else failed.push(result.message);
      } catch (error) {
        failed.push(`"${file.name}" didn't upload: ${error instanceof Error ? error.message : String(error)}`);
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
    const result = await props.assets.remove(asset.key);
    if (!result.ok) {
      setBlocked({ asset, by: result.referencedBy });
      return;
    }
    setBlocked(null);
    refresh(all);
  };

  const copy = async (asset: Asset) => {
    const url = new URL(asset.src, window.location.href).href;
    await navigator.clipboard?.writeText(url);
    setCopied(asset.key);
    setTimeout(() => setCopied((key) => (key === asset.key ? '' : key)), 1500);
  };

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
        <span class={common.help}>
          <Show when={busy() > 0} fallback={<>Or drop {what()} here.</>}>
            Uploading {busy()} {busy() === 1 ? 'file' : 'files'}…
          </Show>
        </span>
      </div>
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
        <Show when={shown().length > 0} fallback={<p class={styles.empty}>No {what()} yet.</p>}>
          <ul class={styles.grid} aria-label="Assets">
            <For each={shown()} keyed={(a) => a.key}>
              {(asset) => (
                <li class={styles.tile}>
                  <Show
                    when={props.onPick}
                    fallback={
                      <>
                        <Preview asset={asset()} />
                        <Caption asset={asset()} />
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
                      <button type="button" class={styles.pick} aria-label={`Choose ${asset().name}`} onClick={() => pick()(asset())}>
                        <Preview asset={asset()} />
                        <Caption asset={asset()} />
                      </button>
                    )}
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Loading>
    </section>
  );
}

/** A tile's picture: the image, a video frame, or a file icon with the extension. */
function Preview(props: { asset: Asset }) {
  return (
    <div class={styles.preview}>
      <Switch
        fallback={
          <span class={styles.fileKind}>
            <FileIcon />
            {props.asset.name.split('.').pop()}
          </span>
        }
      >
        <Match when={props.asset.kind === 'image'}>
          <img src={props.asset.src} alt="" loading="lazy" />
        </Match>
        <Match when={props.asset.kind === 'video'}>
          <video src={props.asset.src} muted preload="metadata" />
        </Match>
      </Switch>
    </div>
  );
}

function Caption(props: { asset: Asset }) {
  return (
    <div class={styles.caption}>
      <span class={styles.name} title={props.asset.name}>
        {props.asset.name}
      </span>
      <span class={common.help}>{formatSize(props.asset.size)}</span>
    </div>
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
  let dialog: HTMLDialogElement | undefined;
  onSettled(() => {
    if (!dialog) return;
    // jsdom has no showModal; the open attribute shows it there.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  return (
    <dialog ref={(el) => (dialog = el)} class={styles.dialog} aria-label={`Choose: ${props.label}`} onClose={() => props.onClose()}>
      <div class={styles.dialogHead}>
        <h2 class={styles.dialogTitle}>Choose: {props.label}</h2>
        <button type="button" class={common.button} aria-label="Close" onClick={() => props.onClose()}>
          <CloseIcon />
        </button>
      </div>
      <AssetLibrary assets={props.assets} accept={props.accept} onPick={(asset) => props.onPick(asset)} />
    </dialog>
  );
}
