import Link from "next/link";
import { t } from "@/lib/i18n";

export default function EmptyState({ title, body, cta = true }: { title: string; body?: string; cta?: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--color-line)] bg-white p-8 text-center">
      <div className="text-3xl" aria-hidden>🗓️</div>
      <p className="mt-2 font-bold">{title}</p>
      {body && <p className="mt-1 text-sm text-[color:var(--color-ink-soft)]">{body}</p>}
      {cta && (
        <Link href="/submit" className="mt-4 inline-block rounded-lg bg-[color:var(--color-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--color-brand-600)]">
          {t.nav.submit}
        </Link>
      )}
    </div>
  );
}
