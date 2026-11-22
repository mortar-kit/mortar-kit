// How the admin names a place that uses a document or an asset, when a
// delete is refused: "Products › Blue mug › Category".
import type { AnyCollection, Referrer } from '@mortar-kit/core';

/** "Products › Blue mug › Category" for a use in a document's fields or one of its bricks. */
export function referrerLabel(c: AnyCollection | undefined, r: Referrer): string {
  const where = r.entryId === undefined ? r.path.slice(1) : ['body', ...r.path];
  return [c?.label ?? r.collection, r.title, ...where].join(' › ');
}
