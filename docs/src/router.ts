// The docs site's routes. The admin is lazy, so editor code stays out of
// the public pages' bundle.
import { createRouter } from '@solidjs/router';
import { lazy } from 'solid-js';

import { NotFoundRoute } from './routes/not-found.tsx';
import Guide, { GuideIndex } from './routes/guide.tsx';
import Home from './routes/home.tsx';
import { ReferenceEntry, ReferenceIndex } from './routes/reference.tsx';

export const Router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/docs', component: GuideIndex },
    { path: '/docs/:slug', component: Guide },
    { path: '/reference', component: ReferenceIndex },
    { path: '/reference/:name', component: ReferenceEntry },
    { path: '/admin', component: lazy(() => import('./routes/admin.tsx')) },
    { path: '/admin/preview', component: lazy(() => import('./routes/admin-preview.tsx')) },
    { path: '*', component: NotFoundRoute },
  ],
});
