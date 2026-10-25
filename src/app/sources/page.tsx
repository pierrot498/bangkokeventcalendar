import Link from "next/link";
import { listSources } from "@/lib/queries";
import { categoryName } from "@/lib/categories";
import { formatBangkok } from "@/lib/datetime";
import { hostOf, safeHttpUrl } from "@/lib/url";
import { t } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import EmptyState from "@/components/EmptyState";
import type { Metadata } from "next";
import type { SourceRow } from "@/lib/supabase/types";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({ title: t.sources.title, description: t.sources.intro, path: "/sources" });

export default async function SourcesPage() {
  const sources = await listSources();
  const groups = new Map<string, SourceRow[]>();
  for (const s of sources) {
    const k = s.kind?.trim() || "other";
    (groups.get(k) ?? groups.set(k, []).get(k))!.push(s);
  }
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.sources.title}</h1>
        <p className="mt-2 text-[color:var(--color-ink-soft)]">
          {t.sources.intro} <Link href="/submit" className="font-semibold text-[color:var(--color-brand-600)] hover:underline">{t.nav.submit}</Link>
        </p>
      </header>
      {sources.length === 0 && <EmptyState title={t.sources.empty} cta={false} />}
      {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([kind, rows]) => (
        <section key={kind} className="space-y-3">
          <h2 className="text-lg font-bold capitalize">{kind.replace(/[-_]/g, " ")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((s) => {
              const href = safeHttpUrl(s.url);
              return (
                <li key={s.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold">
                      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--color-brand-600)]">{s.name} ↗</a> : s.name}
                    </div>
                    {s.category_slug && <span className="pill bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]">{categoryName(s.category_slug)}</span>}
                  </div>
                  {href && <div className="text-xs text-[color:var(--color-ink-soft)]">{hostOf(href)}</div>}
                  {s.notes && <p className="mt-2 text-sm text-[color:var(--color-ink-soft)]">{s.notes}</p>}
                  {s.last_checked_at && <p className="mt-2 text-[11px] text-[color:var(--color-ink-soft)]">{t.sources.lastChecked}: {formatBangkok(s.last_checked_at, { day: "numeric", month: "short", year: "numeric" })}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
