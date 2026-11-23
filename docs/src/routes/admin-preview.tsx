// Preview route loaded in the admin's iframe: renders the document the
// editor posts with the site's real bricks, inside the site's layouts.
// Bricks that load data read this tab's content (edits included).
import type { Doc, DocOf } from '@mortar-kit/core';
import { PreviewPage } from '@mortar-kit/admin/preview';
import type { JSX } from '@solidjs/web';

import { bricks } from '../bricks/index.ts';
import { collections, type docs } from '../collections.ts';
import { source } from '../content/content.ts';
import { DocsLayout } from '../layouts/DocsLayout.tsx';
import layoutStyles from '../layouts/layouts.module.css';
import { Shell } from '../layouts/Shell.tsx';

// The editor posts documents of the named collection; the casts are where the preview trusts that.
const layouts = {
  docs: (doc: Doc, body: JSX.Element) => <DocsLayout guide={doc as DocOf<typeof docs>}>{body}</DocsLayout>,
  pages: (_doc: Doc, body: JSX.Element) => (
    <Shell>
      <main class={layoutStyles.page}>{body}</main>
    </Shell>
  ),
};

export default function AdminPreview() {
  return <PreviewPage bricks={bricks} collections={collections} content={source} layouts={layouts} />;
}
