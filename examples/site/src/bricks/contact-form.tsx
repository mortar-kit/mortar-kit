// Example brick that handles its own form: a contact form. Its `action`
// runs on the server (Mortar reads the entry's stored data, so the "Send
// to" address can't be swapped by a visitor), checks the post and emails
// it; the component shows the result from `props.submission`. It's
// `interactive`: on a public page it hydrates on its own (an island), so
// the form posts in the background and only this brick updates; without
// JavaScript the post comes back to the page with the result. The mailer comes from the action's context
// (src/server/mail.ts), so this module, which the browser loads too,
// imports nothing from the server.
import { ActionForm, defineBrick, fields } from '@mortar-kit/core';
import { Match, Show, Switch } from 'solid-js';

import styles from './contact-form.module.css';

/** Longest values the form takes, enforced by the browser (maxlength) and again by the action. */
export const CONTACT_LIMITS = { name: 100, email: 254, message: 5000 } as const;

/** What the action answers: sent, or what was wrong, with the values to fill back in. */
export type ContactResult = { status: 'sent' } | { status: 'invalid'; values: { name: string; email: string; message: string } } | { status: 'failed' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

export const contactForm = defineBrick({
  name: 'contact-form',
  label: 'Contact form',
  interactive: true,
  schema: {
    heading: fields.text({ label: 'Heading', default: 'Get in touch' }),
    intro: fields.textarea({ label: 'Intro', default: 'Questions, ideas, a bug you found: send us a message.' }),
    buttonLabel: fields.text({ label: 'Button label', required: true, default: 'Send message' }),
    sentMessage: fields.textarea({
      label: 'After sending',
      help: 'Shown in place of the form once a message is sent.',
      default: 'Thanks! Your message is on its way, and we will reply by email.',
    }),
    // Private: the island sent to the browser leaves it out, so the address stays off the public page.
    to: fields.text({ label: 'Send to', help: "Where messages go. Empty: the site's inbox (CONTACT_TO).", private: true }),
  },
  async action({ form, data, context }): Promise<ContactResult> {
    // The honeypot: hidden from people, so a value means a bot. Pretend it worked.
    if (text(form, 'website')) return { status: 'sent' };
    // No line breaks in the name: it goes in the subject.
    const values = { name: text(form, 'name').replace(/\s+/g, ' '), email: text(form, 'email'), message: text(form, 'message') };
    const ok =
      values.name.length > 0 &&
      values.name.length <= CONTACT_LIMITS.name &&
      EMAIL.test(values.email) &&
      values.email.length <= CONTACT_LIMITS.email &&
      values.message.length > 0 &&
      values.message.length <= CONTACT_LIMITS.message;
    if (!ok) return { status: 'invalid', values };
    const to = data.to.trim() || context.inbox;
    if (!context.mailer || !to) return { status: 'failed' };
    try {
      await context.mailer.send({
        to,
        replyTo: values.email,
        subject: `Contact form: ${values.name}`,
        text: `${values.name} <${values.email}> wrote:\n\n${values.message}\n`,
      });
    } catch (error) {
      console.error('Contact form: the message was not sent.', error);
      return { status: 'failed' };
    }
    return { status: 'sent' };
  },
  component: (props) => {
    const result = () => props.submission?.result;
    const values = () => {
      const r = result();
      return r?.status === 'invalid' ? r.values : undefined;
    };
    return (
      <section class={styles.contact}>
        <Show when={props.data.heading}>
          <h2>{props.data.heading}</h2>
        </Show>
        <Show
          when={result()?.status !== 'sent'}
          fallback={
            <p class={styles.sent} role="status">
              {props.data.sentMessage}
            </p>
          }
        >
          <Show when={props.data.intro}>
            <p>{props.data.intro}</p>
          </Show>
          <Switch>
            <Match when={result()?.status === 'invalid'}>
              <p class={styles.error} role="alert">
                Please fill in your name, a valid email address and a message.
              </p>
            </Match>
            <Match when={result()?.status === 'failed' || props.submission?.error !== undefined}>
              <p class={styles.error} role="alert">
                Sorry, your message couldn't be sent. Please try again later.
              </p>
            </Match>
          </Switch>
          <ActionForm class={styles.form}>
            <label>
              Name
              <input name="name" autocomplete="name" required maxlength={CONTACT_LIMITS.name} value={values()?.name ?? ''} />
            </label>
            <label>
              Email
              <input name="email" type="email" autocomplete="email" required maxlength={CONTACT_LIMITS.email} value={values()?.email ?? ''} />
            </label>
            <label>
              Message
              <textarea name="message" rows="6" required maxlength={CONTACT_LIMITS.message} value={values()?.message ?? ''} />
            </label>
            <label class={styles.honeypot} aria-hidden="true">
              Leave this empty
              <input name="website" tabindex="-1" autocomplete="off" />
            </label>
            <button class={styles.button} type="submit" disabled={props.submission?.pending}>
              {props.data.buttonLabel}
            </button>
          </ActionForm>
        </Show>
      </section>
    );
  },
});
