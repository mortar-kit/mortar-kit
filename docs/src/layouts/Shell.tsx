// The frame around every public page: the header with the site's sections,
// the edits bar, then the page.
import type { JSX } from '@solidjs/web';
import { EditsBar } from './EditsBar.tsx';
import { Logo } from './Logo.tsx';
import { NavLink } from './NavLink.tsx';
import styles from './Shell.module.css';

export function Shell(props: { children: JSX.Element }) {
  return (
    <div class={styles.shell}>
      <header class={styles.header}>
        <a class={styles.logo} href="/">
          <Logo />
        </a>
        <nav class={styles.nav} aria-label="Site">
          <NavLink href="/docs">Docs</NavLink>
          <NavLink href="/reference">Reference</NavLink>
          <a href="/admin">Edit this site</a>
        </nav>
      </header>
      <EditsBar />
      {props.children}
    </div>
  );
}
