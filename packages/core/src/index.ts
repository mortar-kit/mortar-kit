// Public API of @mortar-kit/core.
export {
  brickMap,
  defineBrick,
  type AnyBrick,
  type Brick,
  type BrickDefinition,
  type BrickProps,
  type Issue,
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
export type { Page, PageEntry } from './page.ts';
export { PageView, type PageViewProps } from './PageView.tsx';
