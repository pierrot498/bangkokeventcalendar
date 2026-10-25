import { t } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import EventSubmitForm from "@/components/EventSubmitForm";
import type { Metadata } from "next";

export const metadata: Metadata = pageMetadata({ title: t.submit.title, description: t.submit.intro, path: "/submit" });

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.submit.title}</h1>
        <p className="mt-2 text-[color:var(--color-ink-soft)]">{t.submit.intro}</p>
      </header>
      <EventSubmitForm />
    </div>
  );
}
