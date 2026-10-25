import Link from "next/link";
import { t } from "@/lib/i18n";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <div className="text-5xl" aria-hidden>🧭</div>
      <h1 className="mt-4 text-3xl font-extrabold">{t.notFound.title}</h1>
      <p className="mt-2 text-[color:var(--color-ink-soft)]">{t.notFound.body}</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-[color:var(--color-brand)] px-5 py-2.5 font-semibold text-white">{t.notFound.home}</Link>
    </div>
  );
}
