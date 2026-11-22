// One form input per field kind, chosen from the field's FieldInfo. Object and
// list fields render their nested fields recursively. Inputs write to the
// store on every keystroke so the preview updates live.
import { assetInfo, defaultOf, fieldInfo, type AnyField, type FieldInfo } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, Loading, Match, Show, Switch } from 'solid-js';

import { AssetPicker } from '../AssetLibrary.tsx';
import common from '../common.module.css';
import { useAdmin, type AdminApi } from '../context.ts';
import { ChevronIcon, DownIcon, FileIcon, PlusIcon, TrashIcon, UpIcon } from '../icons.tsx';
import type { Path } from '../state.ts';
import styles from './FieldInput.module.css';
import { useForm } from './context.ts';

export interface FieldInputProps {
  field: AnyField;
  path: Path;
  value: unknown;
}

/** Renders the input for `field`, or a notice if it isn't a Mortar field. */
export function FieldInput(props: FieldInputProps) {
  const info = createMemo(() => fieldInfo(props.field));
  return (
    <Show when={info()} fallback={<p class={common.issue}>Unsupported field at {props.path.join('.')}</p>}>
      {(i) => (
        <Switch>
          <Match when={i().kind === 'text' || i().kind === 'url'}>
            <TextInput info={i()} path={props.path} value={props.value} />
          </Match>
          <Match when={i().kind === 'textarea'}>
            <TextInput info={i()} path={props.path} value={props.value} multiline />
          </Match>
          <Match when={i().kind === 'number'}>
            <NumberInput info={i()} path={props.path} value={props.value} />
          </Match>
          <Match when={i().kind === 'boolean'}>
            <BooleanInput info={i()} path={props.path} value={props.value} />
          </Match>
          <Match when={i().kind === 'select'}>
            <SelectInput info={i()} path={props.path} value={props.value} />
          </Match>
          <Match when={i().kind === 'date'}>
            <DateInput info={i()} path={props.path} value={props.value} />
          </Match>
          <Match when={i().kind === 'reference'}>
            <ReferenceInput info={i()} path={props.path} value={props.value} />
          </Match>
          <Match when={i().kind === 'image' || i().kind === 'file'}>
            <AssetInput info={i()} path={props.path} value={props.value} />
          </Match>
          <Match when={i().kind === 'object'}>
            <ObjectInput info={i()} path={props.path} value={props.value} />
          </Match>
          <Match when={i().kind === 'list'}>
            <ListInput info={i()} path={props.path} value={props.value} />
          </Match>
        </Switch>
      )}
    </Show>
  );
}

interface InputProps {
  info: FieldInfo;
  path: Path;
  value: unknown;
}

/** Label, help text and validation message around an input. */
function Labelled(props: { info: FieldInfo; path: Path; children: JSX.Element }) {
  const form = useForm();
  return (
    <label class={styles.field}>
      <span class={styles.label}>
        {props.info.label}
        <Show when={props.info.required}>
          <span class={styles.required} aria-hidden="true"> *</span>
        </Show>
      </span>
      {props.children}
      <Show when={props.info.help}>
        <small class={styles.help}>{props.info.help}</small>
      </Show>
      <Show when={form.issue(props.path)}>{(message) => <small class={common.issue}>{message()}</small>}</Show>
    </label>
  );
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function TextInput(props: InputProps & { multiline?: boolean }) {
  const form = useForm();
  const onInput = (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => form.setValue(props.path, e.currentTarget.value);
  return (
    <Labelled info={props.info} path={props.path}>
      <Show
        when={props.multiline}
        fallback={
          <input
            type="text"
            class={styles.input}
            inputmode={props.info.kind === 'url' ? 'url' : undefined}
            value={asString(props.value)}
            placeholder={props.info.placeholder}
            maxlength={props.info.maxLength}
            aria-invalid={form.issue(props.path) ? 'true' : undefined}
            onInput={onInput}
          />
        }
      >
        <textarea
          class={styles.input}
          rows={4}
          value={asString(props.value)}
          placeholder={props.info.placeholder}
          maxlength={props.info.maxLength}
          aria-invalid={form.issue(props.path) ? 'true' : undefined}
          onInput={onInput}
        />
      </Show>
    </Labelled>
  );
}

/**
 * Number input with a draft: text that isn't a number yet ("-") stays in the
 * input, and only parsed numbers reach the store. The typed text is kept
 * while it still means the stored value ("0.50", "1e3"), so committing a
 * number never rewrites what the editor is typing.
 */
function NumberInput(props: InputProps) {
  const form = useForm();
  const [draft, setDraft] = createSignal<string>((prev) => {
    if (typeof props.value !== 'number') return '';
    return prev !== undefined && prev.trim() !== '' && Number(prev) === props.value ? prev : String(props.value);
  });
  return (
    <Labelled info={props.info} path={props.path}>
      <input
        type="number"
        class={styles.input}
        value={draft()}
        min={props.info.min}
        max={props.info.max}
        step={props.info.step ?? 'any'}
        aria-invalid={form.issue(props.path) ? 'true' : undefined}
        onInput={(e) => {
          const text = e.currentTarget.value;
          setDraft(text);
          const n = Number(text);
          if (text.trim() !== '' && Number.isFinite(n)) form.setValue(props.path, n);
        }}
      />
    </Labelled>
  );
}

/** The browser's date picker; its value is already YYYY-MM-DD ('' when cleared). */
function DateInput(props: InputProps) {
  const form = useForm();
  return (
    <Labelled info={props.info} path={props.path}>
      <input
        type="date"
        class={styles.input}
        value={asString(props.value)}
        aria-invalid={form.issue(props.path) ? 'true' : undefined}
        onInput={(e) => form.setValue(props.path, e.currentTarget.value)}
      />
    </Labelled>
  );
}

/**
 * Picks a document of the referenced collection, by title. Needs <Admin>
 * around the editor (for the documents); a standalone editor shows the
 * stored id, read-only.
 */
function ReferenceInput(props: InputProps) {
  const admin = useAdmin();
  return (
    <Show
      when={admin}
      fallback={
        <Labelled info={props.info} path={props.path}>
          <input type="text" class={styles.input} value={asString(props.value)} readonly />
        </Labelled>
      }
    >
      {(a) => <ReferencePicker info={props.info} path={props.path} value={props.value} admin={a()} />}
    </Show>
  );
}

function ReferencePicker(props: InputProps & { admin: AdminApi }) {
  const form = useForm();
  const name = () => props.info.collection ?? '';
  const target = createMemo(() => props.admin.collections.find((c) => c.name === name()));
  // Each picker reads on its own: no promise shared between components.
  const docs = createMemo(() => props.admin.content.list(name()));
  const value = () => asString(props.value);
  const missing = () => value() !== '' && !docs().some((d) => d.id === value());
  return (
    <div class={styles.field}>
      <Labelled info={props.info} path={props.path}>
        <Loading fallback={<span class={common.help}>Loading {target()?.label ?? name()}…</span>}>
          <span class={styles.reference}>
            <select
              class={styles.input}
              aria-invalid={form.issue(props.path) || missing() ? 'true' : undefined}
              onChange={(e) => form.setValue(props.path, e.currentTarget.value)}
            >
              <option value="" selected={value() === ''}>
                None
              </option>
              <Show when={missing()}>
                <option value={value()} selected>
                  Missing document ({value()})
                </option>
              </Show>
              <For each={docs()}>
                {(d) => (
                  <option value={d.id} selected={value() === d.id}>
                    {target()?.titleOf(d) ?? d.slug}
                  </option>
                )}
              </For>
            </select>
            <button
              type="button"
              class={common.button}
              disabled={value() === '' || missing()}
              aria-label={`Open the selected ${props.info.label.toLowerCase()}`}
              onClick={() => props.admin.go({ collection: name(), id: value() })}
            >
              Open
            </button>
          </span>
        </Loading>
      </Labelled>
      {/* Its own boundary: while the list loads, nothing here holds up the rest of the form. */}
      <Loading fallback={null}>
        <Show when={missing()}>
          <small class={common.issue}>The selected document no longer exists. Pick another, or None.</small>
        </Show>
      </Loading>
    </div>
  );
}

function BooleanInput(props: InputProps) {
  const form = useForm();
  return (
    <label class={styles.checkbox}>
      <input type="checkbox" checked={props.value === true} onChange={(e) => form.setValue(props.path, e.currentTarget.checked)} />
      <span class={styles.label}>{props.info.label}</span>
      <Show when={props.info.help}>
        <small class={styles.checkboxHelp}>{props.info.help}</small>
      </Show>
    </label>
  );
}

function SelectInput(props: InputProps) {
  const form = useForm();
  const options = () => Object.entries(props.info.options ?? {});
  return (
    <Labelled info={props.info} path={props.path}>
      <select class={styles.input} onChange={(e) => form.setValue(props.path, e.currentTarget.value)}>
        <For each={options()}>
          {([value, label]) => (
            <option value={value} selected={props.value === value}>
              {label}
            </option>
          )}
        </For>
      </select>
    </Labelled>
  );
}

/** A titled set of related inputs (object, image and file fields). */
function Group(props: { info: FieldInfo; children: JSX.Element }) {
  return (
    <fieldset class={styles.group}>
      <legend class={styles.groupLabel}>{props.info.label}</legend>
      <Show when={props.info.help}>
        <small class={styles.help}>{props.info.help}</small>
      </Show>
      <div class={styles.groupBody}>{props.children}</div>
    </fieldset>
  );
}

/**
 * An image or file field: an uploaded asset chosen from the library (when
 * the admin has a blob store) or a URL, plus a title and, for an image,
 * alt text. Picking an asset fills in its default title and alt text (from
 * the library), keeping what is typed where the asset has none.
 */
function AssetInput(props: InputProps) {
  const form = useForm();
  const admin = useAdmin();
  const [picking, setPicking] = createSignal(false);
  const value = () =>
    ({ src: '', asset: '', alt: '', title: '', ...(props.value as object | undefined) }) as { src: string; asset: string; alt: string; title: string };
  const isImage = () => props.info.kind === 'image';
  const assets = () => admin?.content.assets;
  const set = (patch: Partial<ReturnType<typeof value>>) => {
    const next = { ...value(), ...patch };
    // A file field has no alt text.
    if (!isImage()) delete (next as Partial<typeof next>).alt;
    form.setValue(props.path, next);
  };
  return (
    <Group info={props.info}>
      <Show when={value().src || value().asset}>
        <Show
          when={isImage() && value().src}
          fallback={
            <p class={styles.assetFile}>
              <FileIcon />
              <span>{value().asset ? (assetInfo(value().asset)?.name ?? value().asset) : value().src}</span>
            </p>
          }
        >
          <img class={styles.thumb} src={value().src} alt="" />
        </Show>
      </Show>
      <div class={styles.assetActions}>
        <Show when={assets()}>
          <button type="button" class={common.button} onClick={() => setPicking(true)}>
            {value().asset ? 'Replace…' : 'Choose…'}
          </button>
        </Show>
        <Show when={value().src || value().asset}>
          <button type="button" class={common.button} onClick={() => set({ src: '', asset: '' })}>
            Remove
          </button>
        </Show>
      </div>
      <Show
        when={!value().asset}
        fallback={<Show when={form.issue([...props.path, 'src'])}>{(message) => <small class={common.issue}>{message()}</small>}</Show>}
      >
        <Labelled
          info={{ kind: 'url', label: assets() ? 'Or a URL' : isImage() ? 'Image URL' : 'File URL', required: props.info.required }}
          path={[...props.path, 'src']}
        >
          <input
            type="text"
            class={styles.input}
            inputmode="url"
            value={value().src}
            aria-invalid={form.issue([...props.path, 'src']) ? 'true' : undefined}
            onInput={(e) => set({ src: e.currentTarget.value, asset: '' })}
          />
        </Labelled>
      </Show>
      <Show when={isImage()}>
        <Labelled info={{ kind: 'text', label: 'Alt text' }} path={[...props.path, 'alt']}>
          <input type="text" class={styles.input} value={value().alt} onInput={(e) => form.setValue([...props.path, 'alt'], e.currentTarget.value)} />
        </Labelled>
      </Show>
      <Labelled info={{ kind: 'text', label: 'Title' }} path={[...props.path, 'title']}>
        <input type="text" class={styles.input} value={value().title} onInput={(e) => form.setValue([...props.path, 'title'], e.currentTarget.value)} />
      </Labelled>
      <Show when={picking() && assets()}>
        {(library) => (
          <AssetPicker
            assets={library()}
            accept={props.info.accept}
            label={props.info.label}
            onPick={(asset) => {
              set({ src: asset.src, asset: asset.key, alt: asset.alt || value().alt, title: asset.title || value().title });
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </Show>
    </Group>
  );
}

/** The inputs of an object field's own fields, without a frame. */
function ObjectFields(props: InputProps) {
  const record = () => (props.value ?? {}) as Record<string, unknown>;
  return (
    <For each={Object.entries(props.info.fields ?? {})}>
      {([key, field]) => <FieldInput field={field} path={[...props.path, key]} value={record()[key]} />}
    </For>
  );
}

function ObjectInput(props: InputProps) {
  return (
    <Group info={props.info}>
      <ObjectFields info={props.info} path={props.path} value={props.value} />
    </Group>
  );
}

/**
 * What a list item's header shows: a text item's value, or an object item's
 * first non-empty text field; `undefined` when there is none.
 */
function itemTitle(info: FieldInfo | undefined, value: unknown): string | undefined {
  if (!info) return undefined;
  if ((info.kind === 'text' || info.kind === 'url' || info.kind === 'textarea') && typeof value === 'string') return value.trim() || undefined;
  if (info.kind === 'object' && value && typeof value === 'object') {
    for (const [key, field] of Object.entries(info.fields ?? {})) {
      const kind = fieldInfo(field)?.kind;
      const v = (value as Record<string, unknown>)[key];
      if ((kind === 'text' || kind === 'url') && typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return undefined;
}

/**
 * A list as a stack of item cards. Each card's header holds its title (a
 * toggle that collapses the card), move and remove actions; object items show
 * their fields straight in the card body, without a second frame.
 */
function ListInput(props: InputProps) {
  const form = useForm();
  const items = () => (Array.isArray(props.value) ? (props.value as unknown[]) : []);
  const itemInfo = createMemo(() => (props.info.item ? fieldInfo(props.info.item) : undefined));
  const itemLabel = () => itemInfo()?.label ?? 'item';
  const canAdd = () => props.info.max === undefined || items().length < props.info.max;
  const canRemove = () => props.info.min === undefined || items().length > props.info.min;
  // Collapsed cards by index; moved and removed with their items.
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<number>>(new Set());
  const toggle = (index: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  const move = (from: number, to: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const a = prev.has(from);
      const b = prev.has(to);
      next.delete(from);
      next.delete(to);
      if (a) next.add(to);
      if (b) next.add(from);
      return next;
    });
    form.moveItem(props.path, from, to);
  };
  const remove = (index: number) => {
    setCollapsed((prev) => new Set([...prev].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))));
    form.removeItem(props.path, index);
  };
  const bodyId = (index: number) => `mortar-list-${[...props.path, index].join('-')}`;
  return (
    <fieldset class={styles.group}>
      <legend class={styles.groupLabel}>
        {props.info.label}
        <span class={styles.count}>{items().length}</span>
      </legend>
      <Show when={props.info.help}>
        <small class={styles.help}>{props.info.help}</small>
      </Show>
      <Show when={form.issue(props.path)}>{(message) => <small class={common.issue}>{message()}</small>}</Show>
      <Show when={props.info.item}>
        {(item) => (
          <div class={styles.items}>
            <For each={items()} keyed={false}>
              {(value, index) => (
                <div class={styles.item} data-collapsed={collapsed().has(index) ? '' : undefined}>
                  <div class={styles.itemHead}>
                    <button
                      type="button"
                      class={styles.itemToggle}
                      aria-expanded={collapsed().has(index) ? 'false' : 'true'}
                      aria-controls={bodyId(index)}
                      onClick={() => {
                        toggle(index);
                      }}
                    >
                      <span class={styles.chevron}>
                        <ChevronIcon />
                      </span>
                      <span class={styles.itemTitle}>{itemTitle(itemInfo(), value()) ?? `${itemLabel()} ${index + 1}`}</span>
                      <Show when={form.hasIssueWithin([...props.path, index])}>
                        <span class={styles.itemIssue} title="Has a problem to fix" />
                      </Show>
                    </button>
                    <div class={styles.itemActions}>
                      <button
                        type="button"
                        class={styles.itemAction}
                        disabled={index === 0}
                        aria-label={`Move ${itemLabel()} ${index + 1} up`}
                        title="Move up"
                        onClick={() => move(index, index - 1)}
                      >
                        <UpIcon />
                      </button>
                      <button
                        type="button"
                        class={styles.itemAction}
                        disabled={index === items().length - 1}
                        aria-label={`Move ${itemLabel()} ${index + 1} down`}
                        title="Move down"
                        onClick={() => move(index, index + 1)}
                      >
                        <DownIcon />
                      </button>
                      <button
                        type="button"
                        class={styles.itemAction}
                        disabled={!canRemove()}
                        aria-label={`Remove ${itemLabel()} ${index + 1}`}
                        title="Remove"
                        onClick={() => remove(index)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  <div class={styles.itemBody} id={bodyId(index)} hidden={collapsed().has(index)}>
                    <Show when={itemInfo()?.kind === 'object'} fallback={<FieldInput field={item()} path={[...props.path, index]} value={value()} />}>
                      <ObjectFields info={itemInfo() as FieldInfo} path={[...props.path, index]} value={value()} />
                    </Show>
                  </div>
                </div>
              )}
            </For>
            <button
              type="button"
              class={styles.add}
              disabled={!canAdd()}
              onClick={() => form.insertItem(props.path, items().length, defaultOf(item()))}
            >
              <PlusIcon />
              Add {itemLabel()}
            </button>
          </div>
        )}
      </Show>
    </fieldset>
  );
}
