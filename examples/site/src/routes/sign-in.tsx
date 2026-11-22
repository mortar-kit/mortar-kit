// Sign-in page, at /admin/sign-in: the methods come from the server, the
// state (email sent, an emailed link, an error) from the URL the auth
// routes redirect to. Plain forms, so it works before hydrating.
import { SignIn, type SignInParams } from '@mortar-kit/admin';
import { Title } from '@solidjs/meta';
import { useSearchParams } from '@solidjs/router';
import { createMemo } from 'solid-js';

import { getMethods } from '../content.ts';

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function SignInRoute() {
  const [search] = useSearchParams();
  const methods = createMemo(() => getMethods());
  const params = (): SignInParams => ({
    error: one(search.error),
    method: one(search.method),
    sent: one(search.sent),
    email: one(search.email),
    token: one(search.token),
    returnTo: one(search.returnTo),
  });
  return (
    <>
      <Title>Sign in · Mortar example</Title>
      <SignIn methods={methods()} params={params()} />
    </>
  );
}
