// The generated API reference (api.json, written by scripts/reference.mjs
// from the packages' TypeScript sources and comments). It is loaded on
// demand, so only pages that show reference entries download it.

/** A parameter of a function. */
export interface ApiParam {
  name: string;
  type: string;
  optional: boolean;
  doc: string;
}

/** A property or method of an interface, class or object. */
export interface ApiMember {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
  doc: string;
}

/** One export of a Mortar package. Comments are Markdown. */
export interface ApiEntry {
  name: string;
  /** The import path, e.g. `@mortar-kit/core`. */
  module: string;
  kind: 'function' | 'interface' | 'class' | 'type' | 'variable';
  deprecated: boolean;
  summary: string;
  /** The declaration as TypeScript, one line per overload. */
  signature: string;
  params?: ApiParam[];
  returns?: string;
  members?: ApiMember[];
  examples?: string[];
}

/** An entry in the reference index: enough for a list. */
export type ApiSummary = Pick<ApiEntry, 'name' | 'module' | 'kind' | 'summary'>;

/** The generated reference: the documented modules, in order, and every export. */
export interface ApiFile {
  modules: string[];
  entries: ApiEntry[];
}

// Not cached: a promise kept from a compute that runs during hydration would never settle.
const load = (): Promise<ApiFile> => import('./api.json').then((m) => m.default as ApiFile);

/** The reference page of an export. */
export function referenceHref(name: string): string {
  return `/reference/${encodeURIComponent(name)}`;
}

/** One export by name (or null), with every export's name, so its types can link to theirs. */
export async function findEntry(name: string): Promise<{ entry: ApiEntry | null; names: string[] }> {
  const api = await load();
  return { entry: api.entries.find((e) => e.name === name) ?? null, names: api.entries.map((e) => e.name) };
}

/** Every export, grouped by module in the order the packages are documented. */
export async function listEntries(): Promise<{ module: string; entries: ApiSummary[] }[]> {
  const api = await load();
  return api.modules.map((module) => ({
    module,
    entries: api.entries.filter((e) => e.module === module).map((e) => ({ name: e.name, module: e.module, kind: e.kind, summary: firstSentence(e.summary) })),
  }));
}

/** The first sentence (or line) of a comment, for lists. */
export function firstSentence(text: string): string {
  const line = text.split('\n\n')[0]!.replace(/\s+/g, ' ');
  // A full stop ends the sentence, except in "e.g." and "i.e.".
  const end = line.search(/(?<!\b(?:e\.g|i\.e))\.(\s|$)/);
  return end === -1 ? line : line.slice(0, end + 1);
}
