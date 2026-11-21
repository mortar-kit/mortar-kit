// The app's routes. Admin routes are lazy so editor code stays out of the
// public pages' bundle.
import { createRouter } from '@solidjs/router';
import { lazy } from 'solid-js';

import Home from './routes/home.tsx';

export const Router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/admin', component: lazy(() => import('./routes/admin.tsx')) },
    { path: '/admin/preview', component: lazy(() => import('./routes/admin-preview.tsx')) },
  ],
});
