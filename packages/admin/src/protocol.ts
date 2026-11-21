// Messages between the editor and its preview iframe. Both documents share an
// origin; every message is checked against it (and its source window).
import type { Page } from '@mortar-kit/core';

/** Preview → editor: the preview has mounted and wants the current page. */
export interface ReadyMessage {
  type: 'mortar:ready';
}

/**
 * Editor → preview: the editor is listening now; answer with `mortar:ready`.
 * Covers a preview that loaded (and announced itself) before the editor
 * hydrated, since the iframe is in the server-rendered HTML.
 */
export interface HelloMessage {
  type: 'mortar:hello';
}

/** Editor → preview: the full page to render (sent on every change). */
export interface PageMessage {
  type: 'mortar:page';
  page: Page;
}

export function isReadyMessage(data: unknown): data is ReadyMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'mortar:ready';
}

export function isHelloMessage(data: unknown): data is HelloMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'mortar:hello';
}

export function isPageMessage(data: unknown): data is PageMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'mortar:page' &&
    Array.isArray((data as { page?: { entries?: unknown } }).page?.entries)
  );
}
