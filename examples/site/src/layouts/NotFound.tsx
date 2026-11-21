// Shown when a route's document doesn't exist; the server answers 404.
import { httpStatus } from '@solidjs/web';

export function NotFound(props: { what: string }) {
  httpStatus(404);
  return (
    <main style={{ padding: '3rem 1.5rem', 'text-align': 'center' }}>
      <h1>Not found</h1>
      <p>There is no {props.what} here.</p>
    </main>
  );
}
