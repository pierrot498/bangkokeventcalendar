"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { ALL_CATEGORIES, categoryName } from "@/lib/categories";
import { bangkokLocalInputToIso } from "@/lib/datetime";

// Adapted from runclubbangkok's EventSubmitForm. Posts JSON to
// /api/submissions/event; datetime inputs are read as Bangkok wall time.
type FieldType = "text" | "datetime-local" | "url" | "email" | "textarea" | "category" | "checkbox";
const FIELDS: { key: keyof typeof t.submit.fields; type: FieldType; required?: boolean; full?: boolean }[] = [
  { key: "title", type: "text", required: true, full: true },
  { key: "category", type: "category" },
  { key: "starts_at", type: "datetime-local", required: true },
  { key: "ends_at", type: "datetime-local" },
  { key: "venue_name", type: "text" },
  { key: "area", type: "text" },
  { key: "price_text", type: "text" },
  { key: "is_free", type: "checkbox" },
  { key: "ticket_url", type: "url" },
  { key: "image_url", type: "url" },
  { key: "source_url", type: "url" },
  { key: "description", type: "textarea", full: true },
  { key: "organizer_name", type: "text" },
  { key: "contact_email", type: "email" },
];

export default function EventSubmitForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const name = f.key === "category" ? "category_slug" : f.key;
      if (f.type === "checkbox") {
        payload[name] = fd.get(name) === "on";
        continue;
      }
      const raw = fd.get(name);
      if (raw == null || raw === "") continue;
      payload[name] = f.type === "datetime-local" ? bangkokLocalInputToIso(String(raw)) : String(raw).trim();
    }
    payload.website = fd.get("website") ?? "";
    try {
      const res = await fetch("/api/submissions/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "submit_failed");
      setDone(true);
    } catch (err) {
      setError(`${t.submit.error} (${err instanceof Error ? err.message : "submit_failed"})`);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[color:var(--color-line)] bg-white p-6 sm:p-8">
        <div className="text-2xl font-extrabold">{t.submit.done} 🎉</div>
        <p className="mt-2 text-[color:var(--color-ink-soft)]">{t.submit.doneBody}</p>
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[color:var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand-100)]";
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const name = f.key === "category" ? "category_slug" : f.key;
          const label = t.submit.fields[f.key];
          if (f.type === "checkbox") {
            return (
              <label key={f.key} className="flex items-center gap-2 self-end rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm">
                <input type="checkbox" name={name} className="h-4 w-4 accent-[color:var(--color-brand)]" />
                {label}
              </label>
            );
          }
          return (
            <label key={f.key} className={f.full ? "block sm:col-span-2" : "block"}>
              <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--color-ink-soft)]">
                {label}
                {f.required && <span className="ml-1 text-red-600">*</span>}
              </span>
              <div className="mt-1">
                {f.type === "textarea" ? (
                  <textarea name={name} rows={6} className={inputCls} />
                ) : f.type === "category" ? (
                  <select name={name} className={inputCls} defaultValue="">
                    <option value="">—</option>
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.parent ? "  " : ""}{c.emoji} {categoryName(c.slug)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name={name} type={f.type} required={f.required} className={inputCls} />
                )}
              </div>
            </label>
          );
        })}
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <button type="submit" disabled={busy} className="rounded-lg bg-[color:var(--color-brand)] px-6 py-3 font-bold text-white transition-colors hover:bg-[color:var(--color-brand-600)] disabled:opacity-50">
        {busy ? t.submit.sending : t.submit.send}
      </button>
    </form>
  );
}
