// Every brick the docs site defines. Passed to <PageView>, createContent and the admin.
import type { AnyBrick } from '@mortar-kit/core';

import { apiEntry } from './api-entry.tsx';
import { callout } from './callout.tsx';
import { cards } from './cards.tsx';
import { hero } from './hero.tsx';
import { markdown } from './markdown.tsx';

export const bricks: readonly AnyBrick[] = [markdown, callout, apiEntry, hero, cards];
