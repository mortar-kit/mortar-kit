// Admin: the Mortar editor for the home page, saving through the app's
// server function. Unprotected: guard /admin in your own app.
import { Editor } from '@mortar-kit/admin';
import { createMemo } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { getPage } from '../pages.ts';
import { saveStoredPage } from '../server/pages.ts';

export default function Admin() {
  const page = createMemo(() => getPage('home'));
  return (
    <Editor
      bricks={bricks}
      page={page() ?? { entries: [] }}
      previewUrl="/admin/preview"
      onSave={(next) => saveStoredPage('home', next)}
    />
  );
}
