// errorMessage: what to tell an editor when a call failed. Server
// functions and `auth.require` throw a Response (401 signed out, 403 not
// allowed), which `String()` prints as "[object Response]"; this reads its
// text instead, and falls back to the status when the body says nothing
// useful (empty, or an HTML error page).

/** Longest message shown; servers can answer with whole pages. */
const MAX = 300;

const byStatus: Record<number, string> = {
  401: 'You are signed out. Sign in again (in another tab, to keep your changes), then retry.',
  403: 'Not allowed.',
  413: 'Too large for the server.',
  429: 'Too many requests. Try again later.',
};

/**
 * A readable message for a thrown value: an Error's message, a Response's
 * text (or its status), or the value as text.
 */
export async function errorMessage(error: unknown): Promise<string> {
  if (error instanceof Response) {
    let text = '';
    try {
      const type = error.headers.get('content-type') ?? '';
      if (!error.bodyUsed && !type.includes('html')) text = (await error.clone().text()).trim();
    } catch {
      // An unreadable body: say what the status means instead.
    }
    if (error.status === 401) return byStatus[401]!;
    if (text) return text.length > MAX ? `${text.slice(0, MAX)}…` : text;
    return byStatus[error.status] ?? `The server answered ${error.status}${error.statusText ? ` ${error.statusText}` : ''}.`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
