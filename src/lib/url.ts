// Decode a dynamic-route param defensively (copied from runclubbangkok).
export function decodeSlug(value: string): string {
  if (!value || !value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Return the URL only when it parses and uses http(s); otherwise null. Use
// wherever a DB-supplied string becomes an href.
export function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(input: string | null | undefined): string | null {
  const safe = safeHttpUrl(input);
  if (!safe) return null;
  return new URL(safe).hostname.replace(/^www\./, "");
}
