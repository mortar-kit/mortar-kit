// The contact form's action: checks the post, mails it with the visitor as
// the reply address, and answers what happened.
import type { MailMessage, Mailer } from '@mortar-kit/auth';
import type { ActionContext } from '@mortar-kit/core';
import { describe, expect, it, vi } from 'vitest';

import { contactForm } from './contact-form.tsx';

function recorder(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return { sent, send: async (message) => void sent.push(message) };
}

const valid = { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello there.' };

function run(post: Record<string, string>, context: ActionContext, to = '') {
  const form = new FormData();
  for (const [k, v] of Object.entries(post)) form.append(k, v);
  return contactForm.action!({ form, data: { ...contactForm.defaults(), to }, request: undefined, context });
}

describe('contact form action', () => {
  it("mails a valid message to the site's inbox, replying to the sender", async () => {
    const mailer = recorder();
    expect(await run(valid, { mailer, inbox: 'inbox@example.com' })).toEqual({ status: 'sent' });
    expect(mailer.sent).toEqual([
      {
        to: 'inbox@example.com',
        replyTo: 'ada@example.com',
        subject: 'Contact form: Ada Lovelace',
        text: 'Ada Lovelace <ada@example.com> wrote:\n\nHello there.\n',
      },
    ]);
  });

  it("sends to the brick's own address when the editor set one", async () => {
    const mailer = recorder();
    await run(valid, { mailer, inbox: 'inbox@example.com' }, 'sales@example.com');
    expect(mailer.sent[0]?.to).toBe('sales@example.com');
  });

  it('answers invalid, with the values to fill back in, for missing or bad fields', async () => {
    const mailer = recorder();
    for (const bad of [{ name: ' ' }, { email: 'not an address' }, { message: '' }, { message: 'x'.repeat(5001) }]) {
      const result = await run({ ...valid, ...bad }, { mailer, inbox: 'i@example.com' });
      expect(result).toMatchObject({ status: 'invalid', values: { ...valid, ...bad, name: (bad.name ?? valid.name).trim() } });
    }
    expect(mailer.sent).toEqual([]);
  });

  it('keeps line breaks out of the subject', async () => {
    const mailer = recorder();
    await run({ ...valid, name: 'Ada\r\nBcc: eve@example.com' }, { mailer, inbox: 'i@example.com' });
    expect(mailer.sent[0]?.subject).toBe('Contact form: Ada Bcc: eve@example.com');
  });

  it('pretends to send when the honeypot is filled', async () => {
    const mailer = recorder();
    expect(await run({ ...valid, website: 'http://spam.test' }, { mailer, inbox: 'i@example.com' })).toEqual({ status: 'sent' });
    expect(mailer.sent).toEqual([]);
  });

  it('answers failed without a mailer or inbox, or when sending throws', async () => {
    expect(await run(valid, { inbox: 'i@example.com' })).toEqual({ status: 'failed' });
    expect(await run(valid, { mailer: recorder() })).toEqual({ status: 'failed' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: Mailer = {
      send: async () => {
        throw new Error('down');
      },
    };
    expect(await run(valid, { mailer: broken, inbox: 'i@example.com' })).toEqual({ status: 'failed' });
    error.mockRestore();
  });
});
