// One form input per field kind, chosen from the field's FieldInfo. Object and
// list fields render their nested fields recursively. Inputs write to the
// store on every keystroke so the preview updates live.
import { defaultOf, fieldInfo, type AnyField, type FieldInfo, type Image } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, Loading, Match, Show, Switch } from 'solid-js';

import common from '../common.module.css';
import { useAdmin, type AdminApi } from '../context.ts';
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
          <Match when={i().kind === 'image'}>
            <ImageInput info={i()} path={props.path} value={props.value} />
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
          <span aria-hidden="true"> *</span>
        </Show>
      </span>
      {props.children}
      <Show when={props.info.help}>
        <small class={common.help}>{props.info.help}</small>
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
      <Show when={missing()}>
        <small class={common.issue}>The selected document no longer exists. Pick another, or None.</small>
      </Show>
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

function ImageInput(props: InputProps) {
  const form = useForm();
  const image = () => (props.value ?? { src: '', alt: '' }) as Image;
  return (
    <fieldset class={styles.group}>
      <legend>{props.info.label}</legend>
      <Show when={props.info.help}>
        <small class={common.help}>{props.info.help}</small>
      </Show>
      <Labelled info={{ kind: 'url', label: 'Image URL', required: props.info.required }} path={[...props.path, 'src']}>
        <input type="text" class={styles.input} inputmode="url" value={image().src} onInput={(e) => form.setValue([...props.path, 'src'], e.currentTarget.value)} />
      </Labelled>
      <Labelled info={{ kind: 'text', label: 'Alt text' }} path={[...props.path, 'alt']}>
        <input type="text" class={styles.input} value={image().alt} onInput={(e) => form.setValue([...props.path, 'alt'], e.currentTarget.value)} />
      </Labelled>
      <Show when={image().src}>
        <img class={styles.thumb} src={image().src} alt="" />
      </Show>
    </fieldset>
  );
}

function ObjectInput(props: InputProps) {
  const record = () => (props.value ?? {}) as Record<string, unknown>;
  return (
    <fieldset class={styles.group}>
      <legend>{props.info.label}</legend>
      <Show when={props.info.help}>
        <small class={common.help}>{props.info.help}</small>
      </Show>
      <For each={Object.entries(props.info.fields ?? {})}>
        {([key, field]) => <FieldInput field={field} path={[...props.path, key]} value={record()[key]} />}
      </For>
    </fieldset>
  );
}

function ListInput(props: InputProps) {
  const form = useForm();
  const items = () => (Array.isArray(props.value) ? (props.value as unknown[]) : []);
  const itemLabel = () => (props.info.item ? fieldInfo(props.info.item)?.label : undefined) ?? 'item';
  const canAdd = () => props.info.max === undefined || items().length < props.info.max;
  const canRemove = () => props.info.min === undefined || items().length > props.info.min;
  return (
    <fieldset class={styles.group}>
      <legend>{props.info.label}</legend>
      <Show when={props.info.help}>
        <small class={common.help}>{props.info.help}</small>
      </Show>
      <Show when={form.issue(props.path)}>{(message) => <small class={common.issue}>{message()}</small>}</Show>
      <Show when={props.info.item}>
        {(item) => (
          <>
            <For each={items()} keyed={false}>
              {(value, index) => (
                <div class={styles.listItem}>
                  <FieldInput field={item()} path={[...props.path, index]} value={value()} />
                  <div class={common.rowActions}>
                    <button
                      type="button"
                      class={common.button}
                      disabled={index === 0}
                      aria-label={`Move ${itemLabel()} ${index + 1} up`}
                      onClick={() => form.moveItem(props.path, index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class={common.button}
                      disabled={index === items().length - 1}
                      aria-label={`Move ${itemLabel()} ${index + 1} down`}
                      onClick={() => form.moveItem(props.path, index, index + 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class={common.button}
                      disabled={!canRemove()}
                      aria-label={`Remove ${itemLabel()} ${index + 1}`}
                      onClick={() => form.removeItem(props.path, index)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </For>
            <button
              type="button"
              class={common.button}
              disabled={!canAdd()}
              onClick={() => form.insertItem(props.path, items().length, defaultOf(item()))}
            >
              Add {itemLabel()}
            </button>
          </>
        )}
      </Show>
    </fieldset>
  );
}
