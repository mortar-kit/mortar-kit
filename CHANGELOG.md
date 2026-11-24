# Changelog

All `@mortar-kit` packages release together, at the same version. Each
release lists what it adds and, under **Upgrading**, anything that can stop
an existing site from building or starting.

## Unreleased

These come from feedback on a site built with 0.2.0. Each is its own pull
request (#29 to #33), so drop any line whose PR hasn't merged by release.

### Added

- `createContentServer({ canWrite })` decides each write per user and
  collection. `false` answers 403 "Not allowed". `allowMembers({ fields: ['role'] })`
  copies member fields onto the user. (#29)
- `useRenderedPage()` gives the app the page's CSP nonce and whether it
  hydrates, for its own scripts. (#32)
- `createMiddleware` takes `headers`, `sitemap`, `robots` and `dev`. The
  sign-in rate limit counts sending a code and trying one separately.
  `sitemap()` takes `lastmod`. (#33)

### Fixed

- The admin shows a thrown Response's text, not "[object Response]".
  Deletes that throw no longer fail silently. (#31)

### Upgrading

- **`MORTAR_ADMINS` with `authorize`.** `authFromEnv` used to ignore
  `MORTAR_ADMINS` when you passed `authorize`. Now it lets both in. If you
  set the variable and rely on `authorize` alone, unset the variable. (#30)
- **New default headers.** `createMiddleware` now sends
  `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin`. If another site
  frames yours, pass `headers: { 'X-Frame-Options': null }`. The CSP is now
  off on the dev server by default (`csp: true` turns it back on). (#33)

## 0.2.0 (2026-11-23)

0.2 takes over most of the code a site used to write around Mortar: server
functions, middleware, auth setup, the server entry, the sitemap.

### Added

- **`createContentServer({ content, auth })`** (`@mortar-kit/core/server`)
  returns the content functions for your `'use server'` module, with every
  write behind `auth.require`. **`contentClient(server, …)`** (main entry)
  builds the cached `source`, `freshSource` and the admin's `content` from
  them. It also sets the server-function upload limit from
  `createContent`'s `assets.maxSize`.
- **`createMiddleware({ auth, blobs })`** (`@mortar-kit/auth`): one
  `start.middleware` that rate-limits sign-in, runs the auth routes and the
  `/admin` guard, serves uploads, and sends a nonce CSP.
- **`authFromEnv({ store })`**: `createAuth` built from environment
  variables (see Upgrading). Also **`resendMailer`**, and
  **`allowMembers({ content, collection })`**, which signs people in from
  a collection of your own.
- **`createRender({ manifest, app })`** (`@mortar-kit/core/render`) and
  **`<ClientScripts>`**: public pages ship no JavaScript, and only `hydrate`
  paths hydrate (`['/admin']` by default).
- **Brick actions**: `defineBrick({ action })`, `<ActionForm>`,
  `props.submission` and `Content.runAction`. A brick handles its own form,
  with or without JavaScript.
- **Islands**: `defineBrick({ interactive: true })` hydrates just that brick
  on a page that otherwise ships no JavaScript. Also `hydrateIslands`,
  `lazyBricks`, `islandActions`, and fields marked `private: true`.
- **Collection URLs**: `defineCollection({ url: '/posts/:slug', home? })`,
  `collection.urlOf(doc)`, `resolveUrl` (admin preview links), and
  `sitemap(content, collections, { origin })`.
- **`<AdminRoute>`** (`@mortar-kit/admin/router`) keeps the admin's location
  in the URL and adds the unsaved-changes leave guard.
- **`seed(content, docs)`** puts starter documents in empty collections.
- **Media library**: asset titles, alt text, folders and search.
- **Collection previews**: a collection without a preview layout previews
  as `DocPreview` (pass `collections` to `PreviewPage`).

### Fixed

- The admin preview's `list()` no longer crashes `createContent` when a GET
  sends its missing options as `null`.

### Upgrading from 0.1

The package APIs of 0.1 still work. What can break is the setup around them:

- **Environment variables.** If you move your auth setup to `authFromEnv`,
  it reads these names, all prefixed `MORTAR_` except the providers' own:

  | Variable | Use |
  | --- | --- |
  | `MORTAR_AUTH_SECRET` | Session signing key. Required in production. |
  | `MORTAR_ADMINS` | Addresses and `*@domain`s that may sign in, unless you pass `authorize`. |
  | `MORTAR_BASE_URL` | Public origin, behind a proxy. |
  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. Set both or neither. |
  | `RESEND_API_KEY`, `MORTAR_EMAIL_FROM` | Email sign-in through Resend. |

  If you set `RESEND_API_KEY` without `MORTAR_EMAIL_FROM`, **the server
  throws on startup**. A site that read its own `EMAIL_FROM` must rename
  it. Production also refuses to start without a secret, without someone
  who may sign in, or without any way to sign in. The dev fallbacks (a
  fixed secret, `admin@example.com`, emails printed to the console) apply
  only under Vite's dev server.
- **Hand-written glue you can delete.** Server functions that wrapped
  `content.list/get/save/…` become one-line re-exports of
  `createContentServer`. A custom middleware for auth, uploads and the CSP
  becomes `createMiddleware`. A custom entry-server with a styles-only
  manifest becomes `createRender`. A hand-made sitemap becomes `sitemap()`.
  Each replacement is in the docs (Storage, Sign-in, No JavaScript,
  Collections).
- **Upload limit.** `createContentServer` raises the server-function body
  limit itself. Import the module that calls it from the vite plugin's
  `serverFunctions.serverSetup`, and drop any limit you set by hand.
- **Installing.** pnpm can refuse a release in its first day (see
  "Installing new releases" below).

## 0.1.0 (2026-11-23)

The first release on npm: `@mortar-kit/core`, `@mortar-kit/admin`,
`@mortar-kit/auth` and the four admin themes.

## Installing new releases

Recent pnpm versions refuse packages published less than a day ago
(`minimumReleaseAge`). To install a Mortar release on the day it comes
out, exclude the packages in `pnpm-workspace.yaml`:

```yaml
minimumReleaseAgeExclude:
  - '@mortar-kit/*'
```
