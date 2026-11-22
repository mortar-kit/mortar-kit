// A `BlobStore` kept in the browser's session storage: the docs site's way
// to let anyone try uploads without a server. Files are kept as data URLs
// under one key, so they last as long as the tab (like the edits in
// session-store.ts) and clearing the key forgets them. Session storage
// holds a few megabytes, so the docs keep uploads small (createContent's
// `maxAssetSize`); a full storage makes an upload fail with a message.
//
// `url` must be synchronous, so it hands out `blob:` URLs made from the
// stored data on first use and kept for the page's life.
import { assetInfo, isValidAssetKey, type BlobStore } from '@mortar-kit/core';

/** What the store keeps: per key, the file as a data URL, its size and when it was stored. */
type Files = Record<string, { data: string; size: number; modified: string }>;

export interface SessionStorageBlobStoreOptions {
  /** The session storage item holding the files. Default `'mortar:files'`. */
  key?: string;
  /** Where to keep them. Default `sessionStorage`; tests pass their own `Storage`. */
  storage?: Storage;
}

/** A `BlobStore` over session storage, plus what the docs need to undo uploads. */
export interface SessionStorageBlobStore extends BlobStore {
  /** Whether any file is stored. */
  hasFiles(): boolean;
  /** Forgets every file. */
  clear(): void;
}

/** Creates the store. Missing or unreadable storage behaves as no files; uploads then throw. */
export function createSessionStorageBlobStore(options: SessionStorageBlobStoreOptions = {}): SessionStorageBlobStore {
  const key = options.key ?? 'mortar:files';
  const urls = new Map<string, string>();
  const storage = (): Storage | undefined => {
    try {
      return options.storage ?? globalThis.sessionStorage;
    } catch {
      return undefined;
    }
  };
  const read = (): Files => {
    try {
      const raw = storage()?.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Files) : {};
    } catch {
      return {};
    }
  };
  const write = (files: Files) => {
    const target = storage();
    if (!target) throw new Error('Session storage is not available in this browser');
    try {
      target.setItem(key, JSON.stringify(files));
    } catch {
      throw new Error('Session storage is full: delete some files first');
    }
  };

  return {
    async list() {
      return Object.entries(read()).map(([k, file]) => ({ key: k, size: file.size, modified: file.modified }));
    },
    async get(k) {
      const file = read()[k];
      return file && toBlob(file.data, assetInfo(k)?.type ?? '');
    },
    async put(k, data) {
      if (!isValidAssetKey(k)) throw new Error(`Mortar: invalid asset key "${k}"`);
      const dataUrl = await toDataUrl(data, assetInfo(k)?.type ?? '');
      write({ ...read(), [k]: { data: dataUrl, size: data.size, modified: new Date().toISOString() } });
    },
    async remove(k) {
      const files = read();
      if (!Object.hasOwn(files, k)) return;
      delete files[k];
      write(files);
      const url = urls.get(k);
      if (url) URL.revokeObjectURL(url);
      urls.delete(k);
    },
    url(k) {
      let url = urls.get(k);
      const file = url ? undefined : read()[k];
      if (file) urls.set(k, (url = URL.createObjectURL(toBlob(file.data, assetInfo(k)?.type ?? ''))));
      return url ?? '';
    },
    hasFiles() {
      return Object.keys(read()).length > 0;
    },
    clear() {
      try {
        storage()?.removeItem(key);
      } catch {
        // Nothing stored, nothing to clear.
      }
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}

async function toDataUrl(data: Blob, type: string): Promise<string> {
  const bytes = new Uint8Array(await data.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

function toBlob(dataUrl: string, type: string): Blob {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
