// <DocPreview>: the preview of a document whose collection has no layout.
// It shows the document's fields the way an editor reads them (title,
// lead image, then each field by its label: images as images, references by
// their document's title, lists and objects nested) and the body under
// them, so every collection previews as something better than a blank page.
// Rendered in the preview iframe, which carries only the site's CSS, so its
// module sets everything it needs.
import { ContentContext, fieldInfo, type AnyCollection, type AnyField, type Doc, type FieldInfo, type Fields } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { createMemo, Errored, For, Loading, Match, Show, Switch, useContext } from 'solid-js';

import styles from './DocPreview.module.css';

export interface DocPreviewProps {
  /** The document's collection: its fields' labels and kinds, and its title field. */
  collection: AnyCollection;
  doc: Doc;
  /** The rendered body, shown under the fields (a collection with a body). */
  children?: JSX.Element;
  /** Every collection, to show a reference by its document's title (otherwise its slug). */
  collections?: readonly AnyCollection[];
}

type Entry = { key: string; info: FieldInfo };

/** A collection's fields with their UI descriptions, in order (fields without one are skipped). */
function entries(fields: Fields): Entry[] {
  return Object.entries(fields).flatMap(([key, schema]) => {
    const info = fieldInfo(schema);
    return info ? [{ key, info }] : [];
  });
}

/** Whether a stored value has nothing to show. */
function isEmpty(info: FieldInfo, value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (info.kind === 'image' || info.kind === 'file') return !(value as { src?: string }).src;
  if (info.kind === 'list') return !Array.isArray(value) || value.length === 0;
  return false;
}

/**
 * A readable preview of any document: its title, its first image large,
 * then every other field under its label, then `children` (the body).
 * `<PreviewPage>` shows it for collections without a layout; a layout can
 * render it too, e.g. around a heading of its own.
 */
export function DocPreview(props: DocPreviewProps) {
  const value = (key: string) => props.doc.fields[key];
  const all = createMemo(() => entries(props.collection.fields));
  // The first image field, when it has an image: shown large at the top, like a card's picture.
  const lead = createMemo(() => all().find((e) => e.info.kind === 'image' && !isEmpty(e.info, value(e.key))));
  const rows = createMemo(() => all().filter((e) => e.key !== props.collection.title && e !== lead()));
  return (
    <>
      <article class={styles.doc}>
        <Show when={lead()}>
          {(entry) => <img class={styles.lead} src={(value(entry().key) as { src: string }).src} alt={(value(entry().key) as { alt?: string }).alt ?? ''} />}
        </Show>
        <header class={styles.head}>
          <p class={styles.kicker}>{props.collection.label}</p>
          <h1 class={styles.title}>{props.collection.titleOf(props.doc)}</h1>
          <p class={styles.slug}>/{props.doc.slug}</p>
        </header>
        <Show when={rows().length > 0}>
          <Rows entries={rows()} data={props.doc.fields} collections={props.collections} />
        </Show>
      </article>
      {props.children}
    </>
  );
}

/** Fields under their labels. `data` is read inside, so edits update in place. */
function Rows(props: { entries: Entry[]; data: Record<string, unknown> | undefined; collections?: readonly AnyCollection[] }) {
  return (
    <dl class={styles.rows}>
      <For each={props.entries}>
        {(entry) => (
          <div class={styles.row}>
            <dt class={styles.label}>{entry.info.label}</dt>
            <dd class={styles.value}>
              <Value info={entry.info} value={props.data?.[entry.key]} collections={props.collections} />
            </dd>
          </div>
        )}
      </For>
    </dl>
  );
}

/** One stored value, shown by its field's kind; a dash when it's empty. */
function Value(props: { info: FieldInfo; value: unknown; collections?: readonly AnyCollection[] }) {
  const asset = () => props.value as { src: string; alt?: string };
  return (
    <Show when={!isEmpty(props.info, props.value)} fallback={<span class={styles.empty}>—</span>}>
      <Switch fallback={<span class={styles.text}>{String(props.value)}</span>}>
        <Match when={props.info.kind === 'boolean'}>{props.value ? 'Yes' : 'No'}</Match>
        <Match when={props.info.kind === 'number'}>{typeof props.value === 'number' ? props.value.toLocaleString() : String(props.value)}</Match>
        <Match when={props.info.kind === 'select'}>{props.info.options?.[String(props.value)] ?? String(props.value)}</Match>
        <Match when={props.info.kind === 'date'}>{formatDate(String(props.value))}</Match>
        <Match when={props.info.kind === 'url'}>
          <a href={String(props.value)}>{String(props.value)}</a>
        </Match>
        <Match when={props.info.kind === 'image'}>
          <figure class={styles.figure}>
            <img class={styles.image} src={asset().src} alt={asset().alt ?? ''} />
            <Show when={asset().alt}>
              <figcaption class={styles.caption}>{asset().alt}</figcaption>
            </Show>
          </figure>
        </Match>
        <Match when={props.info.kind === 'file'}>
          <a href={asset().src}>{fileName(asset().src)}</a>
        </Match>
        <Match when={props.info.kind === 'reference'}>
          <Reference collection={props.info.collection ?? ''} id={String(props.value)} collections={props.collections} />
        </Match>
        <Match when={props.info.kind === 'object' && props.info.fields}>
          {(nested) => <Rows entries={entries(nested())} data={props.value as Record<string, unknown>} collections={props.collections} />}
        </Match>
        <Match when={props.info.kind === 'list' && props.info.item}>{(item) => <Items item={item()} value={props.value as unknown[]} collections={props.collections} />}</Match>
      </Switch>
    </Show>
  );
}

/** A list field's items, each shown with the list's item field. */
function Items(props: { item: AnyField; value: unknown[]; collections?: readonly AnyCollection[] }) {
  const info = () => fieldInfo(props.item);
  return (
    <ol class={styles.items}>
      <For each={props.value}>
        {(item) => (
          <li class={styles.item}>
            <Show when={info()} fallback={String(item)}>
              {(i) => <Value info={i()} value={item} collections={props.collections} />}
            </Show>
          </li>
        )}
      </For>
    </ol>
  );
}

/** A referenced document, by its title, read from the preview's content (its id without one). */
function Reference(props: { collection: string; id: string; collections?: readonly AnyCollection[] }) {
  const source = useContext(ContentContext);
  const target = createMemo(() => props.collections?.find((c) => c.name === props.collection));
  const doc = createMemo(() => (source ? source.get(props.collection, { id: props.id }) : null));
  const missing = () => <span class={styles.empty}>{source ? 'Missing document' : props.id}</span>;
  return (
    <Errored fallback={missing}>
      <Loading fallback={<span class={styles.empty}>…</span>}>
        <Show when={doc()} fallback={missing()}>
          {(d) => <>{target()?.titleOf(d()) ?? d().slug}</>}
        </Show>
      </Loading>
    </Errored>
  );
}

/** `YYYY-MM-DD` as a long date in the reader's locale (as stored, when it isn't one). */
function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { dateStyle: 'long', timeZone: 'UTC' });
}

/** The last segment of a URL, for a file's link text. */
function fileName(src: string): string {
  const path = src.split(/[?#]/)[0]!;
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || src;
}
