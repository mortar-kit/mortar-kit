# Mortar

Mortar is a small website framework on **Solid 2**. Developers define **bricks**
(UI sections + a schema) and **collections** (sets of documents sharing a
schema: pages, posts, products); Mortar renders bodies (ordered
`{ brick, id, data }` entries) and generates a live-preview admin panel. Keep
it small: this is a lightweight framework, not a CMS. Use "brick" for
developer-defined sections; keep every other name plain and conventional (no
further construction puns).

## Decisions (2026-11-21, collections 2026-11-22, manual order 2026-11-22)

- **Schema**: `fields.*` helpers that build **Valibot** schemas; UI hints live in
  `v.metadata({ mortar: FieldInfo })`. Validation is Valibot's. `fields.date`
  stores `YYYY-MM-DD`; `fields.reference({ collection })` stores the target
  document's **id** (never its slug), so renames keep links.
- **Collections**: `defineCollection({ name, label, fields, body?, title?, sort?, orderable?, reservedSlugs? })`.
  A document (type `Doc`, not `Document`) is `{ id, slug, position?, fields, entries? }`:
  `entries` is its body when the collection has `body: true`. Pages are not
  built in: a site declares its own `pages` collection (Mortar ships no
  collections, like no bricks). Keys of `fields` outside the schema are kept;
  so are stored entries of a collection whose body is off (never rendered).
- **Manual order** (2026-11-22): `orderable: true` keeps a collection in an
  order editors set (admin document list: drag a row, or its move up/down
  buttons). Stored as a top-level `position` number (1, 2, 3…) in each
  document, so every store keeps it with no adapter change. `createContent`
  owns it: `validateDoc` drops the client's `position` and `save` keeps the
  stored one; a new document goes last; `Content.move(collection, id, index)`
  renumbers, writing only documents whose position changed. Lists follow the
  manual order unless they pass `sort`. Documents without a position sort
  after those with one, by the collection's `sort`, and get one on the next
  move or new-document save (no migration). `Content.move` is optional on
  the interface (the admin hides reorder controls without it);
  `createContent` always has it.
- **URLs** (2026-11-23): a collection's optional `url` pattern (one `:slug`
  segment, router syntax; `home` names the slug at the prefix, e.g. `/`)
  is the one place a document's address is written: the app's routes take
  `collection.url`, links use `collection.urlOf(doc)`, the admin's preview
  links default to `resolveUrl(collections, url)` (most static segments
  win), `sitemap(content, collections, { origin })` builds the XML, and
  `createContent` refuses slugs another collection's pattern starts with
  (`/posts/:slug` takes `posts` from `/:slug`). Mortar still doesn't route.
- **Storage**: a dumb `ContentStore` adapter (`list/get/put/remove` raw
  documents by collection and slug) behind `createContent`, which applies
  every rule: normalize on read, validate on save, unique slugs, renames move
  the file and keep the id, list `where/sort/limit`, and delete refused while
  other documents reference the document. Writes through one `createContent`
  run one at a time (per process). `seed(content, docs)` saves starter documents into
  empty collections only, validated like editor saves. Default adapter: **JSON files**
  `content/<collection>/<slug>.json` (the slug is the file name, not stored
  inside); listing reads the whole folder (fine for small sites).
- **Assets** (2026-11-22): uploaded files live in a `BlobStore` adapter
  (`list/get/put/remove/url`), separate from `ContentStore`, passed to
  `createContent({ blobs })`, which checks type (extension allowlist, no
  SVG), size and key, and refuses deletes while documents use a file. Keys
  are `<name>-<6 random>.<ext>`; blob stores keep only bytes. Asset details
  (2026-11-22: default `title` and `alt`, `folder`) and folders (one level,
  stable ids) are one document in the *content* store, `mortar-assets/library`
  (a reserved collection name), so every blob store gets them unchanged;
  assets without details need no migration. `Assets.update`, `folders`,
  `saveFolder`, `removeFolder` are optional on the interface (the admin
  hides details and folders without them); `createContent` always has
  them. Deleting a folder keeps its files (they become unfiled). Image and
  file fields store the key in `asset` plus a `title` (images also `alt`);
  picking an asset copies its defaults where it has them; `src` is stored
  empty and filled from `blobs.url` on read. Adapters: memory (core), folder (`core/server`),
  served by the app with `serveBlob`.
- **Loading data**: a brick may declare `load(data, content)`; it reads
  through a typed `ContentReader` from the `ContentSource` the app provides
  with `ContentContext` (`useContent()` in layouts). It runs on the server
  (pages without JavaScript included) and in the admin preview (saved
  content, again after each save via `ContentSource.track`). Detail page
  layouts are the app's code; Mortar stays out of routing.
- **Brick actions** (2026-11-23): `defineBrick({ action })` handles the
  brick's form. The component renders `<ActionForm>` (a plain post form) and
  reads `props.submission` (`{ pending, result?, error? }`). The form names
  its entry (`EntryRef`: collection, doc id, entry id; `PageView` needs
  `doc`), never its data: `Content.runAction(ref, form, { request, context })`
  reads the stored entry and calls the action with its normalized `data`, so
  editor-set values (a recipient) can't be forged. Server-only services
  reach actions through `context` (`ActionContext`, augmented by the app),
  since brick modules reach the browser. The app runs actions through one
  `'use server'` function and provides `BrickActions` (`action(ref)`,
  `useSubmission(ref)`) with `BrickActionsContext`; with the router that's
  `formAction(...).with(ref)` + `useSubmissions`, which posts plainly without
  JS (result back in Solid's flash cookie, ~4 kB) and in the background with
  JS (only the brick updates). The admin preview doesn't submit forms.
- **Islands** (2026-11-23): `defineBrick({ interactive: true })` (Thomas
  asked for `island: true`; `interactive` says what the brick needs).
  On a page createRender sends without JavaScript (`rendersIslands()`: server
  and not hydratable), PageView loads the entry as usual, then renders it in
  `ServerIsland`: a `data-mortar-island` element (display: contents) whose
  JSON payload is `{ id, brick, data, loaded?, ref?, submission? }`, around
  `<Hydration id>`. Ids are `mi<n>-` per request and per entry (the server
  may render an entry twice; the dash keeps prefixes apart). Inside the zone,
  `islandView` is the same tree on both sides; the submission accessor is
  made outside it (router hook vs `islandActions`). Static pages keep
  `noScripts` (Solid's data would cover the whole page): `load` runs on the
  server only and its result rides in the payload, so a component mustn't
  await anything itself. createRender counts the request's islands and, if
  any, puts `generateHydrationScript` + the client entry (`context.clientEntry`,
  not async) before `</head>` of the settled HTML. Fields marked
  `private: true` are reset to their defaults in the payload (and in the
  server's island render, so both match). `hydrateIslands({ bricks, actions })`
  (async) takes the brick list or loaders by name (`lazyBricks(import.meta.glob(...))`:
  files named after their brick, one chunk each), loads the page's island
  bricks first, then hydrates them all at once (Solid ends hydration after the
  first roots finish, so a later `hydrate` would render afresh), each with
  `hydrate(..., el, { renderId })`; `islandActions({ action,
  run })` gives `BrickActions.submit`, which `<ActionForm>` calls instead of
  posting, and decodes the server function's answer (a whole `Response`
  when it used `respond`, via `decodeResponse`).
- **Packages**: `@mortar-kit/core` (fields, bricks, collections, documents,
  storage rules, `PageView`, content context) and `@mortar-kit/admin`
  (`<Admin>`, `<Editor>`, `<SignIn>`), plus `@mortar-kit/auth` (server-only
  sign-in). Admin code never reaches the public site bundle.
- **Admin layout and themes** (2026-11-22): the admin is laid out as a
  collections rail, a panel (the open collection's documents, or the open
  document's outline: slug, Details, body entries), a top bar (breadcrumb,
  Delete, save status, Save), the preview, and an inspector with the selected
  item's form (resizable from its left edge; the width is kept in
  localStorage). List fields are stacks of collapsible item cards. Looks ship as theme packages (`@mortar-kit/theme-midnight`,
  `-warm`, `-soft`, `-mono`) chosen in vite.config with
  `mortarKit({ theme })` from `@mortar-kit/admin/vite`. A theme is only
  `--mortar-*` values (tokens in `packages/admin/src/tokens.css`), never a
  different layout.
- **Admin mount**: a route in the consuming app (e.g. `/admin`) rendering
  `<Admin>` (collections and their documents) or a single `<Editor>`; the
  preview is a same-origin iframe rendering the real bricks inside the app's
  layouts (`PreviewPage` `layouts`: a preview component per collection).
  A collection without one previews as `DocPreview` (title, lead image,
  labelled fields, then the body) when `PreviewPage` gets `collections`;
  layouts stay in the preview route, not on `defineCollection`, so
  collection files never import UI. The admin's location can live in the
  app's URL (`location` + `onNavigate`); `<AdminRoute>` from
  `@mortar-kit/admin/router` (optional peer `@solidjs/router`) does that with
  search parameters and adds the unsaved-changes leave guard (`useBeforeLeave`,
  waits for a save in flight).
- **Auth** (2026-11-22): `createAuth({ methods: [google(), email()], authorize, secret })`
  in `@mortar-kit/auth`, Fetch `Request` in, `Response` out (framework-neutral).
  Methods are an array of `{ id, label, input, start, callback }` that verify an
  `Identity` (`{ email, name?, method }`); the app's `authorize({ identity })`
  returns its user or null (Thomas chose this over an allowlist option;
  `allowEmails([...])` is the ready-made one, `allowMembers({ content, collection })`
  reads a collection the site declares). It runs at sign-in and on every
  guarded request. `authFromEnv({ store })` builds it all from env
  (`MORTAR_AUTH_SECRET`, `MORTAR_ADMINS`, `GOOGLE_CLIENT_*`, `RESEND_API_KEY` +
  `MORTAR_EMAIL_FROM`, `MORTAR_BASE_URL`); its dev fallbacks (secret, admin,
  console mailer) apply only under Vite's `import.meta.env.DEV`. Sessions are a stateless HMAC-signed cookie (Web Crypto;
  `secret` may be an array to rotate). Email sends a code and a link in one
  message through a `Mailer` (`consoleMailer()` for dev, `resendMailer()`
  optional, any provider in a few lines); pending sign-ins are
  hashes in a ContentStore under `mortar-auth-tokens`. The link opens the
  sign-in page, which posts it (mail scanners can't use it up).
  `createMiddleware({ auth, blobs, rateLimit?, clientKey?, csp? })` is the
  site's `start.middleware`: a per-client limit on sign-in posts (in memory;
  keyed by X-Forwarded-For/X-Real-IP, unkeyed requests unlimited so nobody
  can lock editors out), then `auth.handle` (auth routes under `/admin/auth`,
  redirects for `protect`ed `/admin`), then uploads at `blobs.url('')`, then
  pages with a nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`, sets
  `event.nonce`). Every writing server function calls `auth.require(request)`
  itself, since middleware can't tell the admin's calls.

## Layout

- `packages/core`, `packages/admin`, `packages/auth`: published under `@mortar-kit`. In the
  workspace, `exports` point at `src/` (the `solid` condition) so no build is
  needed for dev/tests; `publishConfig.exports` points at `dist/`.
- `packages/theme-*`: plain JS packages (no build): `theme.css` sets
  `--mortar-*` on `:root`; `index.js` exports `{ name, stylesheet }` for the
  plugin. The admin imports `theme-slot.css` (empty); `mortarKit({ theme })`
  serves it with the theme's stylesheet, so a theme lands only in the admin's
  CSS, never on public pages.
- `@mortar-kit/core/render`: the server entry's `createRender` (and
  `stylesOnly`), server-only.
- `@mortar-kit/core/server`: node-only entry (`createJsonFileStore`), kept
  out of the main entry so `node:fs` never reaches a client bundle. The
  storage rules (`createContent`, `createMemoryStore`) are in the main entry.
- `examples/site`: private app (`@solidjs/vite-plugin` start mode, SSR with
  `renderMode: 'async'`, so pages and head tags are in the HTML). Mortar ships
  no bricks or collections of its own; the example declares pages, posts,
  products (orderable) and categories (`src/collections.ts`, each with a
  `url` that its router, links and `/sitemap.xml` use), bricks (two load
  data: latest posts, a product grid), and layouts (`src/layouts/`) shared by its
  routes and the admin preview. The contact-form brick has an `action` (see
  Brick actions); `src/actions.ts` wires brick forms to the router, and
  `src/server/mail.ts` gives actions a mailer, the inbox (`CONTACT_TO`) and
  a per-client limit. Its entries are authored (`src/entry-server.tsx`,
  `src/entry-client.tsx`, shared tree in `src/Root.tsx`) so public pages ship
  **no JavaScript**: the server entry is `createRender({ manifest, app })`
  from `@mortar-kit/core/render` (`hydrate` default `['/admin']`); other
  pages render under `<NoHydration>` with `noScripts` and a CSS-only
  manifest (`stylesOnly`), and `<ClientScripts>` in `Document.tsx` renders
  nothing on them. It hands the page's settings to `<ClientScripts>` by
  request (a WeakMap keyed by the request event's Request), never a context
  provider, which would shift hydration keys. The contact form is an island
  (see Islands): `src/entry-client.tsx` imports `src/islands.ts` on pages
  with islands and `Root.tsx` otherwise, each lazily. Content is JSON files in
  `examples/site/content/<collection>/`, read and written by the
  `'use server'` module `src/server/content.ts`; `src/content.ts` wraps it
  (GET reads: cached router queries for routes, fresh for the admin).
- `docs`: the Mortar docs site (private app `mortar-docs`), written in
  Mortar. Collections `docs` (guides: section, position, brick body) and
  `pages` (home); bricks Markdown (marked), Callout, Figure, API entry, Hero, Cards.
  Code is highlighted with Shiki (`src/highlight/`: four precompiled
  grammars, TSX for the whole TS/JS family, GitHub light/dark themes as
  `--shiki-*` vars): the server highlights up front; the browser keeps the
  server's HTML on hydration and loads Shiki as its own chunk afterwards
  (`loadHighlighter` in `App.tsx`), so client re-renders highlight too.
  Published content is JSON in `docs/content/<collection>/<slug>.json`,
  bundled with `import.meta.glob` (no server functions, no file access at
  runtime). Every page hydrates: the server renders the published content,
  and in the browser `createContent` runs over `createSessionStorageStore`
  (`src/content/session-store.ts`: only changes, over the baseline, under one
  key), so the admin edits this tab only; uploads go to
  `createSessionStorageBlobStore` (`src/content/session-blob-store.ts`,
  1 MB cap) and reset with the edits. Reads go through a version signal;
  `showEdits()` after hydration and `resetEdits()` (the edits bar's "Reset to
  the published site") bump it. `/reference` renders `src/reference/api.json`,
  generated by `pnpm reference` (TypeDoc, with the package's own TypeScript 6,
  since TypeDoc doesn't support 7); a test fails when a runtime export is
  missing from it. `src/middleware.ts` (`start.middleware`) serves the
  llms.txt files from the same content and reference on request
  (`src/llms/`): `/llms.txt` (index), `/llms-full.txt` (everything), and
  each page as Markdown (`/index.md`, `/docs/<slug>.md`, `/reference.md`,
  `/reference/<name>.md`). Every brick needs a converter in
  `src/llms/markdown.ts` (a test fails without one).
- Auth in the example: `src/server/auth.ts` (`authFromEnv`; without
  `RESEND_API_KEY` dev emails print to the console), `src/middleware.ts`, `/admin/sign-in`
  (`src/routes/sign-in.tsx`), and `requireAdmin()` in every write (save, delete, upload, remove asset). Pending email
  sign-ins live in `examples/site/.data/` (git-ignored). Dev default admin:
  `admin@example.com`.

## Tooling

- Node and pnpm come from the nix flake: `nix develop -c pnpm <script>`.
- `nix build .#docs` (`nix/docs.nix`): the docs site for production,
  `bin/mortar-docs` running `dist/server/node.js` (the vite plugin's
  `start.nodeServer`; `ssr.noExternal` bundles every dependency, so no
  node_modules ship). After changing dependencies, update `pnpmDeps.hash`
  there (set `lib.fakeHash`, build, copy the hash it prints). web-1 in
  albrighton-dev/config serves it at docs.mortar-kit.dev;
  `.github/workflows/notify-config.yml` asks config to bump it on merge.
- Publishing: the `@mortar-kit` packages release to npm in lockstep from
  `.github/workflows/publish.yml`. Bump them all with
  `node scripts/release-version.mjs set <version>`, merge, then push the tag
  `v<version>`; the workflow checks the tag against the versions, runs
  typecheck/lint/test, packs each package with pnpm (`prepack` builds;
  `publishConfig` and `workspace:` ranges are applied) and publishes with
  npm through trusted publishing (OIDC, no token; provenance comes with
  it), skipping versions already on npm. Running it by hand is a dry run.
  npm only offers trusted publishing for a package that exists, so a new
  package is first published once by hand (`pnpm pack` in its folder, then
  `npm publish <tgz> --access public` while logged in), then given a
  Trusted publisher (GitHub Actions, mortar-kit/mortar-kit, publish.yml).
- Scripts (root): `typecheck`, `lint`, `test`, `dev` (example site), `docs`
  (docs site, port 3100), `reference` (regenerate the API reference), `build`.
  Keep all green at every step.
- Tests: vitest projects. `*.test.tsx` → client (jsdom); `*.test.ts` and
  `*.ssr.test.tsx` → server (node, SSR codegen). Call `flush()` before asserting.
  Anything that must re-run (memos, effects, derived stores) needs a client
  test: the server build of Solid computes once and never updates.
- No SolidStart (Solid 1 only): start mode lives in `@solidjs/vite-plugin` 3.
- `@solidjs/testing-library` must be the `next` (1.x) line, not `latest`.
- `@solidjs/router` ships preserved JSX, so vitest inlines it
  (`server.deps.inline` in `vitest.config.ts`).
- Packages that render JSX publish preserved JSX under a `solid` export
  condition and peer-depend on `solid-js` + `@solidjs/web` ^2.
- Published exports have no `default`/`import` entry: the packages are consumed
  through Vite + @solidjs/vite-plugin (the `solid` condition) only. The exceptions
  are node-only config entries (`@mortar-kit/admin/vite`, the theme
  packages' `index.js`), which vite.config imports, so they have `default`.
- `"use server"` functions belong in the consuming app (the plugin's default
  server-function filter skips node_modules); packages export plain functions
  (e.g. the JSON-file adapter) that the app wraps.

## Docs ship with features

A pull request that adds or changes a feature or a public API updates the
docs in the same PR, so they are reviewed with the code: the guides in
`docs/content/` (edit the JSON, or use the docs admin and copy the result)
and, for API changes, `pnpm reference`. The llms.txt output
(`docs.mortar-kit.dev/llms.txt`, `/llms-full.txt`, the `.md` pages) is built
from that content and reference, so it follows on its own; when you add a
docs brick, give it a Markdown converter in `docs/src/llms/markdown.ts`.
Check the result with `pnpm docs` and `curl localhost:3100/llms-full.txt`.

## Code style

Single quotes, semicolons, 2-space indent, trailing commas. Styles are CSS
modules next to their component (`Foo.module.css`, camelCase class names,
`class={styles.foo}`); no global class names. Admin modules don't override
each other's classes (no cross-file `composes`, which also makes postcss warn);
the admin is themed by the `--mortar-*` custom properties (defaults on
`:where(:root)` in `tokens.css`; themes set them on `:root`; any ancestor
overrides both). Every colour, radius, font and gap in the admin's modules
comes from a token, so themes stay pure token sets. A short header
comment per file explaining its purpose; JSDoc on exported API. `import type`
for types. Never destructure props. Reference sources:
`node_modules/solid-js/CHEATSHEET.md`, `node_modules/solid-js/skills/`.

<!-- BEGIN solid-2.0-primer -->
<!-- Generated by scripts/sync-agent-files.mjs from agents/solid-2.0-primer.md. Edit the primer and re-run; edits inside this block are overwritten. -->

<!-- Source of truth: packages/solid/skills/solid-2.0/SKILL.md in solidjs/solid (branch next). Copied here, minus its frontmatter, so templates carry it without a network; keep the two in step. -->

# Solid 2.0 for agents

Solid is not React, and 2.0 is not 1.x. Pattern-matching from either is the
dominant bug source. Every name below is a `solid-js` export unless noted;
DOM APIs (`render`, `hydrate`, `Portal`, `dynamic`) are in `@solidjs/web`.

## Three rules

1. **Props are read, not destructured; pass values, not accessors.**
   - Wrong: `function C({ name }) {}` and `<C value={count} />`
   - Right: `function C(props) { return <p>{props.name}</p>; }` and `<C value={count()} />`
2. **`createEffect` takes two functions: compute (tracks), then apply (side effects).**
   - Wrong: `createEffect(() => { el.title = count(); });`
   - Right: `createEffect(() => count(), v => { el.title = v; });`
3. **Stores are written through the draft.**
   - Wrong: `setStore("user", "name", "B")` or `setStore(produce(s => ...))`
   - Right: `setStore(s => { s.user.name = "B"; });`

## 1.x → 2.0 corrections

Nothing in the left column exists in 2.0.

| Wrong (1.x)                                    | Right (2.0)                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `import { createStore } from "solid-js/store"` | `import { createStore } from "solid-js"`                          |
| `import { render } from "solid-js/web"`        | `import { render } from "@solidjs/web"`                           |
| `"jsxImportSource": "solid-js"`                | `"jsxImportSource": "@solidjs/web"`                               |
| `createEffect(fn)` (one argument)              | `createEffect(compute, apply)`                                    |
| `onMount(fn)`                                  | `onSettled(() => { setup(); return cleanup; })`                   |
| `createEffect(on(dep, fn))`                    | `createEffect(() => dep(), v => fn(v))`                           |
| `const [d] = createResource(id, fetchX)`       | `const d = createMemo(() => fetchX(id()))` under `<Loading>`      |
| `d.loading` / `d.error`                        | `<Loading>` or `isPending(() => d())` / `<Errored>`               |
| `refetch()`                                    | `refresh(d)` (`affects(d); refresh(d)` to read as pending)        |
| `<Suspense>` / `<SuspenseList>`                | `<Loading>` / `<Reveal>`                                          |
| `<ErrorBoundary>`                              | `<Errored fallback={(err, reset) => ...}>` (heals automatically)  |
| `<Index each={xs}>`                            | `<For each={xs} keyed={false}>`                                   |
| `batch(fn)`                                    | not needed: updates batch per microtask; `flush()` applies now    |
| `startTransition` / `useTransition`            | built-in transitions: `action(...)`, `isPending`, optimistic APIs |
| `createComputed`                               | `createMemo`, split `createEffect`, or `createSignal(fn)`         |
| `mergeProps` / `splitProps` / `unwrap`         | `merge` / `omit` / `snapshot`                                     |
| `produce`, `createMutable`, `modifyMutable`    | draft setters are the default in `createStore`                    |
| `createSelector`                               | `createProjection` (or `createStore(fn)`)                         |
| `<Ctx.Provider value={v}>`                     | `<Ctx value={v}>`                                                 |
| `classList={{ a: x() }}`                       | `class={{ a: x() }}` or `class={["base", { a: x() }]}`            |
| `use:dir={x}` / `attr:` / `on:` / `tabIndex`   | `ref={dir(x)}` / plain attributes / `onClick` / `tabindex`        |
| `onError` / `catchError`                       | `<Errored>` or `createEffect(c, { effect, error })`               |
| `from(source)` / `observable`                  | return an AsyncIterable from a computation                        |

Also:

- Reads lag writes: `setX(1); x()` still returns the old value until the
  microtask or `flush()`. In tests, `flush()` before asserting.
- No writes inside a memo, effect compute, or component body (dev throws).
  Write from event handlers, `onSettled`, or actions.
- No reactive reads at the top of a component body; read in JSX, a memo, an
  effect's compute, or hand a hook an accessor (`useThing(() => props.id)`;
  JSX props still take values). Flow callbacks (`<For>`, `<Show>`,
  `<Match>`) are owners, not tracking scopes: read their accessor arguments
  in JSX, not at the top.
- Never use `untrack` to silence `STRICT_READ_UNTRACKED`: the value still
  goes stale, and the warning was the only sign. Move the read instead (see
  that code's section in the diagnostics skill). Hooks and adapters take
  accessors and read them inside their own memos and effects.
- `<For>`: default gives a raw item and an index accessor; `keyed={false}`
  gives an item accessor and a plain number. `<Repeat>`: `i` is a number.
- `onClick={cond() ? a : b}` binds once; decide inside a stable handler.

## Primitives to reach for

| Primitive                                                          | Use                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `createSignal(0)` / `createSignal(() => fetchUser(id()))`          | plain signal / writable derived value, sync or async; read by calling it                |
| `createMemo(() => fetchX(id()))`                                   | read-only derived value; a Promise result is pending until it lands                     |
| `createProjection(async () => api.list(), [], { key: "id" })`      | read-only derived store with keyed reconciliation                                       |
| `createOptimisticStore(() => api.list(), [])`                      | store whose optimistic writes revert when the transition settles                        |
| `action(function* (x) { write(); yield api.put(x); refresh(d); })` | mutation with transition coordination; optimistic writes go inside                      |
| `until(() => confirmed(), { timeout })`                            | Promise that resolves when a predicate turns truthy; `yield` it in an action            |
| `isPending(() => d())`                                             | true while a change to `d` is in flight (input changed or `affects()` declared)         |
| `latest(d)`                                                        | peek at the in-flight value during a transition                                         |
| `refresh(d)`                                                       | re-ask the source after a server write; quiet unless preceded by `affects(d)`           |
| `<Loading on={id()}>` `<Errored>` `<Reveal>` `<Repeat>` `<For>`    | async boundary (`on` re-arms it), error boundary, sibling order, range list, keyed list |

## Pointers

- Full reference: `node_modules/solid-js/CHEATSHEET.md`; the same text is
  the `solid-2.0-cheatsheet` skill in `node_modules/solid-js/skills/`.
- Diagnostics: dev builds print `[CODE] message` plus an `in <App> › …`
  owner line. The first report of each code ends with a footer naming
  `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`, one section
  per code (`STRICT_READ_UNTRACKED`, `REACTIVE_WRITE_IN_OWNED_SCOPE`,
  `LOADING_ON_OUTSIDE_HOLD`, …). Fix the cause; never suppress a code.
- Evidence loops: `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md`
  (`captureArtifact`). With `@solidjs/vite-plugin`'s `diagnostics` option the
  dev server answers `POST /__solid/diagnostics` (`begin`, `active`, `whyDidRun`,
  `costs`, `end`).
- Lint: `eslint-plugin-solid`, config `v2`
  (`import solid from "eslint-plugin-solid/configs/v2"`) or `v2-strict`.
- Docs: https://v2.solidjs.com (Solid 2.0 docs; `/llms.txt` and
  `/llms-full.txt` for agents). Migration guide: `documentation/solid-2.0/MIGRATION.md`
  in the repository.

<!-- END solid-2.0-primer -->
