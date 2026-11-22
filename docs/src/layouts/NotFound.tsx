// Shown when a route's document or export doesn't exist; the server answers 404.
import { httpStatus } from '@solidjs/web';

import { Head } from './Head.tsx';
import styles from './layouts.module.css';

export function NotFound(props: { what: string }) {
  httpStatus(404);
  return (
    <main class={styles.notFound}>
      <Head title="Not found" />
      <h1>Not found</h1>
      <p>There is no {props.what} here.</p>
      <p>
        <a href="/docs">Back to the docs</a>
      </p>
    </main>
  );
}
