import { notFound } from "next/navigation";
import { bangkokMonthStart, formatBangkok } from "@/lib/datetime";
import { t } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import MonthView from "../../month-view";
import type { Metadata } from "next";

export const revalidate = 600;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ yyyy: string; mm: string }> };

function parse(yyyy: string, mm: string): { year: number; month0: number } | null {
  if (!/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(mm)) return null;
  const year = Number(yyyy);
  const month0 = Number(mm) - 1;
  if (year < 2020 || year > 2100 || month0 < 0 || month0 > 11) return null;
  return { year, month0 };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { yyyy, mm } = await params;
  const p = parse(yyyy, mm);
  if (!p) return {};
  const label = formatBangkok(bangkokMonthStart(p.year, p.month0), { month: "long", year: "numeric" });
  return pageMetadata({
    title: `Bangkok events in ${label}`,
    description: `Everything happening in Bangkok in ${label}: concerts, nightlife, food, art, markets, festivals and sports. ${t.calendar.intro}`,
    path: `/calendar/${yyyy}/${mm}`,
  });
}

export default async function MonthPage({ params }: Props) {
  const { yyyy, mm } = await params;
  const p = parse(yyyy, mm);
  if (!p) notFound();
  return <MonthView year={p.year} month0={p.month0} />;
}
