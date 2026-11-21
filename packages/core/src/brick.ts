// defineBrick: pairs a developer's component with the schema describing its
// editable data. The schema drives validation, defaults, and (in the admin
// package) the generated edit form.
import type { Component } from 'solid-js';
import * as v from 'valibot';

import { defaultsOf, type Fields, type InferFields } from './fields.ts';

/** Props every brick component receives. */
export interface BrickProps<D> {
  /** The brick's data: the right shape, with defaults filled in (see `Brick.normalize`). */
  data: D;
}

/** What a developer passes to `defineBrick`. */
export interface BrickDefinition<F extends Fields> {
  /** Stable identifier stored in page data. Lowercase, e.g. `hero` or `feature-grid`. */
  name: string;
  /** Human-readable name for the admin panel. Defaults to `name`. */
  label?: string;
  /** The editable fields, built with `fields.*`. */
  schema: F;
  /** Renders the brick. Read `props.data.x`; don't destructure props. */
  component: Component<BrickProps<InferFields<F>>>;
}

/** A validation problem, located by its path inside the brick's data. */
export interface Issue {
  path: (string | number)[];
  message: string;
}

/** Result of `brick.validate(data)`. */
export type ValidateResult<D> = { success: true; data: D } | { success: false; issues: Issue[] };

/** A registered brick. */
export interface Brick<F extends Fields = Fields> {
  readonly name: string;
  readonly label: string;
  readonly schema: F;
  readonly component: Component<BrickProps<InferFields<F>>>;
  /** Fresh default data, used when the brick is added to a page. */
  defaults(): InferFields<F>;
  /** Validates (and fills defaults into) unknown data. */
  validate(data: unknown): ValidateResult<InferFields<F>>;
  /**
   * Coerces unknown data into the brick's shape for rendering: missing fields
   * get defaults, and fields of the wrong type are replaced by their default.
   * Values that are the right type but break a rule (an empty required text)
   * are kept, so a preview shows what the editor typed.
   */
  normalize(data: unknown): InferFields<F>;
}

/** A brick of any schema, e.g. in a list of bricks. */
// oxlint-disable-next-line typescript/no-explicit-any -- component props are contravariant.
export type AnyBrick = Brick<any>;

const NAME = /^[a-z][a-z0-9-]*$/;

/** Registers a brick: a named component plus the schema of its data. */
export function defineBrick<const F extends Fields>(def: BrickDefinition<F>): Brick<F> {
  if (!NAME.test(def.name)) {
    throw new Error(`defineBrick: invalid name "${def.name}" (use lowercase letters, digits and dashes)`);
  }
  const validator = v.object(def.schema);
  return {
    name: def.name,
    label: def.label ?? def.name,
    schema: def.schema,
    component: def.component,
    defaults: () => defaultsOf(def.schema),
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
      for (const [key, field] of Object.entries(def.schema)) {
        const one = v.safeParse(field, input[key]);
        out[key] = one.typed ? one.output : v.getDefault(field as never);
      }
      return out as InferFields<F>;
    },
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
