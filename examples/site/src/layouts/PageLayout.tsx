// How a page renders: its head tags, then its body.
import type { DocOf } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';

import type { pages } from '../collections.ts';
import { Head } from './Head.tsx';

export function PageLayout(props: { page: DocOf<typeof pages>; children: JSX.Element }) {
  return (
    <>
      <Head title={props.page.fields.title} description={props.page.fields.description} />
      {props.children}
    </>
  );
}
