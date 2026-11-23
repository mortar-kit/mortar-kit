// Example brick that handles a form: a contact form that works without
// JavaScript. It renders a plain form that posts to CONTACT_PATH; the
// server handler (src/server/contact.ts, run from the middleware) checks
// the post, emails it through a Mailer and redirects back here with
// `?contact=<status>#contact`, which this brick reads to show the result.
// Editors set the copy; where messages go is server config (CONTACT_TO),
// never a field the browser sends.
import { defineBrick, fields } from '@mortar-kit/core';
import { useLocation, useSearchParams } from '@solidjs/router';
import { Match, Show, Switch } from 'solid-js';

import { CONTACT_ANCHOR, CONTACT_HONEYPOT, CONTACT_LIMITS, CONTACT_PATH, CONTACT_STATUS } from '../contact.ts';
import styles from './contact-form.module.css';

export const contactForm = defineBrick({
  name: 'contact-form',
  label: 'Contact form',
  schema: {
    heading: fields.text({ label: 'Heading', default: 'Get in touch' }),
    intro: fields.textarea({ label: 'Intro', default: 'Questions, ideas, a bug you found: send us a message.' }),
    buttonLabel: fields.text({ label: 'Button label', required: true, default: 'Send message' }),
    sentMessage: fields.textarea({
      label: 'After sending',
      help: 'Shown in place of the form once a message is sent.',
      default: 'Thanks! Your message is on its way, and we will reply by email.',
    }),
  },
  component: (props) => {
    const location = useLocation();
    const [search] = useSearchParams();
    const status = () => search[CONTACT_STATUS];
    return (
      <section class={styles.contact} id={CONTACT_ANCHOR}>
        <Show when={props.data.heading}>
          <h2>{props.data.heading}</h2>
        </Show>
        <Show
          when={status() !== 'sent'}
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
            <Match when={status() === 'invalid'}>
              <p class={styles.error} role="alert">
                Please fill in your name, a valid email address and a message.
              </p>
            </Match>
            <Match when={status() === 'busy'}>
              <p class={styles.error} role="alert">
                That's a lot of messages. Please wait a few minutes and try again.
              </p>
            </Match>
            <Match when={status() === 'failed'}>
              <p class={styles.error} role="alert">
                Sorry, your message couldn't be sent. Please try again later.
              </p>
            </Match>
          </Switch>
          <form class={styles.form} method="post" action={CONTACT_PATH}>
            <input type="hidden" name="return" value={location.pathname} />
            <label>
              Name
              <input name="name" autocomplete="name" required maxlength={CONTACT_LIMITS.name} />
            </label>
            <label>
              Email
              <input name="email" type="email" autocomplete="email" required maxlength={CONTACT_LIMITS.email} />
            </label>
            <label>
              Message
              <textarea name="message" rows="6" required maxlength={CONTACT_LIMITS.message} />
            </label>
            <label class={styles.honeypot} aria-hidden="true">
              Leave this empty
              <input name={CONTACT_HONEYPOT} tabindex="-1" autocomplete="off" />
            </label>
            <button class={styles.button} type="submit">
              {props.data.buttonLabel}
            </button>
          </form>
        </Show>
      </section>
    );
  },
});
