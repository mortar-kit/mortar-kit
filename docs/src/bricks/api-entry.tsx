// A reference entry inside a guide: the declaration and comment of one
// export, loaded from the generated reference by name.
import { defineBrick, fields } from '@mortar-kit/core';
import { Show } from 'solid-js';

import { findEntry } from '../reference/api.ts';
import { Entry } from '../reference/Entry.tsx';
import styles from './api-entry.module.css';

export const apiEntry = defineBrick({
  name: 'api-entry',
  label: 'API entry',
  schema: {
    name: fields.text({ label: 'Export', help: 'The name of a Mortar export, e.g. createContent.', required: true, default: 'defineBrick' }),
  },
  load: (data) => findEntry(data.name.trim()),
  component: (props) => (
    <Show when={props.loaded.entry} fallback={<p class={styles.missing}>No Mortar export is named “{props.data.name}”.</p>}>
      {(entry) => <Entry entry={entry()} names={props.loaded.names} level={2} linked />}
    </Show>
  ),
});
