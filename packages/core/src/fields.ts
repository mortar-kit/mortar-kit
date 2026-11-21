// Field helpers for brick schemas. Each helper returns a Valibot schema that
// (1) validates the value, (2) fills in a default when the value is missing,
// and (3) carries a `FieldInfo` in its metadata so the admin panel can render
// a form widget for it. The set of kinds is deliberately closed and small.
import * as v from 'valibot';

/** The form widget a field is edited with. */
export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'url'
  | 'image'
  | 'list'
  | 'object';

/** UI description of a field, stored in its Valibot metadata under `mortar`. */
export interface FieldInfo {
  readonly kind: FieldKind;
  readonly label: string;
  readonly help?: string;
  readonly placeholder?: string;
  /** Text-like fields: the value must not be empty. */
  readonly required?: boolean;
  /** Text-like fields: maximum length. */
  readonly maxLength?: number;
  /** `select`: option value → option label. */
  readonly options?: Readonly<Record<string, string>>;
  /** `number`: input constraints. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** `list`: the field each item is edited with. */
  readonly item?: AnyField;
  /** `object`: the nested fields. */
  readonly fields?: Fields;
}

/**
 * A Mortar field: a Valibot schema whose output is `T`. The input may be
 * missing (`undefined`), in which case the field's default is used.
 */
export type Field<T> = v.GenericSchema<T | undefined, T>;
// oxlint-disable-next-line typescript/no-explicit-any -- variance: any field fits.
export type AnyField = v.GenericSchema<any, any>;
/** A record of named fields: the `schema` of a brick or an `object` field. */
export type Fields = Readonly<Record<string, AnyField>>;
/** The data type described by a record of fields. */
export type InferFields<F extends Fields> = { -readonly [K in keyof F]: v.InferOutput<F[K]> };

interface Common<T> {
  /** Shown next to the input in the admin panel. */
  label: string;
  /** Optional help text shown under the input. */
  help?: string;
  /** Value used when the data has none (e.g. when a brick is added). */
  default?: T;
}

/** Wraps `schema` with a default and attaches its UI description. */
function field<T>(schema: v.GenericSchema<T>, fallback: T | (() => T), info: FieldInfo): Field<T> {
  return v.pipe(v.optional(schema, fallback as never), v.metadata({ mortar: info })) as unknown as Field<T>;
}

/** Copies plain data so mutable defaults (arrays, objects) are never shared. */
function fresh<T>(value: T): () => T {
  return () => structuredClone(value);
}

/** Reads the UI description from a field, or `undefined` for a non-Mortar schema. */
export function fieldInfo(schema: AnyField): FieldInfo | undefined {
  const meta = v.getMetadata(schema as never) as { mortar?: FieldInfo } | undefined;
  return meta?.mortar;
}

function stringSchema(o: { label: string; required?: boolean; maxLength?: number }): v.GenericSchema<string> {
  let s: v.GenericSchema<string> = v.string();
  if (o.required) s = v.pipe(s, v.nonEmpty(`${o.label} is required`));
  if (o.maxLength !== undefined) {
    s = v.pipe(s, v.maxLength(o.maxLength, `${o.label} must be at most ${o.maxLength} characters`));
  }
  return s;
}

interface TextOptions extends Common<string> {
  placeholder?: string;
  /** The value must not be empty. New entries start empty unless `default` is set. */
  required?: boolean;
  maxLength?: number;
}

function textInfo(kind: 'text' | 'textarea', o: TextOptions): FieldInfo {
  return { kind, label: o.label, help: o.help, placeholder: o.placeholder, required: o.required, maxLength: o.maxLength };
}

/** A single-line string. */
function text(o: TextOptions): Field<string> {
  return field(stringSchema(o), o.default ?? '', textInfo('text', o));
}

/** A multi-line plain-text string. */
function textarea(o: TextOptions): Field<string> {
  return field(stringSchema(o), o.default ?? '', textInfo('textarea', o));
}

/** A number, optionally bounded. Defaults to 0 clamped into [min, max]. */
function number(o: Common<number> & { min?: number; max?: number; step?: number }): Field<number> {
  let s: v.GenericSchema<number> = v.pipe(v.number(), v.finite(`${o.label} must be a number`));
  if (o.min !== undefined) s = v.pipe(s, v.minValue(o.min, `${o.label} must be at least ${o.min}`));
  if (o.max !== undefined) s = v.pipe(s, v.maxValue(o.max, `${o.label} must be at most ${o.max}`));
  const fallback = o.default ?? Math.min(Math.max(0, o.min ?? -Infinity), o.max ?? Infinity);
  return field(s, fallback, { kind: 'number', label: o.label, help: o.help, min: o.min, max: o.max, step: o.step });
}

/** A true/false toggle. */
function boolean(o: Common<boolean>): Field<boolean> {
  return field(v.boolean(), o.default ?? false, { kind: 'boolean', label: o.label, help: o.help });
}

const INTEGER_KEY = /^(0|[1-9]\d*)$/;

/**
 * One of a fixed set of values. `options` maps each value to its label, e.g.
 * `{ left: 'Left', center: 'Centre' }`; the first option is the default.
 * Values must not be integer-like ('1', '2'): JS reorders such keys.
 */
function select<const O extends Readonly<Record<string, string>>>(
  o: Common<keyof O & string> & { options: O },
): Field<keyof O & string> {
  const values = Object.keys(o.options) as (keyof O & string)[];
  const first = values[0];
  if (first === undefined) throw new Error(`fields.select(${o.label}): options must not be empty`);
  const numeric = values.find((value) => INTEGER_KEY.test(value));
  if (numeric !== undefined) {
    throw new Error(`fields.select(${o.label}): option "${numeric}" is integer-like; JS would reorder it (use e.g. "c${numeric}")`);
  }
  return field(v.picklist(values, `${o.label} must be one of: ${values.join(', ')}`), o.default ?? first, {
    kind: 'select',
    label: o.label,
    help: o.help,
    options: o.options,
  });
}

/** Site-relative paths, anchors, queries, mailto: and tel: links. */
const RELATIVE = /^(\/|#|\?|mailto:|tel:)/i;

/**
 * True for '', a relative link, or an absolute http(s) URL. Other schemes
 * (javascript:, data:, vbscript:, …) are rejected: values render into href/src.
 */
function isLink(s: string): boolean {
  if (s === '' || RELATIVE.test(s)) return true;
  const parsed = URL.parse(s);
  return parsed !== null && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

const linkMessage = (label: string) => `${label} must be an http(s) URL or a path starting with /`;

/** A link: an absolute http(s) URL or a site-relative path such as `/about`. */
function url(o: Common<string> & { placeholder?: string; required?: boolean }): Field<string> {
  const s = v.pipe(stringSchema(o), v.check(isLink, linkMessage(o.label)));
  return field(s, o.default ?? '', { kind: 'url', label: o.label, help: o.help, placeholder: o.placeholder, required: o.required });
}

/** An image reference. */
export interface Image {
  src: string;
  alt: string;
}

/** An image: its URL plus alt text. Missing `src`/`alt` default to ''. */
function image(o: Common<Image> & { required?: boolean }): Field<Image> {
  const src = v.pipe(stringSchema(o), v.check(isLink, linkMessage(o.label)));
  const s = v.object({ src: v.optional(src, ''), alt: v.optional(v.string(), '') }) as v.GenericSchema<Image>;
  return field(s, fresh(o.default ?? { src: '', alt: '' }), { kind: 'image', label: o.label, help: o.help, required: o.required });
}

/**
 * An ordered list of items, each edited with the `of` field. Without a
 * `default`, a new list holds `min` default items (none if `min` is unset).
 */
function list<T>(o: Common<T[]> & { of: Field<T>; min?: number; max?: number }): Field<T[]> {
  let s: v.GenericSchema<T[]> = v.array(o.of as v.GenericSchema<T>);
  if (o.min !== undefined) s = v.pipe(s, v.minLength(o.min, `${o.label} needs at least ${o.min} items`));
  if (o.max !== undefined) s = v.pipe(s, v.maxLength(o.max, `${o.label} allows at most ${o.max} items`));
  const fallback = o.default === undefined ? () => Array.from({ length: o.min ?? 0 }, () => defaultOf(o.of)) : fresh(o.default);
  return field(s, fallback, { kind: 'list', label: o.label, help: o.help, item: o.of, min: o.min, max: o.max });
}

/** A group of named fields, e.g. the shape of one item in a `list`. */
function object<const F extends Fields>(o: Common<InferFields<F>> & { fields: F }): Field<InferFields<F>> {
  const s = v.object(o.fields) as unknown as v.GenericSchema<InferFields<F>>;
  const fallback = o.default === undefined ? () => defaultsOf(o.fields) : fresh(o.default);
  return field(s, fallback, { kind: 'object', label: o.label, help: o.help, fields: o.fields });
}

/** A fresh default value for one field. */
export function defaultOf<T>(f: Field<T>): T {
  return v.getDefault(f as never) as T;
}

/** The default data for a record of fields (each field's own default). */
export function defaultsOf<F extends Fields>(f: F): InferFields<F> {
  return v.getDefaults(v.object(f)) as InferFields<F>;
}

/** Field helpers used to declare a brick's schema. */
export const fields = { text, textarea, number, boolean, select, url, image, list, object };
