// Brick forms for the app. Every brick form posts to one server function,
// runBrickAction (src/server/content.ts), with the entry's reference bound
// in; the router turns that into a form action: a plain post without
// JavaScript (it comes back to the page with the result in a one-time
// cookie), or a fetch when the page has scripts, which updates only that
// brick. Provided around the app in App.tsx.
import { sameEntry, type BrickActions } from '@mortar-kit/core';
import type { Mailer } from '@mortar-kit/auth';
import { formAction, useSubmissions } from '@solidjs/router';

import { runBrickAction } from './server/content.ts';

declare module '@mortar-kit/core' {
  /** What the server passes to every brick action (src/server/mail.ts). */
  interface ActionContext {
    /** Sends email; undefined when none is configured. */
    mailer?: Mailer;
    /** The site's inbox (CONTACT_TO). */
    inbox?: string;
  }
}

const post = formAction(runBrickAction, 'mortar-brick-action');

/** Where brick forms post, and their results. */
export const brickActions: BrickActions = {
  action: (ref) => post.with(ref),
  useSubmission: (ref) => {
    const all = useSubmissions(post, (input) => sameEntry(input[0], ref()));
    return () => {
      const last = all.at(-1);
      // The router's submission has no pending flag: it's in flight until it has a result or an error.
      return last && { pending: last.result === undefined && last.error === undefined, result: last.result, error: last.error };
    };
  },
};
