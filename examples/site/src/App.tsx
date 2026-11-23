// Root component (start mode renders it inside Document.tsx). Bricks and
// layouts read content through the ContentContext (cached router queries);
// brick forms post through BrickActionsContext (src/actions.ts).
import { BrickActionsContext, ContentContext } from '@mortar-kit/core';
import { Loading } from 'solid-js';

import { brickActions } from './actions.ts';
import { source } from './content.ts';
import { Router } from './router.ts';
import './styles.css';

export default function App() {
  return (
    <ContentContext value={source}>
      <BrickActionsContext value={brickActions}>
        <Router>{(props) => <Loading>{props.children}</Loading>}</Router>
      </BrickActionsContext>
    </ContentContext>
  );
}
