// Root component (start mode renders it inside Document.tsx). Bricks and
// layouts read content through the ContentContext (cached router queries).
import { ContentContext } from '@mortar-kit/core';
import { Loading } from 'solid-js';

import { source } from './content.ts';
import { Router } from './router.ts';
import './styles.css';

export default function App() {
  return (
    <ContentContext value={source}>
      <Router>{(props) => <Loading>{props.children}</Loading>}</Router>
    </ContentContext>
  );
}
