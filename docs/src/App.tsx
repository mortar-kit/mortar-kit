// Root component (start mode renders it inside Document.tsx). Every page
// hydrates: once it has, this tab's edits (if any) replace the published
// content the server rendered, and the syntax highlighter loads for code
// the browser renders from then on.
import { ContentContext } from '@mortar-kit/core';
import { Loading, onSettled } from 'solid-js';

import { showEdits, source } from './content/content.ts';
import { loadHighlighter } from './highlight/index.ts';
import { Router } from './router.ts';
import './styles.css';

export default function App() {
  onSettled(() => {
    showEdits();
    void loadHighlighter();
  });
  return (
    <ContentContext value={source}>
      <Router>{(props) => <Loading>{props.children}</Loading>}</Router>
    </ContentContext>
  );
}
