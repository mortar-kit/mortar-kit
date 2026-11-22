// Any other path.
import { NotFound } from '../layouts/NotFound.tsx';
import { Shell } from '../layouts/Shell.tsx';

export function NotFoundRoute() {
  return (
    <Shell>
      <NotFound what="page" />
    </Shell>
  );
}
