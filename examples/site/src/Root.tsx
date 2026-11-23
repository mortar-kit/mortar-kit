// The whole rendered tree, shared by both entries so their trees can't
// drift apart (hydration needs them identical). Like the plugin's generated
// entries, one error boundary goes around the document and one around the
// app inside it, so a page error keeps the head, styles and bootstrap.
import App from './App.tsx';
import Document from './Document.tsx';
import { ErrorPage } from './ErrorPage.tsx';

export function Root() {
  return (
    <ErrorPage>
      <Document>
        <ErrorPage>
          <App />
        </ErrorPage>
      </Document>
    </ErrorPage>
  );
}
