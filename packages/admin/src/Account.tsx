// The signed-in user at the foot of the admin's rail: their initial, with
// their name and address as its label, and a Sign out button. Sign out is
// a plain form post to the auth routes, which clear the session cookie.
import styles from './Account.module.css';

/** The signed-in user, as the admin shows them. */
export interface AdminUser {
  email: string;
  name?: string;
}

export function Account(props: { user: AdminUser; signOutUrl: string }) {
  const label = () => (props.user.name ? `${props.user.name} (${props.user.email})` : props.user.email);
  return (
    <form method="post" action={props.signOutUrl} class={styles.account}>
      <span class={styles.avatar} title={label()} aria-label={`Signed in as ${label()}`} role="img">
        {(props.user.name || props.user.email).slice(0, 1).toUpperCase()}
      </span>
      <button type="submit" class={styles.signOut}>
        Sign out
      </button>
    </form>
  );
}
