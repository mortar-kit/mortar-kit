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
  type AnyField,
  type Field,
  type FieldInfo,
  type FieldKind,
  type Fields,
  type Image,
  type InferFields,
} from './fields.ts';
export { definePageMeta, type PageMeta } from './meta.ts';
export {
  normalizePage,
  validatePage,
  type Page,
  type PageEntry,
  type PageIssue,
  type ValidatePageResult,
} from './page.ts';
export { PageView, type PageViewProps } from './PageView.tsx';
export {
  createMemoryStore,
  isValidSlug,
  loadPage,
  savePage,
  type PageOptions,
  type PageStore,
  type SaveResult,
} from './store.ts';
