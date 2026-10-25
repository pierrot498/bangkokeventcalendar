import { listEvents } from "@/lib/queries";
import { bangkokMonthEnd, bangkokMonthStart } from "@/lib/datetime";
import { t } from "@/lib/i18n";
import Link from "next/link";
import MonthCalendar from "@/components/MonthCalendar";

export default async function MonthView({ year, month0 }: { year: number; month0: number }) {
  const events = await listEvents({ start: bangkokMonthStart(year, month0), end: bangkokMonthEnd(year, month0), limit: 1000 });
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.calendar.title}</h1>
          <p className="mt-1 text-[color:var(--color-ink-soft)]">{t.calendar.intro}</p>
        </div>
        <div className="flex gap-2 text-sm font-semibold">
          <Link href="/events" className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 hover:border-[color:var(--color-ink)]">{t.calendar.listView}</Link>
          <a href="/api/calendar.ics" className="rounded-lg bg-[color:var(--color-ink)] px-3 py-2 text-white hover:opacity-90">📅 {t.calendar.subscribe}</a>
        </div>
      </header>
      <MonthCalendar year={year} month0={month0} events={events} />
    </div>
  );
}
