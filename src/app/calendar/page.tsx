import { bangkokParts } from "@/lib/datetime";
import { t } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import MonthView from "./month-view";
import type { Metadata } from "next";

export const revalidate = 600;

export const metadata: Metadata = pageMetadata({
  title: t.calendar.title,
  description: `${t.calendar.intro} ${t.site.description}`,
  path: "/calendar",
});

export default function CalendarPage() {
  const now = bangkokParts(new Date());
  return <MonthView year={now.year} month0={now.month - 1} />;
}
