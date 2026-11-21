// Hard-coded home page until persistence lands (step 4 loads it from JSON).
import type { Page } from '@mortar-kit/core';

export const home: Page = [
  {
    brick: 'hero',
    id: 'hero-1',
    data: {
      heading: 'Mortar',
      intro: 'A small Solid 2 framework: define bricks, compose pages, edit them live.',
      ctaLabel: 'Read the docs',
      ctaHref: '/docs',
      align: 'center',
    },
  },
];
