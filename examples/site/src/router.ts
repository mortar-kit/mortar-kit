// The app's routes. Each document route takes its collection's `url`, the
// pattern the admin's preview links and the sitemap use too. Static
// segments win over /:slug, and the pages collection can't take them as
// slugs. Admin routes are lazy so editor code stays out of the public
// pages' bundle.
import { createRouter } from '@solidjs/router';
import { lazy } from 'solid-js';

import { categories, pages, posts, products } from './collections.ts';
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
    { path: posts.url!, component: Post },
    { path: products.url!, component: Product },
    { path: categories.url!, component: Category },
    { path: '/admin', component: lazy(() => import('./routes/admin.tsx')) },
    { path: '/admin/preview', component: lazy(() => import('./routes/admin-preview.tsx')) },
    { path: '/admin/sign-in', component: lazy(() => import('./routes/sign-in.tsx')) },
    { path: pages.url!, component: Page },
  ],
});
