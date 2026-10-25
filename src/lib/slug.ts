// URL slug helpers shared by the site, the seed loader and the daily jobs.
// Keeps Thai letters (and their combining marks) so a Thai-only title still
// gets a usable slug; everything else collapses to single dashes.
export function slugify(input: string, maxLength = 80): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip Latin accents (Thai marks are not in this range)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return s || "item";
}
