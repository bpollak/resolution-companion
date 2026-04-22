/**
 * Date helpers shared across screens. Historically each screen parsed
 * `logDate` slightly differently (`.split("T")[0]` here, `includes("T") ?` there)
 * which made timezone bugs easy to write and hard to find.
 */

export function toDateKey(isoOrDateOnly: string): string {
  if (!isoOrDateOnly) return "";
  return isoOrDateOnly.includes("T")
    ? isoOrDateOnly.split("T")[0]
    : isoOrDateOnly;
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isSubscriptionActive(
  isPremium: boolean,
  expiresAt: string | null | undefined,
): boolean {
  if (!isPremium) return false;
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return false;
  return expiry > Date.now();
}
