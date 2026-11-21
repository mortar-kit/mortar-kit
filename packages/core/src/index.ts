// Public API of @mortar-kit/core.
export {
  brickMap,
  defineBrick,
  type AnyBrick,
  type Brick,
  type BrickDefinition,
  type BrickProps,
  type Issue,
  type SchemaOps,
  type ValidateResult,
} from './brick.ts';
export {
  defaultOf,
  defaultsOf,
  fieldInfo,
  fields,
  referencedCollections,
  referencesIn,
  type AnyField,
  type Field,
  type FieldInfo,
  type FieldKind,
  type Fields,
  type FoundReference,
  type Image,
  type InferFields,
} from './fields.ts';
export {
  collectionMap,
  defineCollection,
  type AnyCollection,
  type Collection,
  type CollectionDefinition,
  type DocOf,
  type SortOrder,
} from './collection.ts';
export {
  isValidDocId,
  isValidSlug,
  normalizeDoc,
  validateDoc,
  type Doc,
  type DocIssue,
  type DocRef,
  type DocSummary,
  type ValidateDocResult,
} from './doc.ts';
export { ContentContext, contentReader, useContent, type ContentReader } from './content.ts';
export { normalizeEntries, validateEntries, type EntryIssue, type PageEntry } from './entries.ts';
export { PageView, type PageViewProps } from './PageView.tsx';
export {
  createContent,
  createMemoryStore,
  type Content,
  type ContentOptions,
  type ContentSource,
  type ContentStore,
  type ListOptions,
  type Referrer,
  type RemoveResult,
  type SaveResult,
} from './store.ts';
