// defineBrick: pairs a developer's component with the schema describing its
// editable data. The schema drives validation, defaults, and (in the admin
// package) the generated edit form.
import type { Component } from 'solid-js';
import * as v from 'valibot';

import type { ContentReader } from './content.ts';
import { defaultsOf, type Fields, type InferFields } from './fields.ts';

/** Props every brick component receives. */
export interface BrickProps<D, L = undefined> {
  /** The brick's data: the right shape, with defaults filled in (see `Brick.normalize`). */
  data: D;
  /** What the brick's `load` returned; undefined for a brick without one. */
  loaded: L;
}

/** What a developer passes to `defineBrick`. */
export interface BrickDefinition<F extends Fields, L = undefined> {
  /** Stable identifier stored in entries. Lowercase, e.g. `hero` or `feature-grid`. */
  name: string;
  /** Human-readable name for the admin panel. Defaults to `name`. */
  label?: string;
  /** The editable fields, built with `fields.*`. */
  schema: F;
  /**
   * Loads what the brick shows besides its own data, e.g. the latest posts.
   * Runs on the server when the page renders (pages without JavaScript
   * included) and in the browser in the admin preview, where it reads
   * saved content (not unsaved edits to other documents), again after each
   * save. Read the `data` fields it depends on before the first `await`:
   * changing those loads again, changing others doesn't. Return plain JSON. Write it before
   * `component`, so `props.loaded` gets its type.
   */
  load?: (data: InferFields<F>, content: ContentReader) => L | Promise<L>;
  /** Renders the brick. Read `props.data.x` (and `props.loaded`); don't destructure props. */
  component: Component<BrickProps<InferFields<F>, L>>;
}

/** A validation problem, located by its path inside the brick's data. */
export interface Issue {
  path: (string | number)[];
  message: string;
}

/** Result of `brick.validate(data)`. */
export type ValidateResult<D> = { success: true; data: D } | { success: false; issues: Issue[] };

/** A registered brick. `defaults()` is used when the brick is added to a body. */
export interface Brick<F extends Fields = Fields, L = undefined> extends SchemaOps<F> {
  readonly name: string;
  readonly label: string;
  readonly schema: F;
  readonly load: ((data: InferFields<F>, content: ContentReader) => L | Promise<L>) | undefined;
  readonly component: Component<BrickProps<InferFields<F>, L>>;
}

/** A brick of any schema, e.g. in a list of bricks. */
// oxlint-disable-next-line typescript/no-explicit-any -- component props are contravariant.
export type AnyBrick = Brick<any, any>;

const NAME = /^[a-z][a-z0-9-]*$/;

/** Registers a brick: a named component plus the schema of its data. */
export function defineBrick<const F extends Fields, L = undefined>(def: BrickDefinition<F, L>): Brick<F, L> {
  if (!NAME.test(def.name)) {
    throw new Error(`defineBrick: invalid name "${def.name}" (use lowercase letters, digits and dashes)`);
  }
  return {
    name: def.name,
    label: def.label ?? def.name,
    schema: def.schema,
    load: def.load,
    component: def.component,
    ...schemaOps(def.schema),
  };
}

/** What bricks and collections share: defaults, validation and normalization for a record of fields. */
export interface SchemaOps<F extends Fields> {
  /** Fresh default data. */
  defaults(): InferFields<F>;
  /** Validates (and fills defaults into) unknown data. */
  validate(data: unknown): ValidateResult<InferFields<F>>;
  /**
   * Coerces unknown data into the schema's shape for rendering: missing fields
   * get defaults, and fields of the wrong type are replaced by their default.
   * Values that are the right type but break a rule (an empty required text)
   * are kept, so a preview shows what the editor typed.
   */
  normalize(data: unknown): InferFields<F>;
}

/** Builds the `SchemaOps` for a record of fields. Internal: used by `defineBrick` and `defineCollection`. */
export function schemaOps<F extends Fields>(schema: F): SchemaOps<F> {
  const validator = v.object(schema);
  return {
    defaults: () => defaultsOf(schema),
    validate(data) {
      const result = v.safeParse(validator, data);
      if (result.success) return { success: true, data: result.output as InferFields<F> };
      return {
        success: false,
        issues: result.issues.map((issue) => ({
          path: (issue.path ?? []).map((item) => item.key as string | number),
          message: issue.message,
        })),
      };
    },
    normalize(data) {
      const whole = v.safeParse(validator, data);
      if (whole.typed) return whole.output as InferFields<F>;
      const input = isRecord(data) ? data : {};
      const out: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(schema)) {
        const one = v.safeParse(field, input[key]);
        out[key] = one.typed ? one.output : v.getDefault(field as never);
      }
      return out as InferFields<F>;
    },
  };
}

/**
 * `ops` that keep the keys of the data `schema` doesn't describe, as they
 * are: for metadata and collection fields, where other code may store its
 * own data alongside. Internal.
 */
export function keepExtra<F extends Fields>(ops: SchemaOps<F>, schema: F): SchemaOps<F> {
  const extra = (data: unknown): Record<string, unknown> => {
    if (!isRecord(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([key]) => !Object.hasOwn(schema, key)));
  };
  return {
    defaults: ops.defaults,
    validate(data) {
      const result = ops.validate(data);
      return result.success ? { success: true, data: { ...extra(data), ...result.data } } : result;
    },
    normalize: (data) => ({ ...extra(data), ...ops.normalize(data) }),
  };
}

/** Indexes bricks by name, rejecting duplicates. */
export function brickMap(bricks: readonly AnyBrick[]): ReadonlyMap<string, AnyBrick> {
  const map = new Map<string, AnyBrick>();
  for (const brick of bricks) {
    if (map.has(brick.name)) throw new Error(`Mortar: two bricks are named "${brick.name}"`);
    map.set(brick.name, brick);
  }
  return map;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
