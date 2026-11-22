// Signed values: what the session cookie, the OAuth state and stored
// one-time tokens are built on. A sealed value is `<payload>.<mac>`, both
// base64url: the payload is JSON with an expiry, the mac an HMAC-SHA256 of
// it. Values are signed, not encrypted: anyone holding the cookie can read
// it (an email address), nobody without the secret can change it. Web
// Crypto only, so this runs on Node, Deno, Bun and workers alike.

/** Signs, checks and hashes values with the app's secret. */
export interface Sealer {
  /** `value` as a signed token that `open` accepts until `maxAge` seconds from now. */
  seal(value: unknown, maxAge: number): Promise<string>;
  /** The value inside a token from `seal`, or null if it was changed, signed with an unknown key, or has expired. */
  open(token: string): Promise<unknown>;
  /** A keyed hash (hex) of `value`: what to store instead of a one-time token or code. */
  hash(value: string): Promise<string>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Bytes as base64url, without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** base64url (with or without padding) as bytes, or null if it isn't base64url. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** `length` random bytes as base64url. */
export function randomToken(length = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

/** A uniformly random string of `length` digits. */
export function randomDigits(length: number): string {
  let out = '';
  const bytes = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(bytes);
    // 250 = 25 × 10: drop 250–255 so every digit is equally likely.
    if (bytes[0]! < 250) out += String(bytes[0]! % 10);
  }
  return out;
}

/** The SHA-256 of `text` as base64url (PKCE's code challenge). */
export async function sha256(text: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}

/**
 * A sealer over `secret`: one key, or several to rotate (the first signs,
 * every one is accepted). Each must be at least 32 characters, e.g.
 * `openssl rand -base64 32`.
 */
export function createSealer(secret: string | readonly string[]): Sealer {
  const secrets = typeof secret === 'string' ? [secret] : [...secret];
  if (secrets.length === 0) throw new Error('Mortar auth: `secret` needs at least one key.');
  for (const s of secrets) {
    if (typeof s !== 'string' || s.length < 32) throw new Error('Mortar auth: each `secret` must be at least 32 characters (e.g. `openssl rand -base64 32`).');
  }
  const keys = Promise.all(
    secrets.map((s) => crypto.subtle.importKey('raw', encoder.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])),
  );
  const mac = async (key: CryptoKey, data: string) => new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));

  return {
    async seal(value, maxAge) {
      const payload = toBase64Url(encoder.encode(JSON.stringify({ v: value, exp: Math.floor(Date.now() / 1000) + maxAge })));
      return `${payload}.${toBase64Url(await mac((await keys)[0]!, payload))}`;
    },
    async open(token) {
      const [payload, signature, ...rest] = token.split('.');
      if (!payload || !signature || rest.length > 0) return null;
      const sig = fromBase64Url(signature);
      if (!sig) return null;
      let valid = false;
      // subtle.verify compares in constant time.
      for (const key of await keys) {
        if (await crypto.subtle.verify('HMAC', key, sig, encoder.encode(payload))) {
          valid = true;
          break;
        }
      }
      if (!valid) return null;
      try {
        const bytes = fromBase64Url(payload);
        const data = bytes && (JSON.parse(decoder.decode(bytes)) as { v?: unknown; exp?: unknown });
        if (!data || typeof data.exp !== 'number' || data.exp <= Date.now() / 1000) return null;
        return data.v ?? null;
      } catch {
        return null;
      }
    },
    async hash(value) {
      const bytes = await mac((await keys)[0]!, `mortar-auth-hash:${value}`);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    },
  };
}
