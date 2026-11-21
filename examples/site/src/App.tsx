// Root component (start mode renders it inside Document.tsx).
import { PageView } from '@mortar-kit/core';

import { bricks } from './bricks/index.ts';
import { home } from './content/home.ts';
import './styles.css';

export default function App() {
  return (
    <main>
      <PageView bricks={bricks} page={home} />
    </main>
  );
}
