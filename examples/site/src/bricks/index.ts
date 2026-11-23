// Every brick this site defines. Passed to <PageView> and the admin.
import type { AnyBrick } from '@mortar-kit/core';

import { contactForm } from './contact-form.tsx';
import { featureGrid } from './feature-grid.tsx';
import { hero } from './hero.tsx';
import { latestPosts } from './latest-posts.tsx';
import { productGrid } from './product-grid.tsx';
import { video } from './video.tsx';

export const bricks: readonly AnyBrick[] = [hero, featureGrid, latestPosts, productGrid, video, contactForm];
