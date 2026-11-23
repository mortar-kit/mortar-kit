// Admin: the Mortar admin for every collection, saving through the app's
// server functions. <AdminRoute> keeps where it is in the URL
// (?collection=&id=, or ?view=assets for the asset library), so documents
// can be linked and back/forward moves between them, and asks before
// router navigation leaves unsaved changes. ⌘/Ctrl-clicked links in the
// preview open the document they show, by the collections' `url` patterns.
// Only signed-in admins get here (src/middleware.ts); the rail shows who,
// with Sign out.
import { AdminRoute } from '@mortar-kit/admin/router';
import { createMemo } from 'solid-js';

import { bricks } from '../bricks/index.ts';
import { collections } from '../collections.ts';
import { adminContent, getUser } from '../content.ts';

export default function AdminPage() {
  const user = createMemo(() => getUser());
  return <AdminRoute bricks={bricks} collections={collections} content={adminContent} previewUrl="/admin/preview" user={user()} />;
}
