// The example's sign-in: who may use /admin and how they prove it. Server
// only (the middleware and the "use server" modules import it), so the
// secret and the mailer never reach the browser.
//
// Environment:
// - MORTAR_AUTH_SECRET: at least 32 characters (`openssl rand -base64 32`).
//   Required in production; development falls back to a fixed secret.
// - MORTAR_ADMINS: comma-separated addresses or `*@domain`s that may sign
//   in. Default `admin@example.com`.
// - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: turn on Sign in with Google
//   (redirect URI `<origin>/admin/auth/google/callback`).
// - MORTAR_BASE_URL: the public origin, when running behind a proxy.
//
// Email sign-in prints its emails (code and link) to the server console:
// swap consoleMailer() for your provider. Pending email sign-ins live in
// .data/ (git-ignored), apart from the content.
import { allowEmails, consoleMailer, createAuth, email, google, type AuthMethod } from '@mortar-kit/auth';
import { createJsonFileStore } from '@mortar-kit/core/server';

const env = process.env;

function secret(): string {
  if (env.MORTAR_AUTH_SECRET) return env.MORTAR_AUTH_SECRET;
  if (import.meta.env.PROD) throw new Error('Set MORTAR_AUTH_SECRET (at least 32 characters, e.g. `openssl rand -base64 32`).');
  return 'development-only-secret-do-not-use-in-production';
}

const methods: AuthMethod[] = [];
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  methods.push(google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }));
}
methods.push(email({ mailer: consoleMailer(), store: createJsonFileStore({ dir: '.data' }), siteName: 'the Mortar example' }));

export const auth = createAuth({
  methods,
  authorize: allowEmails((env.MORTAR_ADMINS ?? 'admin@example.com').split(',')),
  secret: secret(),
  baseUrl: env.MORTAR_BASE_URL,
});
