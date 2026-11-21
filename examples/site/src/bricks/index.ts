// Every brick this site defines. Passed to <PageView> and the editor.
import type { AnyBrick } from '@mortar-kit/core';

import { featureGrid } from './feature-grid.tsx';
import { hero } from './hero.tsx';

export const bricks: readonly AnyBrick[] = [hero, featureGrid];
