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

/** Editor → preview: the full document to render, its collection's name and whether that collection has a body (sent on every change). */
export interface DocMessage {
  type: 'mortar:doc';
  collection: string;
  body: boolean;
  doc: Doc;
}

/** Editor → preview: saved content changed; data that bricks loaded should be fetched again. */
export interface RefreshMessage {
  type: 'mortar:refresh';
}

/**
 * Editor → preview: the selected entry, by id (null when the document's
 * fields or nothing is selected), so the preview outlines it.
 * Preview → editor: an entry was clicked in the preview; select it.
 */
export interface SelectMessage {
  type: 'mortar:select';
  id: string | null;
}

/**
 * Preview → editor: a same-origin link was followed (⌘/Ctrl-click) in the
 * preview. The editor opens the document it points to, if any, or a new tab.
 */
export interface LinkMessage {
  type: 'mortar:link';
  href: string;
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
    typeof message.body === 'boolean' &&
    typeof message.doc === 'object' &&
    message.doc !== null &&
    typeof message.doc.id === 'string'
  );
}

export function isRefreshMessage(data: unknown): data is RefreshMessage {
  return hasType(data, 'mortar:refresh');
}

export function isSelectMessage(data: unknown): data is SelectMessage {
  const id = (data as Partial<SelectMessage>)?.id;
  return hasType(data, 'mortar:select') && (id === null || typeof id === 'string');
}

export function isLinkMessage(data: unknown): data is LinkMessage {
  return hasType(data, 'mortar:link') && typeof (data as Partial<LinkMessage>).href === 'string';
}
