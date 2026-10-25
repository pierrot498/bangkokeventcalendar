import Link from "next/link";
import { t } from "@/lib/i18n";
import { BRAND, LOGO } from "@/lib/site";
import { TOP_CATEGORIES, SPORT_CATEGORIES, categoryName } from "@/lib/categories";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-[color:var(--color-line)] bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO.wordmark} alt={t.site.name} width={120} height={40} className="h-10 w-auto" />
          <p className="text-[color:var(--color-ink-soft)]">{t.footer.about}</p>
          <a href="/api/calendar.ics" className="inline-block font-semibold text-[color:var(--color-brand-600)] hover:underline">
            {t.footer.subscribe}
          </a>
        </div>
        <div>
          <div className="mb-2 font-bold">{t.nav.events}</div>
          <ul className="space-y-1">
            {TOP_CATEGORIES.filter((c) => c.slug !== "other").map((c) => (
              <li key={c.slug}>
                <Link href={c.slug === "sports" ? "/sports" : `/events/category/${c.slug}`} className="text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">
                  {categoryName(c.slug)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 font-bold">{t.nav.sports}</div>
          <ul className="space-y-1">
            {SPORT_CATEGORIES.slice(0, 10).map((c) => (
              <li key={c.slug}>
                <Link href={`/sports/${c.slug}`} className="text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">
                  {categoryName(c.slug)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 font-bold">More</div>
          <ul className="space-y-1">
            <li><Link href="/calendar" className="text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">{t.nav.calendar}</Link></li>
            <li><Link href="/blog" className="text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">{t.nav.blog}</Link></li>
            <li><Link href="/submit" className="text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">{t.nav.submit}</Link></li>
            <li><Link href="/sources" className="text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">{t.nav.sources}</Link></li>
            <li><a href={BRAND.sister.url} className="text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">{t.footer.sister}</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[color:var(--color-line)] py-4 text-center text-xs text-[color:var(--color-ink-soft)]">
        © {new Date().getFullYear()} {t.site.name}
      </div>
    </footer>
  );
}
