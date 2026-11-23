// handleContact: checks a contact form post, mails it, and redirects back
// to the page with the outcome.
import type { MailMessage, Mailer } from '@mortar-kit/auth';
import { describe, expect, it } from 'vitest';

import { createContactHandler } from './contact.ts';

const TO = 'inbox@example.com';

function post(fields: Record<string, string>, init: { path?: string; ip?: string } = {}): Request {
  return new Request(`http://site.test${init.path ?? '/contact'}`, {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: init.ip ? { 'x-forwarded-for': init.ip } : {},
  });
}

function recorder(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return { sent, send: async (message) => void sent.push(message) };
}

/** Calls a fresh handler (its own rate limit) that mails with `mailer` to `to`. */
const handleContact = (request: Request, mailer: Mailer, to: string | undefined) => createContactHandler({ mailer, to })(request);

const valid = { return: '/about', name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello there.' };

describe('handleContact', () => {
  it('leaves other requests to the next middleware', async () => {
    const mailer = recorder();
    expect(await handleContact(new Request('http://site.test/contact'), mailer, TO)).toBeUndefined();
    expect(await handleContact(post(valid, { path: '/about' }), mailer, TO)).toBeUndefined();
  });

  it('mails a valid message, replying to the sender, and redirects back with sent', async () => {
    const mailer = recorder();
    const response = await handleContact(post(valid), mailer, TO);
    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toBe('/about?contact=sent#contact');
    expect(mailer.sent).toEqual([
      {
        to: TO,
        replyTo: 'ada@example.com',
        subject: 'Contact form: Ada Lovelace',
        text: 'Ada Lovelace <ada@example.com> wrote, from /about:\n\nHello there.\n',
      },
    ]);
  });

  it('refuses missing or bad fields with invalid', async () => {
    const mailer = recorder();
    for (const bad of [{ name: '' }, { email: 'not an address' }, { message: '   ' }, { message: 'x'.repeat(5001) }]) {
      const response = await handleContact(post({ ...valid, ...bad }), mailer, TO);
      expect(response?.headers.get('location')).toBe('/about?contact=invalid#contact');
    }
    expect(mailer.sent).toEqual([]);
  });

  it('keeps line breaks out of the subject', async () => {
    const mailer = recorder();
    await handleContact(post({ ...valid, name: 'Ada\r\nBcc: eve@example.com' }), mailer, TO);
    expect(mailer.sent[0]?.subject).toBe('Contact form: Ada Bcc: eve@example.com');
  });

  it('only redirects to paths on this site', async () => {
    for (const target of ['https://evil.test/', '//evil.test/x', 'about', '']) {
      const response = await handleContact(post({ ...valid, return: target }), recorder(), TO);
      expect(response?.headers.get('location')).toBe('/?contact=sent#contact');
    }
    const response = await handleContact(post({ ...valid, return: '/posts/hello?x=1#top' }), recorder(), TO);
    expect(response?.headers.get('location')).toBe('/posts/hello?contact=sent#contact');
  });

  it('pretends to send when the honeypot is filled', async () => {
    const mailer = recorder();
    const response = await handleContact(post({ ...valid, website: 'http://spam.test' }), mailer, TO);
    expect(response?.headers.get('location')).toBe('/about?contact=sent#contact');
    expect(mailer.sent).toEqual([]);
  });

  it('answers failed when the mailer throws or nothing is configured', async () => {
    const broken: Mailer = {
      send: async () => {
        throw new Error('down');
      },
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      expect((await handleContact(post(valid), broken, TO))?.headers.get('location')).toBe('/about?contact=failed#contact');
    } finally {
      console.error = quiet;
    }
    expect((await handleContact(post(valid), recorder(), undefined))?.headers.get('location')).toBe('/about?contact=failed#contact');
  });

  it('limits each client to five messages per ten minutes', async () => {
    const mailer = recorder();
    const handle = createContactHandler({ mailer, to: TO });
    const statuses: (string | null | undefined)[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await handle(post(valid, { ip: '203.0.113.9' })))?.headers.get('location'));
    expect(statuses.at(-1)).toBe('/about?contact=busy#contact');
    expect(mailer.sent).toHaveLength(5);
  });
});
