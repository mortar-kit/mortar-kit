// allowEmails: a ready-made `authorize` for the common case, a fixed list
// of addresses (and whole domains) that may use the admin.
import type { AuthorizeInput } from './auth.ts';

/** The user `allowEmails` signs in. */
export interface EmailUser {
  email: string;
  name?: string;
}

/**
 * An `authorize` that lets in these addresses, compared case-insensitively;
 * `*@example.com` lets in a whole domain. Everyone else is refused.
 *
 * @example
 * ```ts
 * createAuth({ methods, secret, authorize: allowEmails(['ada@example.com', '*@team.example.com']) });
 * ```
 */
export function allowEmails(patterns: readonly string[]): (input: AuthorizeInput) => EmailUser | null {
  const exact = new Set<string>();
  const domains = new Set<string>();
  for (const raw of patterns) {
    const pattern = raw.trim().toLowerCase();
    if (pattern === '') continue;
    if (pattern.startsWith('*@')) domains.add(pattern.slice(2));
    else if (pattern.includes('*')) throw new Error(`Mortar auth: "${raw}" isn't an address or *@domain.`);
    else exact.add(pattern);
  }
  return ({ identity }) => {
    const email = identity.email.toLowerCase();
    const domain = email.slice(email.lastIndexOf('@') + 1);
    if (!exact.has(email) && !domains.has(domain)) return null;
    return identity.name ? { email, name: identity.name } : { email };
  };
}
