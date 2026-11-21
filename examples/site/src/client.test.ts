// hydrates: which paths load the client entry.
import { describe, expect, it } from 'vitest';

import { hydrates } from './client.ts';

describe('hydrates', () => {
  it('is true for the editor and its preview, in any case or with a trailing slash', () => {
    for (const path of ['/admin', '/admin/', '/admin/preview', '/Admin', '/ADMIN/Preview']) expect(hydrates(path)).toBe(true);
  });

  it('is false for public pages and look-alike paths', () => {
    for (const path of ['/', '/about', '/administrator', '/x/admin']) expect(hydrates(path)).toBe(false);
  });
});
