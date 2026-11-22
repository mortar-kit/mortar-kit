// The generated reference covers every runtime export of the packages, so
// a new export without a fresh `pnpm reference` fails here.
import * as admin from '@mortar-kit/admin';
import * as core from '@mortar-kit/core';
import * as server from '@mortar-kit/core/server';
import { describe, expect, it } from 'vitest';

import { findEntry, listEntries } from './api.ts';

describe('the API reference', () => {
  it('lists every runtime export', async () => {
    const documented = new Set((await listEntries()).flatMap((m) => m.entries.map((e) => `${e.module} ${e.name}`)));
    // The plugin adds `$$moduleUrl` to modules it compiles for the server.
    const names = (m: object) => Object.keys(m).filter((name) => !name.startsWith('$$'));
    const exported = [
      ...names(core).map((name) => `@mortar-kit/core ${name}`),
      ...names(server).map((name) => `@mortar-kit/core/server ${name}`),
      ...names(admin).map((name) => `@mortar-kit/admin ${name}`),
    ];
    expect(exported.filter((e) => !documented.has(e))).toEqual([]);
  });

  it('finds an entry with its signature and comment', async () => {
    const { entry, names } = await findEntry('createContent');
    expect(entry?.signature).toContain('createContent(options: ContentOptions): Content');
    expect(entry?.summary).toContain('rules');
    expect(names).toContain('ContentStore');
    expect((await findEntry('nothing')).entry).toBeNull();
  });
});
