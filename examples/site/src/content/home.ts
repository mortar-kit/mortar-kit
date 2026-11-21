// Hard-coded home page until persistence lands (step 4 loads it from JSON).
import type { Page } from '@mortar-kit/core';

export const home: Page = [
  {
    brick: 'hero',
    id: 'hero-1',
    data: {
      heading: 'Mortar',
      intro: 'A small Solid 2 framework: define bricks, compose pages, edit them live.',
      ctaLabel: 'Open the editor',
      ctaHref: '/admin',
      align: 'center',
    },
  },
  {
    brick: 'feature-grid',
    id: 'features-1',
    data: {
      heading: 'Why bricks?',
      columns: 3,
      features: [
        { title: 'Typed', body: 'Each brick declares its fields; components get typed data.', image: { src: '', alt: '' } },
        { title: 'Editable', body: 'The admin form is generated from the same schema.', image: { src: '', alt: '' } },
        { title: 'Live', body: 'The preview renders the real components as you type.', image: { src: '', alt: '' } },
      ],
    },
  },
];
