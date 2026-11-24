// errorMessage: Responses thrown by server functions read as their text,
// with the status as a fallback; Errors and other values as before.
import { describe, expect, it } from 'vitest';

import { errorMessage } from './errors.ts';

describe('errorMessage', () => {
  it("reads a Response's text", async () => {
    expect(await errorMessage(new Response('Not allowed', { status: 403 }))).toBe('Not allowed');
    expect(await errorMessage(new Response('x'.repeat(400), { status: 500 }))).toHaveLength(301);
  });

  it('says what a 401 means, whatever the body', async () => {
    expect(await errorMessage(new Response('Sign in required', { status: 401 }))).toMatch(/^You are signed out/);
  });

  it('falls back to the status for empty or HTML bodies', async () => {
    expect(await errorMessage(new Response(null, { status: 413 }))).toBe('Too large for the server.');
    expect(await errorMessage(new Response('<html>oops</html>', { status: 502, statusText: 'Bad Gateway', headers: { 'content-type': 'text/html' } }))).toBe(
      'The server answered 502 Bad Gateway.',
    );
  });

  it('keeps Error messages and stringifies the rest', async () => {
    expect(await errorMessage(new Error('Disk full'))).toBe('Disk full');
    expect(await errorMessage('nope')).toBe('nope');
  });
});
