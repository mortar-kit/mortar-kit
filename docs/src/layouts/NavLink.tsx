// A link that marks itself as the current page (aria-current), for navs.
import type { JSX } from '@solidjs/web';
import { useLinkState } from '@solidjs/router';

export function NavLink(props: { href: string; class?: string; children: JSX.Element }) {
  const link = useLinkState(() => props.href);
  return (
    <a href={props.href} class={props.class} aria-current={link.active() ? 'page' : undefined}>
      {props.children}
    </a>
  );
}
