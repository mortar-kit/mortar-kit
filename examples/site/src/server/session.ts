'use server';
// Server functions for the admin's sign-in: who is signed in, and the
// ways to sign in (for the sign-in page). Read with GET (src/content.ts).
import type { SignInMethod } from '@mortar-kit/admin';
import type { EmailUser } from '@mortar-kit/auth';
import { getRequestEvent } from '@solidjs/web';

import { auth } from './auth.ts';

/** The signed-in admin, or null. */
export async function getSignedInUser(): Promise<EmailUser | null> {
  const event = getRequestEvent();
  return event ? auth.user(event.request) : null;
}

/** The sign-in methods, for the sign-in page. */
export async function getSignInMethods(): Promise<SignInMethod[]> {
  return [...auth.methods];
}
