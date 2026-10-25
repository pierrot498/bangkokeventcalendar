import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

export default function Section({ title, href, children, id }: { title: string; href?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
        {href && (
          <Link href={href} className="text-sm font-semibold text-[color:var(--color-brand-600)] hover:underline whitespace-nowrap">
            {t.home.seeAll} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
