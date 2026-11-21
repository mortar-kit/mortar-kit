// Public home page: the stored page rendered with the site's bricks.
import { PageView } from '@mortar-kit/core';

import { bricks } from '../bricks/index.ts';
import { home } from '../content/home.ts';

export default function Home() {
  return (
    <main>
      <PageView bricks={bricks} page={home} />
    </main>
  );
}
