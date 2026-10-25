import Link from "next/link";
import { t } from "@/lib/i18n";
import { SPORT_CATEGORIES, TOP_CATEGORIES, categoryName } from "@/lib/categories";
import { filtersToHref, type EventFilters as F } from "@/lib/filters";

// Plain GET form (works without JS) + one-tap date chips.
export default function EventFilters({ filters, areas }: { filters: F; areas: string[] }) {
  const f = t.events.filters;
  const chips: { key: F["when"]; label: string }[] = [
    { key: null, label: f.anyTime },
    { key: "today", label: f.today },
    { key: "weekend", label: f.weekend },
    { key: "week", label: f.week },
    { key: "month", label: f.month },
  ];
  const sel = "w-full rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[color:var(--color-brand-500)] focus:outline-none";
  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chips.map((c) => {
          const active = filters.when === c.key;
          return (
            <Link
              key={c.label}
              href={filtersToHref({ ...filters, when: c.key, page: 1 })}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold ${active ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-white" : "border-[color:var(--color-line)] bg-white hover:border-[color:var(--color-ink)]"}`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>
      <form method="get" action="/events" className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
        {filters.when && <input type="hidden" name="when" value={filters.when} />}
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-ink-soft)]">{f.category}</span>
          <select name="category" defaultValue={filters.category ?? ""} className={sel}>
            <option value="">{f.allCategories}</option>
            {TOP_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.emoji} {categoryName(c.slug)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-ink-soft)]">{f.sport}</span>
          <select name="sport" defaultValue={filters.sport ?? ""} className={sel}>
            <option value="">{f.allSports}</option>
            {SPORT_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.emoji} {categoryName(c.slug)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-ink-soft)]">{f.area}</span>
          <select name="area" defaultValue={filters.area ?? ""} className={sel}>
            <option value="">{f.allAreas}</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
            {filters.area && !areas.includes(filters.area) && <option value={filters.area}>{filters.area}</option>}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm">
          <input type="checkbox" name="free" value="1" defaultChecked={filters.free} className="h-4 w-4 accent-[color:var(--color-brand)]" />
          {f.freeOnly}
        </label>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button type="submit" className="flex-1 rounded-lg bg-[color:var(--color-brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[color:var(--color-brand-600)]">{f.apply}</button>
          <Link href="/events" className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm font-semibold">{f.reset}</Link>
        </div>
      </form>
    </div>
  );
}
