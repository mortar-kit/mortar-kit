// allowMembers: an `authorize` backed by one of the site's collections, so
// editors manage who may sign in from the admin itself. Mortar ships no
// collections: the site declares its own (e.g. `members`, with an email field).
import type { ContentSource } from '@mortar-kit/core';

import type { EmailUser } from './allow.ts';
import type { AuthorizeInput } from './auth.ts';

/** Options for `allowMembers`. */
export interface AllowMembersOptions<Field extends string = never> {
  /** Where to look members up: usually the app's `createContent(...)`. */
  content: ContentSource;
  /** The collection's name, e.g. `'members'`. */
  collection: string;
  /** The field holding each member's address. Default `email`. */
  emailField?: string;
  /** A field holding their display name, used over the one the sign-in method gives. Default `name`. */
  nameField?: string;
  /**
   * More of the member's fields to put on the user, as stored (e.g.
   * `['role']`), for `canWrite` and the rest of the app to read.
   */
  fields?: readonly Field[];
}

/** The user `allowMembers` signs in: the address, a name, and the `fields` asked for. */
export type MemberUser<Field extends string = never> = EmailUser & { [K in Field]?: unknown };

/**
 * An `authorize` that lets in anyone whose address is in a document of
 * `collection` (compared case-insensitively). Removing the document locks
 * them out on their next request. It lists the collection each time, which
 * suits the handful of members a small site has.
 *
 * @example
 * ```ts
 * export const members = defineCollection({
 *   name: 'members',
 *   label: 'Members',
 *   fields: { email: fields.text({ label: 'Email', required: true }), name: fields.text({ label: 'Name' }) },
 * });
 * createAuth({ methods, secret, authorize: allowMembers({ content, collection: 'members' }) });
 *
 * // With roles: the user gets the member's `role` too.
 * authorize: allowMembers({ content, collection: 'members', fields: ['role'] }),
 * ```
 */
export function allowMembers<Field extends string = never>(options: AllowMembersOptions<Field>): (input: AuthorizeInput) => Promise<MemberUser<Field> | null> {
  const emailField = options.emailField ?? 'email';
  const nameField = options.nameField ?? 'name';
  return async ({ identity }) => {
    const email = identity.email.toLowerCase();
    const docs = await options.content.list(options.collection);
    const member = docs.find((doc) => {
      const value = doc.fields[emailField];
      return typeof value === 'string' && value.trim().toLowerCase() === email;
    });
    if (!member) return null;
    const stored = member.fields[nameField];
    const name = typeof stored === 'string' && stored.trim() ? stored.trim() : identity.name;
    const user: Record<string, unknown> = {};
    for (const field of options.fields ?? []) if (member.fields[field] !== undefined) user[field] = member.fields[field];
    user.email = email;
    if (name) user.name = name;
    return user as MemberUser<Field>;
  };
}
