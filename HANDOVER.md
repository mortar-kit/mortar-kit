# Handover: Mortar after steps 1–8

You are picking up **Mortar**, a small website framework on **Solid 2**, at
`/Users/tom/Projects/Github/bried/mortar`. Read `AGENTS.md` first (it is also
`CLAUDE.md`): decisions, conventions, tooling and a Solid 2 primer. Check
Solid APIs against the installed sources, not memory.

## Done (one commit each)

Steps 4–6 describe the page model (`Page`, `definePageMeta`, `PageStore`,
`loadPage`/`savePage`, "Page settings"); step 8 replaced it with collections.

1. `51c0b38` Workspace and `@mortar-kit/core` (fields, `defineBrick`, `PageView`).
2. `4d8353e` Admin editor: schema-driven forms, live iframe preview.
   `e67af2d` Review fixes: a signal setter as `onChange` halted reactivity
   (the effect returned its result as a cleanup); number inputs now commit
   `0.50`/`1e3`; preview handshake works whichever side loads first
   (`mortar:hello` → `mortar:ready`).
3. `81a41c9` Entry management: add (menu, after the selection), move,
   duplicate, remove (confirmed). Unknown bricks: warning in the editor,
   placeholder in the preview (`PageView` `fallback`), nothing on the site.
4. `2107bdb` Pages are `{ entries, meta? }` (user's decision, 2026-11-21).
   `3e466e6` Persistence: `PageStore`, `createMemoryStore`, `loadPage`
   (normalizes), `savePage` (validates, returns issues by entry id + path),
   `@mortar-kit/core/server` `createJsonFileStore` (atomic writes, slug
   checks). Editor `onSave` + save bar (dirty state, Ctrl/Cmd+S, saving
   state via `createOptimistic` in an `action`, issue links, beforeunload).
   The example site loads `content/pages/home.json` during SSR through a
   router `query` over a `'use server'` function and saves through another
   that returns `respond(result, { revalidate: '' })`, so a save never
   refetches and re-seeds the editor.
5. Leave guard: Editor `onDirtyChange` (false again if the save controls
   unmount); the admin route blocks router navigation while dirty with
   `useBeforeLeave`, and waits for an in-flight save before leaving. The
   app's `saveEditedPage` (`src/pages.ts`) drops the cached page after a
   save (`query.delete`, not `revalidate`, which would re-seed the editor),
   so back/forward never shows or edits the pre-save page.
   Styles: example bricks and the admin UI use CSS modules. Theme the editor
   by setting `--mortar-*` custom properties on any ancestor (defaults are on
   `:where(:root)`, so they never win).

6. Loose ends:
   - Page metadata: `definePageMeta(fields)` in core (shares `schemaOps`
     with `defineBrick`; keys outside the schema are kept), optional
     `meta` for `normalizePage`/`validatePage` (issues at
     `['meta', ...]`) and `{ meta }` for `loadPage`/`savePage`. The editor
     takes `meta` and shows a "Page settings" form (`PAGE_META` target in
     the store; save problems link to it). The example declares a title
     and description (`src/page-meta.ts`) and the home route renders them
     with `@solidjs/meta` 2 (no provider; `Document.tsx`'s `<title>` is the
     fallback). The example now renders with `renderMode: 'async'`, so the
     page and its head tags are in the HTML, not streamed patches.
   - Normalize/validate deep-copy kept data (unknown-brick data, metadata)
     as plain JSON (`toJson` in `page.ts`): Solid 2's `snapshot` returns
     plain objects as they are, and `structuredClone` throws on promises
     and functions a crafted server-function call can carry. Validate
     reports such values as issues; normalize drops them.
   - The leave guard shows one confirm for a burst of navigations.
   - Server-side save rejection is covered end to end in the admin tests
     (Editor → `savePage` on a stricter server schema → issues, unsaved,
     nothing stored).
   - Public bundle: investigated, nothing to trim. `decode-*.js` is lazy and
     never loads on the public page; the server-function client is imported
     by `@solidjs/router` itself (`query`), so a lazy import in the app only
     reshuffled chunks (60.1 → 62.7 kB gzip) and was dropped. The other
     Mortar-attributable cost is valibot (~13 kB raw) via brick schemas.

7. Public pages without JavaScript (user's request, 2026-11-22; islands
   wanted later). The example's entries are authored instead of generated:
   `src/Root.tsx` is the tree both entries render (error boundaries outside
   and inside the Document, production only, as the generated entries do),
   `src/client.ts` `hydrates(pathname)` picks whole-document hydration
   (`/admin*`, case-insensitive like the router). Other pages render under
   `<NoHydration>` (no `_hk`, no lazy chunk preloads) with `noScripts` (no
   hydration data), `stylesOnly(manifest)` (CSS links, no entry-import
   `modulepreload`s; `src/styles-only.ts`), no bootstrap or client script,
   and are always sent settled (a plain promise), since streamed content
   needs a script. The client script tag carries the request's CSP nonce.
   Result: home is ~1.3 kB of HTML plus two stylesheets, zero scripts.
   Islands came later (2026-11-23, see "Islands" below).

8. Collections (user's request, 2026-11-22: reusable content such as
   posts with a list and a page each, products in categories). Designed
   by a three-way design panel plus judge; built in steps:
   `a96ee47` `fields.date` (YYYY-MM-DD) and `fields.reference({ collection })`
   (stores the target's id), `referencesIn`/`referencedCollections`.
   `34a1ac0` entry checks moved to `entries.ts`.
   `e2189f4` `defineCollection` and documents (`Doc = { id, slug, fields, entries? }`,
   `normalizeDoc`/`validateDoc`).
   `61d28fb` storage switch-over: `ContentStore` (memory, JSON files at
   `<dir>/<collection>/<slug>.json`), `createContent` (rules, see AGENTS.md),
   `PageView` takes `entries`, the page model removed, the editor edits one
   document (title, slug with rename note, Details form, body).
   `b32381d` brick `load` + `ContentContext`/`useContent`, deferred per-brick
   loading in `PageView`. `a9d0f40` preview in the app's layouts, refresh
   after saves. `d199b76` `<Admin>` (collections, documents, create,
   rename, delete refused while referenced, location in the app's URL or
   its own). `e9ec5e8` reference picker. `0568ef8` undefined list options
   dropped (server-function arguments are plain JSON). `adcc730` example:
   pages/posts/products/categories, layouts, routes, two loading bricks.
   Review fixes (one more commit): writes serialized per `createContent`
   (concurrent saves/deletes could break slug uniqueness or delete a
   document being referenced), leftover rename copies removed on the next
   save/delete, no second confirm after deleting, drafts promoted only when
   the location reaches them, the reference picker no longer blocks the
   form while loading, `ContentSource.track` so preview refreshes reach
   loaders that `await` first, the preview ignores entries of a collection
   without a body, the route guard re-checks dirty after a save.

Verified in a browser on the production build: live preview, entry
operations with keyed DOM reuse in the preview, save to disk, typing during
an in-flight save (kept, stays dirty), local validation messages, leave
guard (links, back/forward, leaving during a save, a failed save, one
confirm for a burst), no-JS pages (0 scripts, only CSS requests; also in
dev and, temporarily, with `renderMode: 'stream'`), a page error giving a
500 that keeps head and styles. Collections: every public route
(`/`, `/about`, `/posts`, `/posts/<slug>`, `/products/<slug>`,
`/categories/<slug>`) with 0 scripts and its title, 404 for a missing
document; admin deep links (`?collection=&id=`), the picker (in Details
and in a brick form), product and post previews in their layouts, the
guard on switching documents, a blocked delete with referrer links,
create → save → listed and on the site and in "latest posts", delete,
loading bricks in the preview (and reloading on a picker change).
201 tests; typecheck, lint, build clean.

9. Admin layout and themes (user's request, 2026-11-22, after picking
   "layout B" from mockups). `<Admin>`: collections rail (initials drawn by
   CSS, the button's name is the label; the open collection's button shows
   its list again without leaving the document), a panel showing the
   document list or the open document's outline (the editor portals its
   outline into the admin's panel slot; "All <collection>" goes back to the
   list), and the editor: top bar (breadcrumb with the title as the h1,
   Delete, save status, Save; save problems in a popover under it), preview,
   inspector. A standalone `<Editor>` shows the outline in its own panel.
   Entry actions are icon buttons revealed on hover/focus/selection.
   Every value is a `--mortar-*` token (`tokens.css`); themes:
   `@mortar-kit/theme-midnight|warm|soft|mono`, via `mortarKit({ theme })`
   from `@mortar-kit/admin/vite`. The example picks one with
   `MORTAR_THEME=<name>`. Fonts named by themes are not loaded by Mortar
   (system fallbacks unless the app loads them).

10. Docs site (user's request, 2026-11-22): `docs/`, written in Mortar,
   with guides as content, a generated API reference, and a session storage
   store so anyone can edit the site in their own tab, with a reset back to
   the published content (see AGENTS.md). Verified in a browser on the
   production build: every route, edit → save → the edit on public pages
   (client navigation and reload) → reset. Not done yet: syntax
   highlighting, a collapsible sidebar on phones, search, deployment (it needs
   a Node server, or a prerender step, since nothing is server-side but the
   render). The admin logs hydration key misses when opened on a document
   deep link (`?collection=&id=`); the example site does too, so it's in
   `@mortar-kit/admin` (the outline portal), not the docs.
11. Assets (user's request, 2026-11-22: "blob storage is related but unique
   from data storage"). `BlobStore` (`list/get/put/remove/url`) beside
   `ContentStore`; `createContent({ blobs, maxAssetSize })` adds
   `content.assets` (`list/upload/remove`). No asset records: the key
   (`hero-photo-x7k2q9.jpg`) carries name and type. `fields.image` is
   `{ src, alt, asset }`, new `fields.file({ accept })` is `{ src, asset }`;
   createContent stores `src: ''` for uploads and fills it from
   `blobs.url(asset)` on read. Adapters: `createMemoryBlobStore` (core),
   `createFileBlobStore` (core/server), docs' session storage store; `serveBlob`
   serves one file (nosniff, ranges). Admin: rail "Assets" view
   (`location.view: 'assets'`), `<AssetPicker>` for image/file fields. The
   example serves `/uploads/` in `src/middleware.ts` and raises the
   server-function body limit in `src/server-functions-setup.ts`. Not done:
   an S3 adapter (`@mortar-kit/blob-s3` proposed), image sizes/thumbnails,
   alt text stored per asset, a picker in a standalone `<Editor>` (it reads
   `assets` from `<Admin>`'s context only).

## Open / not built, and future plans

How the user works: they pick the next feature; small loose ends get done
first, then the larger items are revisited one at a time (their words,
2026-11-22: "Let's get all the small loose ends. Once those are done we can
revisit the others"). Commit each step; don't push unless asked.

### Decisions taken as defaults, not yet confirmed by the user

The collections design left three choices open. I picked these and said
so; ask before building on them if it matters:
- Deleting a referenced document is **blocked** (with links to the
  referrers), not just warned about. Saving a dangling reference is allowed;
  the picker flags it.
- The example keeps the admin's location in the **URL**
  (`?collection=&id=`); `<Admin>` also works without it.
- **No title→slug helper** on the New form yet.

### Islands (built 2026-11-23)

`defineBrick({ interactive: true })`; see CLAUDE.md "Islands". Follow-ups:
- Island pages load only their bricks (`lazyBricks`). Most of what an
  island page downloads is Solid's web runtime and the server-function
  client (~140 kB raw, ~50 kB gzip), shared with the admin.
- Async inside an island's component has no hydration data (static pages
  keep `noScripts`); only `load` results are carried. Lifting that means
  serializing just the zones' data.
- Once settled, consider a Mortar helper for the example's
  `entry-client.tsx` + `islands.ts` pattern, so sites don't copy it.

### Collections, later

- A title→slug helper (`slugify`) on the New form (see above).
- Pagination (`offset`) and an index or smarter adapter for large
  collections: listing reads the whole folder, and `get({ id })` lists it
  too.
- Store-level locking (or compare-and-set puts) for several server
  processes sharing one store; writes are only serialized per
  `createContent` instance.
- After a crash mid-rename, `get({ slug })` can serve the hidden stale copy
  until the next save/delete of that document cleans it up.
- A nicer picker for lists of references (`fields.list` of references
  works, edited one select per item).
- A 404/not-found helper in Mortar (the example has its own
  `layouts/NotFound.tsx`, which sets the status).
- Loaded bricks in the preview show saved content, not unsaved edits to
  other documents (by design; documented on `load`).
- Deliberately cut from the design (don't add back without a reason): a
  singular label, `force` delete, a summaries/problems channel, per-document
  drafts for many open documents, a filter box in the document list,
  rejecting saves with dangling references.

### Other open items

- Click-to-select in the preview (optional in the original brief; skipped).
- Schema `version`/`migrate` for stored data, a `hidden` brick flag, rich
  text, media (uploads; images are URLs today), publishing (changesets,
  publint, attw).
- Auth follow-ups: the editor shows a failed save as unsaved but doesn't
  yet say "signed out, sign in again" on a 401; an admin-managed user list
  (stored in a ContentStore) could back `authorize` later; no roles.
- The example renders with `renderMode: 'async'` (one settled document).
  Switch to `'stream'` only if pages load slow data; no-JS pages are
  always sent settled anyway.

## Gotchas

- Run everything as `nix develop -c <cmd>` from the repo root; nix only sees
  git-tracked files, so `git add` new files first. System `python3` is the
  unlicensed Xcode shim: use perl/node or the Edit tool.
- `*.test.ts` runs on Solid's server build (computes once). Reactive tests
  must be client `*.test.tsx`; `flush()` before asserting.
- An effect's apply function must not return a value unless it is a cleanup.
- Solid 2: writes made while an async refresh is in flight (e.g. right
  after `refresh(list)`) wait for it to settle. Report state the app reads
  (dirty) before refreshing, or refresh later (`setTimeout`).
- `createContext(undefined)` means "no default" in Solid 2 (reading it
  without a provider throws); use `null`.
- Server-function arguments must be plain JSON: no `undefined` values.
- Example site: `cd examples/site && nix develop ../.. -c vite build`, then
  `vite preview --port <free port>` (cwd matters: the JSON store resolves
  `content/` against it). Kill servers afterwards:
  `pkill -f "vite.js preview --port <port>"`. Saving from the admin rewrites
  files under `content/`; restore them with git after manual tests.
