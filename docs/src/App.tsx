// Root component (start mode renders it inside Document.tsx). Every page
// hydrates: once it has, this tab's edits (if any) replace the published
// content the server rendered.
import { ContentContext } from '@mortar-kit/core';
import { Loading, onSettled } from 'solid-js';

import { showEdits, source } from './content/content.ts';
import { Router } from './router.ts';
import './styles.css';

export default function App() {
  onSettled(() => {
    showEdits();
  });
  return (
    <ContentContext value={source}>
      <Router>{(props) => <Loading>{props.children}</Loading>}</Router>
    </ContentContext>
  );
}
