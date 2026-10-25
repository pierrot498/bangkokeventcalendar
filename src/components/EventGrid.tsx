import type { EventRow } from "@/lib/supabase/types";
import EventCard from "./EventCard";
import EmptyState from "./EmptyState";
import { t } from "@/lib/i18n";

export default function EventGrid({ events, empty }: { events: EventRow[]; empty?: string }) {
  if (events.length === 0) return <EmptyState title={empty ?? t.events.empty} body={t.events.emptyHint} />;
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}
