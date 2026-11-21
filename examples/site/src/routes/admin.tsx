// Admin: the Mortar editor for the home page. (No auth or saving yet.)
import { Editor } from '@mortar-kit/admin';

import { bricks } from '../bricks/index.ts';
import { home } from '../content/home.ts';

export default function Admin() {
  return <Editor bricks={bricks} page={home} previewUrl="/admin/preview" />;
}
