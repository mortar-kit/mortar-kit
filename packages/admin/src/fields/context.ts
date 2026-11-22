// Context shared by the inputs of one brick form: writes bound to the entry
// being edited, and validation messages looked up by path.
import { createContext, useContext } from 'solid-js';

import type { Path } from '../state.ts';

export interface FormApi {
  setValue(path: Path, value: unknown): void;
  insertItem(path: Path, index: number, value: unknown): void;
  removeItem(path: Path, index: number): void;
  moveItem(path: Path, from: number, to: number): void;
  /** The validation message for exactly this path, if any. */
  issue(path: Path): string | undefined;
  /** Whether this path or anything under it has a validation message. */
  hasIssueWithin(path: Path): boolean;
}

export const FormContext = createContext<FormApi>();

export function useForm(): FormApi {
  return useContext(FormContext);
}

/** Stable string key for a path, e.g. `cards.2.title`. */
export function pathKey(path: Path): string {
  return path.join('.');
}
