// <SignIn> in each state (methods, email sent, emailed link, errors) and
// the signed-in user in the rail: plain forms posting to the auth routes.
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';

import { Account } from './Account.tsx';
import { SignIn, type SignInMethod, type SignInParams } from './SignIn.tsx';

const methods: SignInMethod[] = [
  { id: 'google', label: 'Continue with Google', input: 'button', action: '/admin/auth/google', callback: '/admin/auth/google/callback' },
  { id: 'email', label: 'Email me a sign-in link', input: 'email', action: '/admin/auth/email', callback: '/admin/auth/email/callback' },
];

const setup = (params: SignInParams, list = methods) => render(() => <SignIn methods={list} params={params} />);
const formOf = (name: string) => screen.getByRole('button', { name }).closest('form')!;
const fieldsOf = (form: HTMLFormElement) => Object.fromEntries(new FormData(form));

describe('<SignIn>', () => {
  it('shows a form per method', () => {
    setup({ returnTo: '/admin?collection=posts' });
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(formOf('Continue with Google').getAttribute('action')).toBe('/admin/auth/google');
    expect(formOf('Continue with Google').method).toBe('post');
    expect(fieldsOf(formOf('Continue with Google'))).toEqual({ returnTo: '/admin?collection=posts' });
    const emailForm = formOf('Email me a sign-in link');
    expect(emailForm.getAttribute('action')).toBe('/admin/auth/email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('name', 'email');
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('asks for the code once an email is sent', () => {
    setup({ method: 'email', sent: 'ada@example.com' });
    expect(screen.getByText(/Check your email/).textContent).toContain('ada@example.com');
    const form = formOf('Sign in');
    expect(form.getAttribute('action')).toBe('/admin/auth/email/callback');
    expect(fieldsOf(form)).toEqual({ email: 'ada@example.com', code: '' });
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Use a different email' })).toHaveAttribute('href', '?');
  });

  it('posts an emailed link on a button press', () => {
    setup({ method: 'email', email: 'ada@example.com', token: 'tok', returnTo: '/admin' });
    const form = formOf('Continue');
    expect(form.getAttribute('action')).toBe('/admin/auth/email/callback');
    expect(fieldsOf(form)).toEqual({ email: 'ada@example.com', token: 'tok', returnTo: '/admin' });
  });

  it('explains errors', () => {
    setup({ error: 'denied' });
    expect(screen.getByRole('alert').textContent).toBe("That account doesn't have access to this admin.");
  });

  it('falls back to a general message for unknown errors', () => {
    setup({ error: '<script>' });
    expect(screen.getByRole('alert').textContent).toBe('Something went wrong signing in. Please try again.');
  });

  it('makes the only method the primary button', () => {
    setup({}, [methods[1]!]);
    expect(screen.queryByText('or')).toBeNull();
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument();
  });
});

describe('<Account>', () => {
  it('shows who is signed in and posts Sign out', () => {
    render(() => <Account user={{ email: 'ada@example.com', name: 'Ada' }} signOutUrl="/admin/auth/sign-out" />);
    expect(screen.getByRole('img', { name: 'Signed in as Ada (ada@example.com)' }).textContent).toBe('A');
    expect(formOf('Sign out').getAttribute('action')).toBe('/admin/auth/sign-out');
  });
});
