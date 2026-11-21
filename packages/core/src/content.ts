// Reading content from components: the app provides a `ContentSource`
// (usually its server functions) through `ContentContext`; bricks with a
// `load` function and the app's own layouts read it as a typed
// `ContentReader`, which takes collection objects instead of names.
import { createContext, useContext } from 'solid-js';

import type { Collection } from './collection.ts';
import type { Doc, DocRef, DocSummary } from './doc.ts';
import type { Fields, InferFields } from './fields.ts';
import type { ContentSource, ListOptions } from './store.ts';

/** Typed reads: pass a collection, get its documents with typed fields. */
export interface ContentReader {
  /** Documents of the collection, without their bodies. */
  list<F extends Fields>(collection: Collection<F>, options?: ListOptions): Promise<DocSummary<InferFields<F>>[]>;
  /** One document of the collection, or null. */
  get<F extends Fields>(collection: Collection<F>, ref: DocRef): Promise<Doc<InferFields<F>> | null>;
}

/**
 * Where bricks and layouts read content from. Provide it around the app,
 * e.g. `<ContentContext value={source}>`. The admin preview provides its own.
 */
export const ContentContext = createContext<ContentSource | null>(null);

/** A typed reader over a source. No caching of its own: the source decides. */
export function contentReader(source: ContentSource): ContentReader {
  return {
    list: (collection, options) => source.list(collection.name, options) as never,
    get: (collection, ref) => source.get(collection.name, ref) as never,
  };
}

/**
 * The content reader for the current component, from `ContentContext`.
 * Call it in a component body; read with it in a memo (under `<Loading>`).
 * Throws if no source is provided.
 */
export function useContent(): ContentReader {
  const source = useContext(ContentContext);
  if (!source) throw new Error('Mortar: no ContentContext; provide one around the app (<ContentContext value={source}>)');
  return contentReader(source);
}
