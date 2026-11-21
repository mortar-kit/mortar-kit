# Handover: Mortar after steps 1–4

You are picking up **Mortar**, a small website framework on **Solid 2**, at
`/Users/tom/Projects/Github/bried/mortar`. Read `AGENTS.md` first (it is also
`CLAUDE.md`): decisions, conventions, tooling and a Solid 2 primer. Check
Solid APIs against the installed sources, not memory.

## Done (one commit each)

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

Verified in a browser on the production build: live preview, entry
operations with keyed DOM reuse in the preview, save to disk, public SSR
of the saved page, typing during an in-flight save (kept, stays dirty),
local validation messages, leave guard (links, back/forward, leaving
during a save, a failed save). 85 tests; typecheck, lint, build clean.

## Open / not built

- Click-to-select in the preview (optional in the brief; skipped).
- Two quick navigations while dirty show two confirms (the router's
  documented `useBeforeLeave` pattern); harmless, but could be debounced.
- `meta` has no editing UI, and `Document.tsx`'s title ignores it.
- The server-side rejection path of a save is unit-tested only (the editor
  validates first, so it is hard to reach from the UI).
- The public page now also loads the router query + server-function client
  (~20 kB gzip across `pages-*.js` and `decode-*.js`). Revisit if it matters.
- Earlier "later" items still apply: schema `version`/`migrate`, a `hidden`
  brick flag, rich text, media, multi-page/slug UI, auth, publishing
  (changesets, publint, attw).

## Gotchas

- Run everything as `nix develop -c <cmd>` from the repo root; nix only sees
  git-tracked files, so `git add` new files first. System `python3` is the
  unlicensed Xcode shim: use perl/node or the Edit tool.
- `*.test.ts` runs on Solid's server build (computes once). Reactive tests
  must be client `*.test.tsx`; `flush()` before asserting.
- An effect's apply function must not return a value unless it is a cleanup.
- Example site: `cd examples/site && nix develop ../.. -c vite build`, then
  `vite preview --port <free port>` (cwd matters: the JSON store resolves
  `content/pages` against it). Kill servers afterwards:
  `pkill -f "vite.js preview --port <port>"`. Saving from the admin rewrites
  `content/pages/home.json`; restore it with git after manual tests.
