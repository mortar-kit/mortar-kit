// Preview route loaded in the admin's iframe: renders whatever document the
// editor posts, with the site's real bricks, layouts and styles. Bricks
// that load data read fresh (uncached) content.
import type { Doc, DocOf } from '@mortar-kit/core';
import type { JSX } from '@solidjs/web';
import { PreviewPage } from '@mortar-kit/admin/preview';

import { bricks } from '../bricks/index.ts';
import type { categories, pages, posts, products } from '../collections.ts';
import { freshSource } from '../content.ts';
import { CategoryLayout } from '../layouts/CategoryLayout.tsx';
import { PageLayout } from '../layouts/PageLayout.tsx';
import { PostLayout } from '../layouts/PostLayout.tsx';
import { ProductLayout } from '../layouts/ProductLayout.tsx';

// The editor posts documents of the named collection; the casts are where the preview trusts that.
const layouts = {
  pages: (doc: Doc, body: JSX.Element) => <PageLayout page={doc as DocOf<typeof pages>}>{body}</PageLayout>,
  posts: (doc: Doc, body: JSX.Element) => <PostLayout post={doc as DocOf<typeof posts>}>{body}</PostLayout>,
  products: (doc: Doc) => <ProductLayout product={doc as DocOf<typeof products>} />,
  categories: (doc: Doc) => <CategoryLayout category={doc as DocOf<typeof categories>} />,
};

export default function AdminPreview() {
  return (
    <main>
      <PreviewPage bricks={bricks} content={freshSource} layouts={layouts} />
    </main>
  );
}
