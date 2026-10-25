import Link from "next/link";
import { categoryName, gradientStyle, type CategoryDef } from "@/lib/categories";

export function categoryHref(c: CategoryDef): string {
  if (c.slug === "sports") return "/sports";
  if (c.parent === "sports") return `/sports/${c.slug}`;
  return `/events/category/${c.slug}`;
}

export default function CategoryTiles({ categories, compact = false }: { categories: CategoryDef[]; compact?: boolean }) {
  return (
    <div className={compact ? "flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"}>
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={categoryHref(c)}
          style={gradientStyle(c)}
          className={`group relative flex snap-start items-end overflow-hidden rounded-2xl p-3 text-white shadow-sm transition-transform hover:-translate-y-0.5 ${compact ? "h-28 w-28 shrink-0" : "h-28 sm:h-32"}`}
        >
          <span className="absolute right-2 top-1 text-4xl opacity-90 transition-transform group-hover:scale-110" aria-hidden>
            {c.emoji}
          </span>
          <span className="relative text-sm font-extrabold leading-tight drop-shadow">{categoryName(c.slug)}</span>
        </Link>
      ))}
    </div>
  );
}
