// Generated forms: one input per field of a schema, with validation messages
// shown next to the field they belong to. `BrickForm` edits an entry with
// its brick's schema; `FieldsForm` edits a document's fields.
import type { AnyBrick, AnyCollection, Fields, PageEntry, ValidateResult } from '@mortar-kit/core';
import { createMemo, For } from 'solid-js';

import styles from './BrickForm.module.css';
import { FormContext, pathKey, type FormApi } from './fields/context.ts';
import { FieldInput } from './fields/FieldInput.tsx';
import { FIELDS, type EditorStore, type Target } from './state.ts';

export interface BrickFormProps {
  brick: AnyBrick;
  entry: PageEntry;
  editor: EditorStore;
}

/** The form for one entry, from its brick's schema. */
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

/** The form for a document's fields, from its collection's schema. */
export function FieldsForm(props: { collection: AnyCollection; data: Record<string, unknown>; editor: EditorStore }) {
  return <SchemaForm schema={props.collection.fields} data={props.data} validate={props.collection.validate} target={FIELDS} editor={props.editor} />;
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
