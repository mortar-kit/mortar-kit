# Handover: Mortar steps 3 and 4

You are picking up **Mortar**, a small website framework on **Solid 2**, at
`/Users/tom/Projects/Github/bried/mortar`. Read `AGENTS.md` first (it is also
`CLAUDE.md`): it records the design decisions, conventions, tooling and a Solid 2
primer. Do not assume Solid 1.x patterns; check APIs against the installed
sources (`node_modules/solid-js/CHEATSHEET.md`, `node_modules/solid-js/skills/`,
`.d.ts` files, `node_modules/@solidjs/vite-plugin/README.md`,
`node_modules/@solidjs/router/README.md`).

## Goal

1. Review step 2 (the "Add admin editor" commit, see "Current state") and fix anything real.
2. **Step 3**: add / remove / reorder / duplicate whole brick entries in the editor.
3. **Step 4**: persistence through a storage adapter, with JSON files as the default.

Build incrementally. Keep typecheck, lint and tests green at every step, check
each step in a real browser, and commit each step separately (end commit
messages with the attribution line your harness gives you). Keep it small:
this is a lightweight framework, not a CMS.

## The concept (from the user's brief)

- A developer defines **bricks**: `defineBrick({ name, label?, schema, component })`,
  where `schema` is a record of `fields.*`. Mortar ships no bricks except examples.
- A **page** is an ordered array of `{ brick, id, data }` entries (`Page = PageEntry[]`).
- Mortar renders pages (`<PageView>`) and generates a **live-preview admin panel**:
  a form generated from each brick's schema, add/remove/reorder, and a preview
  that renders the real brick components.
- Loading and saving go through a **small adapter interface** so storage can be swapped.
- Naming: use "brick" for the developer-defined sections. Everything else gets
  plain, conventional names. Do not extend the construction metaphor.

## Decisions already made by the user (do not re-ask)

- **Schema**: `fields.*` helpers build **Valibot** schemas. UI hints are stored in
  `v.metadata({ mortar: FieldInfo })`, and Valibot does the validation.
- **Default storage**: **JSON files**, read on the server for SSR and saved
  through a server function.
- **Packages**: `@mortar-kit/core` and `@mortar-kit/admin`. The npm scope
  `@mortar-kit` is reserved and nothing is published yet.
- **Admin mount**: a route in the consuming app (`/admin`) rendering `<Editor>`.
  The preview is a **same-origin iframe** loading an app route (`/admin/preview`)
  that renders `<PreviewPage>`.

## Current state

- **Commit `51c0b38` (step 1)**: the workspace and `@mortar-kit/core`.
  - `fields.ts`: text, textarea, number, boolean, select, url (http(s) or
    relative only), image `{src, alt}`, list, object. Also `fieldInfo`,
    `defaultOf` and `defaultsOf`.
  - `brick.ts`: `defineBrick`, with `defaults()`, `validate()` (issues are
    `{path, message}`) and `normalize()` (shape-only coercion: values that are
    the right type but break a rule are kept), plus `brickMap`.
  - `PageView.tsx`: renders entries with `For keyed by id`, normalizes each
    entry's data through `createProjection`, and looks up the component with
    `dynamicComponent`.
- **Step 2 is committed ("Add admin editor…")** (verified working; 43 tests pass;
  typecheck and lint are clean):
  - `packages/admin`:
    - `state.ts`: `createEditorStore(bricks, page)` is a writable derived store
      (`createStore(fn, seed)`). It re-seeds when its sources change. Writes are
      addressed by entry id plus a path, and lists support insert/remove/move.
    - `fields/FieldInput.tsx`: one input per field kind. Number inputs use a
      draft value.
    - `BrickForm.tsx`, `Editor.tsx`, `PreviewFrame.tsx`.
    - `preview.tsx`, exported as `@mortar-kit/admin/preview`.
    - `protocol.ts`: the preview sends `mortar:ready`; the editor answers with
      `mortar:page` containing the full page after every change. Messages are
      checked for origin and source window.
  - `examples/site`:
    - `@solidjs/router` 2 with `/`, plus lazy `/admin` and `/admin/preview`
      routes. The build confirms admin JS and CSS stay out of the public bundle.
    - Bricks `hero` and `feature-grid`.
    - The page is still hard-coded in `src/content/home.ts`.
  - A Chrome check of the production build passed: live typing reached the
    preview, list add/move/remove worked, validation messages showed, and the
    console stayed clean.
  - An independent review of step 2 was started but **interrupted before it
    produced findings**. Review step 2 yourself, at least against the "Open leads"
    below, and commit any fixes separately.

## Step 3: entry management in the editor

- Add `addEntry(brickName, index?)`, `removeEntry(id)`, `moveEntry(id, toIndex)`
  and `duplicateEntry(id)` to the editor store.
  - New ids are created when an entry is added, never during render, for
    example `` `${brick}-${crypto.randomUUID()}` ``.
  - New data comes from `brick.defaults()`.
  - A duplicate gets a new id and a `structuredClone`d copy of the data.
- Update the selection sensibly: select the entry that was just added; after a
  removal, select a neighbour or `null`.
- UI:
  - An "Add brick" menu listing the bricks by label, inserted after the
    selected entry or at the end.
  - Per-entry move up/down, duplicate and remove (confirm before removing).
  - Use accessible names on the buttons. The existing tests query by
    role and name.
  - Native elements only. No Solid 1-era UI libraries.
- Unknown bricks (an entry whose brick name isn't registered):
  - In the editor: list the entry with a visible warning, allow removing it, and
    never crash.
  - In the preview: show a visible placeholder.
  - On the public site: keep rendering nothing.
  - One way to do this is an optional `fallback` prop on `PageView`.
- Optional, if small: click-to-select in the preview. Wrap each brick in the
  preview with a `data-brick-id`, have the preview post `mortar:select`, and let
  the editor highlight the selected brick. Keep any wrapper out of the public
  `PageView` output, or make it opt-in.
- Tests: store operations (in client `*.test.tsx`), editor UI flows, and keyed
  DOM reuse in the preview after a reorder.

## Step 4: persistence

- In core, add an adapter interface that is plain TypeScript with no JSX, for example:
  ```ts
  interface PageStore {
    load(slug: string): Promise<Page | undefined>;
    save(slug: string, page: Page): Promise<void>;
    list?(): Promise<string[]>;
  }
  ```
  Use plain, conventional names.
- Add a **JSON-file adapter**, e.g. `createJsonFileStore({ dir })`.
  - It runs on the server only. Put it in a server-only entry or subpath, e.g.
    `@mortar-kit/core/server`, so `node:fs` never reaches client bundles.
  - Writes are atomic: write to a temp file, then rename.
  - Validate slugs (no path traversal).
  - Pretty-print the JSON so diffs stay readable.
  - Add an in-memory adapter for tests.
- On save, validate every entry with `brick.validate` and reject or return
  issues by entry id and path. On load, normalize.
- Server functions:
  - `"use server"` functions must live in the **app**, not the packages,
    because the vite plugin's default server-function filter skips
    `node_modules`.
  - The app wraps the adapter in its own load and save server functions, and
    passes save to `<Editor>` (e.g. an `onSave` prop or a Save button that
    calls it).
  - Enable `serverFunctions` in `examples/site/vite.config.ts`.
  - Read the vite-plugin README sections on `serverFunctions` and `start`, and
    the router README's "Data APIs", before choosing the pattern. Use `query`
    and `action`, or Solid 2's `action` / `createOptimistic` for a "saving…"
    state, not 1.x patterns.
- Site pages load through the adapter during SSR (with async data under
  `<Loading>`) instead of importing `content/home.ts`. Move the example content
  to `examples/site/content/pages/home.json`.
- Editor UX:
  - Mark the page dirty after edits.
  - Save explicitly with a Save button; autosave is optional.
  - Show a saving state and any errors.
  - Warn before leaving with unsaved changes.
- No auth: the admin route is unprotected. Document that guarding `/admin` is
  the app's job, e.g. through `start.middleware`.
- Tests: adapter unit tests in node `*.test.ts` (pure I/O against a temp dir),
  plus an SSR test that a stored page renders.

## Gotchas learned so far

- Node and pnpm exist only inside the nix flake. Run everything as
  `nix develop -c <cmd>` from the repo root. Nix flakes only see git-tracked
  files, so `git add` new files before relying on them.
- `*.test.ts` files run in the **node** project on Solid's **server build**,
  where memos, effects and derived stores compute once and never update. Any
  reactive test must be a client `*.test.tsx`.
- Reads lag writes until the next microtask, so call `flush()` before asserting.
  Never write signals or stores from component bodies, memos or effect compute
  functions.
- Seeding local state from props: use `createSignal(() => props.x)` or
  `createStore(fn, seed)`. Do not read props at the top of a component body
  (`STRICT_READ_UNTRACKED`), and never silence it with `untrack`.
- `vitest-setup.ts` registers jest-dom and testing-library `cleanup` itself,
  because vitest globals are off.
- `JSX` types come from `@solidjs/web`, not `solid-js`. `<Dynamic>` is
  deprecated; use `dynamicComponent` or `dynamic`.
- The package builds use `tsconfig.build.json` with `types: []`. `pnpm typecheck`
  also runs those configs, and `packages/admin/src/css.d.ts` declares CSS
  imports. Published exports have only `types` and `solid` conditions, with no
  `default` entry.
- Playwright: use `@playwright/test` from `../sites/node_modules`, with
  `chromium.launch({ channel: 'chrome' })` because Playwright's own browsers
  aren't downloaded. Put scripts outside the repo.
- **Always kill the servers you start.** Match on `vite.js`, e.g.
  `pkill -f "vite.js preview --port <port>"`. A leftover server on 4317 once
  served a stale build and wasted time. Check with
  `lsof -nP -iTCP -sTCP:LISTEN | grep node`.
- Example site: `cd examples/site && nix develop ../.. -c vite build`, then
  `vite preview --port <free port>`.

## Open leads to check (unverified)

- **Ready-handshake race**: the iframe is in the SSR HTML, so it starts loading
  before the parent hydrates. If the preview posts `mortar:ready` before the
  parent's listener is attached, the preview may stay empty. Consider having the
  editor also ping the frame when it attaches (`mortar:hello`, which the preview
  answers with ready), or mounting the iframe only on the client. Test with a
  throttled parent.
- `Editor` uses `<Show when={selected()} keyed>`. Confirm that editing a field
  does not remount the form, which would lose focus. The entry proxy should
  keep its identity. Also check what happens on a re-seed.
- The interrupted review was probing "`onChange` given a signal setter":
  passing a signal setter as `onChange` makes it run inside the effect's apply
  phase. Check for dev diagnostics.
- Number input only commits when `String(Number(text)) === text`, so `1e3`,
  `0.50` and `-0` are never committed. Decide whether that is acceptable.
- `reconcile(page, 'id')` in `PreviewPage` with nested arrays whose items have
  no ids. Identity was fine in the tests, but re-check it after step 3 reorders.

## Later / out of scope for now (context, do not build unless asked)

- **Page-level metadata** (title, SEO): `Page` is a bare array, as the brief
  specified. Raise with the user whether to wrap it in `{ entries, meta }`
  before step 4 fixes the file format.
- Schema evolution: an optional per-brick `version` and `migrate(data, from)`.
  Today, normalize-on-load covers additive changes.
- A `hidden` flag so retired bricks don't appear in the add menu.
- Rich text field, media uploads, multiple pages/slug management UI, auth.
- Publishing:
  - changesets, publint and @arethetypeswrong/cli.
  - A compiled `import` build is not provided; consumers must use Vite with
    `@solidjs/vite-plugin`.
  - Admin CSS is copied by the build script.
- Optional Standard JSON Schema export of brick schemas.
- Bundle size: the public page ships about 50 kB gzip, mostly the Solid runtime
  and the Valibot functions it uses. Revisit if it matters.
