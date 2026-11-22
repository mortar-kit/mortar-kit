// <SignIn>: the admin's sign-in page. One form per method (a button, or an
// email field), then, once an email is sent, a field for its code; an
// emailed link lands here too and is posted with a button press. Plain
// HTML forms posting to the auth routes (`@mortar-kit/auth`), so it works
// before, or without, any JavaScript. Methods and messages come from the
// app: the route passes `auth.methods` and the page's search parameters.
import { For, Match, Show, Switch } from 'solid-js';

import { Mark } from './Mark.tsx';
import styles from './SignIn.module.css';
import './tokens.css';
import './theme-slot.css';

/** A sign-in method, as `auth.methods` (`@mortar-kit/auth`) lists it. */
export interface SignInMethod {
  id: string;
  label: string;
  input: 'button' | 'email';
  /** Path the method's form posts to. */
  action: string;
  /** Path an emailed code or link is posted to. */
  callback: string;
}

/** The sign-in page's search parameters, as the auth routes set them. */
export interface SignInParams {
  /** Why the last attempt failed: `denied`, `expired`, `invalid`, `invalid-email` or `failed`. */
  error?: string;
  /** With `sent`: the email method that sent it. */
  method?: string;
  /** The address an email was sent to (if it may sign in). */
  sent?: string;
  /** From an emailed link: its address and token. */
  email?: string;
  token?: string;
  /** Where to go after signing in. */
  returnTo?: string;
}

export interface SignInProps {
  /** The ways to sign in: `auth.methods`. */
  methods: readonly SignInMethod[];
  /** The page's search parameters. */
  params: SignInParams;
  /** Heading. Default "Sign in". */
  title?: string;
}

const MESSAGES: Record<string, string> = {
  denied: "That account doesn't have access to this admin.",
  expired: 'That sign-in has expired. Please start again.',
  invalid: "That code or link isn't right. Please try again.",
  'invalid-email': 'Enter a valid email address.',
  failed: 'Something went wrong signing in. Please try again.',
};

/** The sign-in page. Render it from the route at `auth.signInPath`. */
export function SignIn(props: SignInProps) {
  const emailMethod = (id: string | undefined) => props.methods.find((m) => m.input === 'email' && m.id === id);
  const linked = () => (props.params.email && props.params.token ? (emailMethod(props.params.method) ?? props.methods.find((m) => m.input === 'email')) : undefined);
  const sent = () => (props.params.sent ? emailMethod(props.params.method) : undefined);
  const buttons = () => props.methods.filter((m) => m.input === 'button');
  const emails = () => props.methods.filter((m) => m.input === 'email');
  const startOver = () => (props.params.returnTo ? `?${new URLSearchParams({ returnTo: props.params.returnTo })}` : '?');

  return (
    <main class={styles.page}>
      <div class={styles.card}>
        <Mark />
        <h1 class={styles.title}>{props.title ?? 'Sign in'}</h1>
        <Show when={props.params.error}>
          {(error) => (
            <p role="alert" class={styles.error}>
              {MESSAGES[error()] ?? MESSAGES.failed}
            </p>
          )}
        </Show>
        <Switch
          fallback={
            <>
              <For each={buttons()}>
                {(m) => (
                  <form method="post" action={m.action} class={styles.form}>
                    <ReturnTo value={props.params.returnTo} />
                    <button type="submit" class={styles.primary}>
                      {m.label}
                    </button>
                  </form>
                )}
              </For>
              <Show when={buttons().length > 0 && emails().length > 0}>
                <p class={styles.or}>or</p>
              </Show>
              <For each={emails()}>
                {(m) => (
                  <form method="post" action={m.action} class={styles.form}>
                    <ReturnTo value={props.params.returnTo} />
                    <label class={styles.field}>
                      <span>Email</span>
                      <input class={styles.input} type="email" name="email" required autocomplete="email" placeholder="you@example.com" />
                    </label>
                    <button type="submit" class={buttons().length > 0 ? styles.secondary : styles.primary}>
                      {m.label}
                    </button>
                  </form>
                )}
              </For>
              <Show when={props.methods.length === 0}>
                <p class={styles.help}>No sign-in methods are set up.</p>
              </Show>
            </>
          }
        >
          <Match when={linked()}>
            {(m) => (
              <form method="post" action={m().callback} class={styles.form}>
                <p class={styles.help}>
                  Sign in as <strong>{props.params.email}</strong>?
                </p>
                <input type="hidden" name="email" value={props.params.email} />
                <input type="hidden" name="token" value={props.params.token} />
                <ReturnTo value={props.params.returnTo} />
                <button type="submit" class={styles.primary}>
                  Continue
                </button>
                <a class={styles.link} href={startOver()}>
                  Not you? Start again
                </a>
              </form>
            )}
          </Match>
          <Match when={sent()}>
            {(m) => (
              <form method="post" action={m().callback} class={styles.form}>
                <p class={styles.help}>
                  Check your email. If <strong>{props.params.sent}</strong> can sign in, we sent it a code and a link.
                </p>
                <input type="hidden" name="email" value={props.params.sent} />
                <ReturnTo value={props.params.returnTo} />
                <label class={styles.field}>
                  <span>Code</span>
                  <input
                    class={styles.input}
                    name="code"
                    required
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    pattern="\s*(\d\s*){6}"
                    maxlength={12}
                    placeholder="123456"
                  />
                </label>
                <button type="submit" class={styles.primary}>
                  Sign in
                </button>
                <a class={styles.link} href={startOver()}>
                  Use a different email
                </a>
              </form>
            )}
          </Match>
        </Switch>
      </div>
    </main>
  );
}

function ReturnTo(props: { value: string | undefined }) {
  return (
    <Show when={props.value}>
      <input type="hidden" name="returnTo" value={props.value} />
    </Show>
  );
}
