// The Mortar mark in the admin: a body of three bricks, the middle one slid
// out as it is edited. The bars take the text colour; the middle one the
// theme's accent. Decorative: it sits beside the admin's own labels.
import styles from './Mark.module.css';

export function Mark() {
  return (
    <svg class={styles.mark} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="4" width="22" height="6.5" rx="2" />
      <rect class={styles.accent} x="7" y="12.75" width="22" height="6.5" rx="2" />
      <rect x="3" y="21.5" width="22" height="6.5" rx="2" />
    </svg>
  );
}
