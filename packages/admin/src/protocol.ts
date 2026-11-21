// Messages between the editor and its preview iframe. Both documents share an
// origin; every message is checked against it (and its source window).
import type { Doc } from '@mortar-kit/core';

/** Preview → editor: the preview has mounted and wants the current document. */
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

/** Editor → preview: the full document to render, and its collection's name (sent on every change). */
export interface DocMessage {
  type: 'mortar:doc';
  collection: string;
  doc: Doc;
}

/** Editor → preview: saved content changed; data that bricks loaded should be fetched again. */
export interface RefreshMessage {
  type: 'mortar:refresh';
}

function hasType(data: unknown, type: string): boolean {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === type;
}

export function isReadyMessage(data: unknown): data is ReadyMessage {
  return hasType(data, 'mortar:ready');
}

export function isHelloMessage(data: unknown): data is HelloMessage {
  return hasType(data, 'mortar:hello');
}

export function isDocMessage(data: unknown): data is DocMessage {
  const message = data as Partial<DocMessage>;
  return (
    hasType(data, 'mortar:doc') &&
    typeof message.collection === 'string' &&
    typeof message.doc === 'object' &&
    message.doc !== null &&
    typeof message.doc.id === 'string'
  );
}

export function isRefreshMessage(data: unknown): data is RefreshMessage {
  return hasType(data, 'mortar:refresh');
}
