// The example's sign-in: who may use /admin and how they prove it. Server
// only (the middleware and the "use server" modules import it), so the
// secret and the mailer never reach the browser.
//
// authFromEnv reads the environment (see the Sign-in guide):
// - MORTAR_AUTH_SECRET: at least 32 characters (`openssl rand -base64 32`).
//   Required in production; development falls back to a fixed secret.
// - MORTAR_ADMINS: comma-separated addresses or `*@domain`s that may sign
//   in. Development default `admin@example.com`.
// - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: turn on Sign in with Google
//   (redirect URI `<origin>/admin/auth/google/callback`).
// - RESEND_API_KEY / MORTAR_EMAIL_FROM: send sign-in emails through Resend.
//   Without them, development prints the emails (code and link) to the
//   server console.
// - MORTAR_BASE_URL: the public origin, when running behind a proxy.
//
// Pending email sign-ins live in .data/ (git-ignored), apart from the content.
import { authFromEnv } from '@mortar-kit/auth';
import { createJsonFileStore } from '@mortar-kit/core/server';

export const auth = authFromEnv({ store: createJsonFileStore({ dir: '.data' }), siteName: 'the Mortar example' });
