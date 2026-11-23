// authFromEnv: createAuth configured from environment variables, so a site
// doesn't hand-write the same secret, admin list, Google and mailer setup.
// Everything it reads can also be passed as an option, which wins.
//
//   MORTAR_AUTH_SECRET     signs sessions; comma-separate to rotate (required outside dev)
//   MORTAR_ADMINS          addresses and *@domains that may sign in (unless `authorize` is passed)
//   MORTAR_BASE_URL        the public origin, behind a proxy
//   GOOGLE_CLIENT_ID       with GOOGLE_CLIENT_SECRET: Sign in with Google
//   RESEND_API_KEY         with MORTAR_EMAIL_FROM: email sign-in sends through Resend
import type { ContentStore } from '@mortar-kit/core';

import { allowEmails, type EmailUser } from './allow.ts';
import { createAuth, type Auth, type AuthMethod, type AuthOptions } from './auth.ts';
import { email } from './email.ts';
import { google } from './google.ts';
import { consoleMailer, type Mailer } from './mailer.ts';
import { resendMailer } from './resend.ts';

/** Options for `authFromEnv`. */
export interface AuthFromEnvOptions<User> extends Partial<Omit<AuthOptions<User>, 'methods'>> {
  /**
   * Keeps pending email sign-ins. Without it there is no email sign-in.
   * With the JSON-file store, use a folder outside your content and git
   * (`createJsonFileStore({ dir: '.data' })`).
   */
  store?: ContentStore;
  /** Sends sign-in emails. Default: Resend when RESEND_API_KEY and MORTAR_EMAIL_FROM are set, else (in development only) the console. */
  mailer?: Mailer;
  /** The site's name in sign-in emails. */
  siteName?: string;
  /** Methods to offer after the ones from the environment. */
  methods?: readonly AuthMethod[];
  /** Where to read variables. Default `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
  /**
   * Development mode: a fixed secret, `admin@example.com` as the admin
   * and emails printed to the console when nothing else is set. Default
   * Vite's `import.meta.env.DEV`, so a production build never falls back.
   */
  dev?: boolean;
}

// Vite replaces `import.meta.env` in the app's build (dev server: DEV true;
// production build: false). Typed by vite/client in the workspace, not in
// the package build, hence the ts-ignore.
// @ts-ignore
const VITE_DEV: boolean = import.meta.env?.DEV === true;

const DEV_SECRET = 'development-only-secret-do-not-use-in-production';
const DEV_ADMIN = 'admin@example.com';

/**
 * `createAuth` set up from the environment: the secret, who may sign in,
 * Google when its client is configured, and email sign-in through Resend
 * (or your `mailer`). Throws at startup when production is missing a
 * secret, an admin list or every sign-in method.
 *
 * @example
 * ```ts
 * // src/server/auth.ts
 * export const auth = authFromEnv({ store: createJsonFileStore({ dir: '.data' }), siteName: 'My site' });
 * ```
 */
export function authFromEnv<User = EmailUser>(options: AuthFromEnvOptions<User> = {}): Auth<User> {
  const { store, mailer: givenMailer, siteName, methods: extra = [], env: givenEnv, dev: givenDev, ...rest } = options;
  const env = givenEnv ?? (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  const dev = givenDev ?? VITE_DEV;
  const read = (name: string) => env[name]?.trim() || undefined;

  const secret = rest.secret ?? read('MORTAR_AUTH_SECRET')?.split(',').map((s) => s.trim()).filter(Boolean) ?? (dev ? DEV_SECRET : undefined);
  if (!secret) throw new Error('Mortar auth: set MORTAR_AUTH_SECRET (at least 32 characters, e.g. `openssl rand -base64 32`).');

  let authorize = rest.authorize;
  if (!authorize) {
    const admins = read('MORTAR_ADMINS') ?? (dev ? DEV_ADMIN : undefined);
    if (!admins) throw new Error('Mortar auth: set MORTAR_ADMINS (comma-separated addresses or *@domains), or pass `authorize`.');
    authorize = allowEmails(admins.split(',')) as unknown as AuthOptions<User>['authorize'];
  }

  const methods: AuthMethod[] = [];
  const clientId = read('GOOGLE_CLIENT_ID');
  const clientSecret = read('GOOGLE_CLIENT_SECRET');
  if (clientId && clientSecret) methods.push(google({ clientId, clientSecret }));
  else if (clientId || clientSecret) throw new Error('Mortar auth: set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither.');

  if (store) {
    const apiKey = read('RESEND_API_KEY');
    const from = read('MORTAR_EMAIL_FROM');
    if (apiKey && !from) throw new Error('Mortar auth: RESEND_API_KEY is set, so set MORTAR_EMAIL_FROM too (e.g. `Site <admin@example.com>`).');
    const mailer = givenMailer ?? (apiKey && from ? resendMailer({ apiKey, from }) : dev ? consoleMailer() : undefined);
    if (mailer) methods.push(email({ mailer, store, siteName }));
    else console.warn('Mortar auth: email sign-in is off: set RESEND_API_KEY and MORTAR_EMAIL_FROM, or pass a mailer.');
  }
  methods.push(...extra);
  if (methods.length === 0) throw new Error('Mortar auth: no way to sign in. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, or pass a store and a mailer for email sign-in.');

  return createAuth<User>({ ...rest, methods, authorize, secret, baseUrl: rest.baseUrl ?? read('MORTAR_BASE_URL') });
}
