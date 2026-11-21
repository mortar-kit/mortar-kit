// Messages between the editor and its preview iframe. Both documents share an
// origin; every message is checked against it (and its source window).
import type { Page } from '@mortar-kit/core';

/** Preview → editor: the preview has mounted and wants the current page. */
export interface ReadyMessage {
  type: 'mortar:ready';
}

/** Editor → preview: the full page to render (sent on every change). */
export interface PageMessage {
  type: 'mortar:page';
  page: Page;
}

export function isReadyMessage(data: unknown): data is ReadyMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'mortar:ready';
}

export function isPageMessage(data: unknown): data is PageMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'mortar:page' &&
    Array.isArray((data as { page?: unknown }).page)
  );
}
