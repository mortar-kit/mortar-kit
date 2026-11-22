// The app's routes. Static segments win over /:slug, so pages can't take
// them (the pages collection reserves them too). Admin routes are lazy so
// editor code stays out of the public pages' bundle.
import { createRouter } from '@solidjs/router';
import { lazy } from 'solid-js';

import Category from './routes/category.tsx';
import Home from './routes/home.tsx';
import Page from './routes/page.tsx';
import Post from './routes/post.tsx';
import Posts from './routes/posts.tsx';
import Product from './routes/product.tsx';

export const Router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/posts', component: Posts },
    { path: '/posts/:slug', component: Post },
    { path: '/products/:slug', component: Product },
    { path: '/categories/:slug', component: Category },
    { path: '/admin', component: lazy(() => import('./routes/admin.tsx')) },
    { path: '/admin/preview', component: lazy(() => import('./routes/admin-preview.tsx')) },
    { path: '/admin/sign-in', component: lazy(() => import('./routes/sign-in.tsx')) },
    { path: '/:slug', component: Page },
  ],
});
