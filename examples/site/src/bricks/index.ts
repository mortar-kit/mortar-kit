// Every brick this site defines. Passed to <PageView> (and later the editor).
import type { AnyBrick } from '@mortar-kit/core';

import { hero } from './hero.tsx';

export const bricks: readonly AnyBrick[] = [hero];
