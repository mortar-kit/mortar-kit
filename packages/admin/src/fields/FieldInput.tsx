// One form input per field kind, chosen from the field's FieldInfo. Object and
// list fields render their nested fields recursively. Inputs write to the
// store on every keystroke so the preview updates live.
import { defaultOf, fieldInfo, type AnyField, type FieldInfo, type Image } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';

import type { Path } from '../state.ts';
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
    <Show when={info()} fallback={<p class="mortar-issue">Unsupported field at {props.path.join('.')}</p>}>
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
    <label class="mortar-field">
      <span class="mortar-label">
        {props.info.label}
        <Show when={props.info.required}>
          <span aria-hidden="true"> *</span>
        </Show>
      </span>
      {props.children}
      <Show when={props.info.help}>
        <small class="mortar-help">{props.info.help}</small>
      </Show>
      <Show when={form.issue(props.path)}>{(message) => <small class="mortar-issue">{message()}</small>}</Show>
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
 * Number input with a draft: text that isn't a complete number yet ("1.",
 * "-") stays in the input, and only parsed numbers reach the store.
 */
function NumberInput(props: InputProps) {
  const form = useForm();
  const [draft, setDraft] = createSignal(() => (typeof props.value === 'number' ? String(props.value) : ''));
  return (
    <Labelled info={props.info} path={props.path}>
      <input
        type="number"
        value={draft()}
        min={props.info.min}
        max={props.info.max}
        step={props.info.step ?? 'any'}
        aria-invalid={form.issue(props.path) ? 'true' : undefined}
        onInput={(e) => {
          const text = e.currentTarget.value;
          setDraft(text);
          const n = Number(text);
          if (text.trim() !== '' && Number.isFinite(n) && String(n) === text) form.setValue(props.path, n);
        }}
      />
    </Labelled>
  );
}

function BooleanInput(props: InputProps) {
  const form = useForm();
  return (
    <label class="mortar-field mortar-checkbox">
      <input type="checkbox" checked={props.value === true} onChange={(e) => form.setValue(props.path, e.currentTarget.checked)} />
      <span class="mortar-label">{props.info.label}</span>
      <Show when={props.info.help}>
        <small class="mortar-help">{props.info.help}</small>
      </Show>
    </label>
  );
}

function SelectInput(props: InputProps) {
  const form = useForm();
  const options = () => Object.entries(props.info.options ?? {});
  return (
    <Labelled info={props.info} path={props.path}>
      <select onChange={(e) => form.setValue(props.path, e.currentTarget.value)}>
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
    <fieldset class="mortar-group">
      <legend>{props.info.label}</legend>
      <Show when={props.info.help}>
        <small class="mortar-help">{props.info.help}</small>
      </Show>
      <Labelled info={{ kind: 'url', label: 'Image URL', required: props.info.required }} path={[...props.path, 'src']}>
        <input type="text" inputmode="url" value={image().src} onInput={(e) => form.setValue([...props.path, 'src'], e.currentTarget.value)} />
      </Labelled>
      <Labelled info={{ kind: 'text', label: 'Alt text' }} path={[...props.path, 'alt']}>
        <input type="text" value={image().alt} onInput={(e) => form.setValue([...props.path, 'alt'], e.currentTarget.value)} />
      </Labelled>
      <Show when={image().src}>
        <img class="mortar-thumb" src={image().src} alt="" />
      </Show>
    </fieldset>
  );
}

function ObjectInput(props: InputProps) {
  const record = () => (props.value ?? {}) as Record<string, unknown>;
  return (
    <fieldset class="mortar-group">
      <legend>{props.info.label}</legend>
      <Show when={props.info.help}>
        <small class="mortar-help">{props.info.help}</small>
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
    <fieldset class="mortar-group mortar-list">
      <legend>{props.info.label}</legend>
      <Show when={props.info.help}>
        <small class="mortar-help">{props.info.help}</small>
      </Show>
      <Show when={form.issue(props.path)}>{(message) => <small class="mortar-issue">{message()}</small>}</Show>
      <Show when={props.info.item}>
        {(item) => (
          <>
            <For each={items()} keyed={false}>
              {(value, index) => (
                <div class="mortar-list-item">
                  <FieldInput field={item()} path={[...props.path, index]} value={value()} />
                  <div class="mortar-row-actions">
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={`Move ${itemLabel()} ${index + 1} up`}
                      onClick={() => form.moveItem(props.path, index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === items().length - 1}
                      aria-label={`Move ${itemLabel()} ${index + 1} down`}
                      onClick={() => form.moveItem(props.path, index, index + 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
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
              class="mortar-add"
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
