/// <reference types="@solidjs/vite-plugin/virtual-modules" />
// Server entry: createRender renders each request. The editor and its
// preview (/admin and below) hydrate; every other page is sent as plain
// HTML with its stylesheets and no JavaScript at all (see
// @mortar-kit/core/render). <ClientScripts> in Document.tsx adds the
// client entry only where it's needed.
import { createRender } from '@mortar-kit/core/render';
import manifest from 'virtual:solid-manifest';

import { Root } from './Root.tsx';

export const render = createRender({ manifest, app: () => <Root /> });
