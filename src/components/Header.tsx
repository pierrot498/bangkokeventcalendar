import Link from "next/link";
import { t } from "@/lib/i18n";
import { LOGO } from "@/lib/site";

const NAV = [
  { href: "/events", label: t.nav.events },
  { href: "/calendar", label: t.nav.calendar },
  { href: "/sports", label: t.nav.sports },
  { href: "/blog", label: t.nav.blog },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-line)] bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO.wordmark} alt={t.site.name} width={108} height={36} className="h-9 w-auto" />
        </Link>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto text-sm font-semibold">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-2.5 py-1.5 text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-brand-50)] hover:text-[color:var(--color-ink)] whitespace-nowrap">
              {n.label}
            </Link>
          ))}
          <Link href="/submit" className="ml-1 rounded-lg bg-[color:var(--color-ink)] px-3 py-1.5 text-white whitespace-nowrap hover:opacity-90">
            <span className="sm:hidden">+</span>
            <span className="hidden sm:inline">{t.nav.submit}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
