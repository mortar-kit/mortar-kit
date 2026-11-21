// Generated forms: one input per field of a schema, with validation messages
// shown next to the field they belong to. `BrickForm` edits a page entry
// with its brick's schema; `MetaForm` edits the page's metadata.
import type { AnyBrick, Fields, PageEntry, PageMeta, ValidateResult } from '@mortar-kit/core';
import { createMemo, For } from 'solid-js';

import styles from './BrickForm.module.css';
import { FormContext, pathKey, type FormApi } from './fields/context.ts';
import { FieldInput } from './fields/FieldInput.tsx';
import { PAGE_META, type EditorStore, type Target } from './state.ts';

export interface BrickFormProps {
  brick: AnyBrick;
  entry: PageEntry;
  editor: EditorStore;
}

/** The form for one page entry, from its brick's schema. */
export function BrickForm(props: BrickFormProps) {
  return (
    <SchemaForm
      schema={props.brick.schema as Fields}
      data={props.entry.data}
      validate={props.brick.validate}
      target={props.entry.id}
      editor={props.editor}
    />
  );
}

/** The form for the page's metadata, from the site's `definePageMeta` schema. */
export function MetaForm(props: { meta: PageMeta; data: Record<string, unknown>; editor: EditorStore }) {
  return <SchemaForm schema={props.meta.schema} data={props.data} validate={props.meta.validate} target={PAGE_META} editor={props.editor} />;
}

interface SchemaFormProps {
  schema: Fields;
  data: Record<string, unknown>;
  validate: (data: unknown) => ValidateResult<unknown>;
  /** Where the inputs write. */
  target: Target;
  editor: EditorStore;
}

function SchemaForm(props: SchemaFormProps) {
  const issues = createMemo(() => {
    const result = props.validate(props.data);
    const byPath = new Map<string, string>();
    if (!result.success) {
      for (const issue of result.issues) {
        const key = pathKey(issue.path);
        if (!byPath.has(key)) byPath.set(key, issue.message);
      }
    }
    return byPath;
  });

  const api: FormApi = {
    setValue: (path, value) => props.editor.setValue(props.target, path, value),
    insertItem: (path, index, value) => props.editor.insertItem(props.target, path, index, value),
    removeItem: (path, index) => props.editor.removeItem(props.target, path, index),
    moveItem: (path, from, to) => props.editor.moveItem(props.target, path, from, to),
    issue: (path) => issues().get(pathKey(path)),
  };

  return (
    <FormContext value={api}>
      <div class={styles.form}>
        <For each={Object.entries(props.schema)}>{([key, field]) => <FieldInput field={field} path={[key]} value={props.data[key]} />}</For>
      </div>
    </FormContext>
  );
}
