// Small display helpers shared by layouts and bricks.

/** "22 November 2026" for a YYYY-MM-DD date ('' stays ''). Formatted in UTC so server and browser agree. */
export function formatDate(date: string): string {
  if (!date) return '';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "£12.50". */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price);
}
