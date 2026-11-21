// The generated form for one page entry: one input per field in the brick's
// schema, with validation messages shown next to the field they belong to.
import type { AnyBrick, Fields, PageEntry } from '@mortar-kit/core';
import { createMemo, For } from 'solid-js';

import { FormContext, pathKey, type FormApi } from './fields/context.ts';
import { FieldInput } from './fields/FieldInput.tsx';
import type { EditorStore } from './state.ts';

export interface BrickFormProps {
  brick: AnyBrick;
  entry: PageEntry;
  editor: EditorStore;
}

export function BrickForm(props: BrickFormProps) {
  const issues = createMemo(() => {
    const result = props.brick.validate(props.entry.data);
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
    setValue: (path, value) => props.editor.setValue(props.entry.id, path, value),
    insertItem: (path, index, value) => props.editor.insertItem(props.entry.id, path, index, value),
    removeItem: (path, index) => props.editor.removeItem(props.entry.id, path, index),
    moveItem: (path, from, to) => props.editor.moveItem(props.entry.id, path, from, to),
    issue: (path) => issues().get(pathKey(path)),
  };

  return (
    <FormContext value={api}>
      <div class="mortar-form">
        <For each={Object.entries(props.brick.schema as Fields)}>
          {([key, field]) => <FieldInput field={field} path={[key]} value={props.entry.data[key]} />}
        </For>
      </div>
    </FormContext>
  );
}
