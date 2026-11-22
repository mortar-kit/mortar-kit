// Assets: uploaded files (images, video, audio, PDFs). Their bytes live in a
// `BlobStore`, an adapter as small as `ContentStore` and separate from it,
// so documents can live in JSON files or a database while files live on
// disk or in a bucket. There are no asset records: an asset's key carries
// its name and type (`hero-photo-x7k2q9.jpg`), so any store can list
// assets without an index. Documents point at an asset by key (the
// `asset` of an image or file field); `createContent` applies the rules.

/**
 * Where uploaded files live: bytes by key. Implement it to keep files
 * anywhere (a folder, S3, a CDN). Deliberately dumb; `createContent` checks
 * types, sizes and keys, and refuses to delete a file documents use.
 */
export interface BlobStore {
  /** Every stored file. [] if none. */
  list(): Promise<BlobInfo[]>;
  /** The file under `key` (its `type` set from the key's extension), or undefined. */
  get(key: string): Promise<Blob | undefined>;
  /** Stores `data` under `key`, replacing any file there. */
  put(key: string, data: Blob): Promise<void>;
  /** Removes the file under `key`; nothing happens if there is none. */
  remove(key: string): Promise<void>;
  /** The URL the site loads the file from, e.g. `/uploads/<key>` or a bucket URL. Synchronous: it is computed, never looked up. */
  url(key: string): string;
}

/** A stored file, as `BlobStore.list` returns it. */
export interface BlobInfo {
  key: string;
  /** Size in bytes. */
  size: number;
  /** When it was stored (ISO 8601), if the store knows. */
  modified?: string;
}

/** What a file is, for choosing it: an image field accepts `image`, a file field the kinds it lists. */
export type AssetKind = 'image' | 'video' | 'audio' | 'document';

/**
 * The file types assets may have, by extension. SVG is left out on purpose:
 * it can carry script, and uploads are served from the site's own origin.
 */
const TYPES: Readonly<Record<string, readonly [type: string, kind: AssetKind]>> = {
  jpg: ['image/jpeg', 'image'],
  jpeg: ['image/jpeg', 'image'],
  png: ['image/png', 'image'],
  gif: ['image/gif', 'image'],
  webp: ['image/webp', 'image'],
  avif: ['image/avif', 'image'],
  mp4: ['video/mp4', 'video'],
  webm: ['video/webm', 'video'],
  mov: ['video/quicktime', 'video'],
  mp3: ['audio/mpeg', 'audio'],
  m4a: ['audio/mp4', 'audio'],
  ogg: ['audio/ogg', 'audio'],
  wav: ['audio/wav', 'audio'],
  pdf: ['application/pdf', 'document'],
};

/** The extensions of each kind, e.g. for an `<input type="file" accept>`. */
export function assetExtensions(kinds?: readonly AssetKind[]): string[] {
  return Object.entries(TYPES)
    .filter(([, [, kind]]) => !kinds || kinds.includes(kind))
    .map(([ext]) => ext);
}

/** An uploaded file, as `Assets.list` returns it. */
export interface Asset {
  /** The key documents store, e.g. `hero-photo-x7k2q9.jpg`. */
  key: string;
  /** The name it was uploaded as, lowercased (`hero-photo.jpg`). */
  name: string;
  kind: AssetKind;
  /** MIME type, from the extension. */
  type: string;
  /** Size in bytes. */
  size: number;
  /** URL to load it from (`BlobStore.url`). */
  src: string;
  /** When it was stored (ISO 8601), if the store knows. */
  modified?: string;
}

const KEY = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([a-z0-9]{6})\.([a-z0-9]{2,4})$/;

/** Whether `key` is a valid asset key: `<name>-<6 letters or digits>.<known extension>`, at most 100 characters. */
export function isValidAssetKey(key: string): boolean {
  if (typeof key !== 'string' || key.length > 100) return false;
  const match = KEY.exec(key);
  return match !== null && Object.hasOwn(TYPES, match[3] as string);
}

/** The type, kind and display name of a valid key; undefined for anything else. */
export function assetInfo(key: string): { type: string; kind: AssetKind; name: string } | undefined {
  if (!isValidAssetKey(key)) return undefined;
  const [, base, , ext] = KEY.exec(key) as unknown as [string, string, string, string];
  const [type, kind] = TYPES[ext] as readonly [string, AssetKind];
  return { type, kind, name: `${base}.${ext}` };
}

/**
 * A fresh key for an uploaded file name: the name made URL-safe, six random
 * letters and digits (so two uploads of `photo.jpg` never collide), and its
 * extension. Undefined if the extension isn't an allowed type.
 */
export function assetKeyFor(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf('.');
  const ext = dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
  if (!Object.hasOwn(TYPES, ext)) return undefined;
  const base =
    fileName
      .slice(0, dot)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60)
      .replace(/^-+|-+$/g, '') || 'file';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  return `${base}-${suffix}.${ext}`;
}

/** Options for `createMemoryBlobStore`. */
export interface MemoryBlobStoreOptions {
  /** Prefix of `url(key)`. Default `/uploads/`. */
  baseUrl?: string;
}

/** A blob store that keeps files in memory (tests, demos). */
export function createMemoryBlobStore(options: MemoryBlobStoreOptions = {}): BlobStore {
  const baseUrl = options.baseUrl ?? '/uploads/';
  const files = new Map<string, { data: Blob; modified: string }>();
  return {
    async list() {
      return [...files].map(([key, file]) => ({ key, size: file.data.size, modified: file.modified }));
    },
    async get(key) {
      const file = files.get(key);
      return file && new Blob([file.data], { type: assetInfo(key)?.type ?? '' });
    },
    async put(key, data) {
      if (!isValidAssetKey(key)) throw new Error(`Mortar: invalid asset key "${key}"`);
      files.set(key, { data: new Blob([data]), modified: new Date().toISOString() });
    },
    async remove(key) {
      files.delete(key);
    },
    url: (key) => `${baseUrl}${key}`,
  };
}

/**
 * A response serving one stored file: for an app route or middleware such
 * as `/uploads/*`. Types come from the key's extension and are sent with
 * `nosniff`, so a file can't be read as anything else; keys never change
 * content, so files are cached for good. Answers byte ranges (video seeking)
 * and 404 for an invalid key or a missing file.
 */
export async function serveBlob(store: BlobStore, key: string, request?: Request): Promise<Response> {
  const info = assetInfo(key);
  const data = info && (await store.get(key));
  if (!info || !data) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const headers = new Headers({
    'content-type': info.type,
    'x-content-type-options': 'nosniff',
    'cache-control': 'public, max-age=31536000, immutable',
    'accept-ranges': 'bytes',
  });
  const head = request?.method === 'HEAD';
  const range = request?.headers.get('range');
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match && (match[1] || match[2])) {
    const size = data.size;
    // `a-b`, `a-` (to the end) or `-n` (the last n bytes).
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      headers.set('content-range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('content-range', `bytes ${start}-${end}/${size}`);
    headers.set('content-length', String(end - start + 1));
    return new Response(head ? null : data.slice(start, end + 1), { status: 206, headers });
  }
  headers.set('content-length', String(data.size));
  return new Response(head ? null : data, { status: 200, headers });
}
