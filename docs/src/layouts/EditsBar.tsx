// Shown while this tab has edits: says only this reader sees them, and
// resets the site to what is published (after asking, inline).
import { createSignal, Show } from 'solid-js';

import { hasEdits, resetEdits } from '../content/content.ts';
import styles from './EditsBar.module.css';

export function EditsBar() {
  const [asking, setAsking] = createSignal(false);
  return (
    <Show when={hasEdits()}>
      <div class={styles.bar} role="status">
        <p>
          You're viewing edits you made in this tab. They're kept in your browser's session storage, and no one else sees them.
        </p>
        <Show
          when={asking()}
          fallback={
            <button type="button" class={styles.reset} onClick={() => setAsking(true)}>
              Reset to the published site
            </button>
          }
        >
          <span class={styles.confirm}>
            Discard all your edits?
            <button
              type="button"
              class={styles.reset}
              onClick={() => {
                setAsking(false);
                resetEdits();
              }}
            >
              Discard edits
            </button>
            <button type="button" class={styles.cancel} onClick={() => setAsking(false)}>
              Keep them
            </button>
          </span>
        </Show>
      </div>
    </Show>
  );
}
