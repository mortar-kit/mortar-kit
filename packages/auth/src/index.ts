// Public API of @mortar-kit/auth: server-side sign-in for the admin. Keep
// it out of client code: import it from middleware and server functions.
export {
  createAuth,
  type Auth,
  type AuthError,
  type AuthMethod,
  type AuthMethodContext,
  type AuthMethodInfo,
  type AuthOptions,
  type AuthorizeInput,
  type AuthSuccess,
  type Identity,
} from './auth.ts';
export { allowEmails, type EmailUser } from './allow.ts';
export { authFromEnv, type AuthFromEnvOptions } from './env.ts';
export { allowMembers, type AllowMembersOptions } from './members.ts';
export { email, EMAIL_TOKENS_COLLECTION, type EmailOptions } from './email.ts';
export { google, type GoogleOptions } from './google.ts';
export { createLimiter, createMiddleware, type Middleware, type MiddlewareEvent, type MiddlewareOptions } from './middleware.ts';
export { consoleMailer, type MailMessage, type Mailer } from './mailer.ts';
export { resendMailer, type ResendMailerOptions } from './resend.ts';
export { createSealer, type Sealer } from './seal.ts';
