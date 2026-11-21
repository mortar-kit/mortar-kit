// Preview route loaded in the editor's iframe: renders whatever page the
// editor posts, with the site's real bricks and styles.
import { PreviewPage } from '@mortar-kit/admin/preview';

import { bricks } from '../bricks/index.ts';

export default function AdminPreview() {
  return (
    <main>
      <PreviewPage bricks={bricks} />
    </main>
  );
}
