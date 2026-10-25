import Link from "next/link";
import type { PostRow } from "@/lib/supabase/types";
import { formatBangkok } from "@/lib/datetime";
import { safeHttpUrl } from "@/lib/url";
import { gradientStyle, TOP_CATEGORIES, getCategory } from "@/lib/categories";

export default function PostCard({ post }: { post: PostRow }) {
  const img = safeHttpUrl(post.cover_image_url);
  const visual = getCategory(post.category) ?? TOP_CATEGORIES[3];
  return (
    <Link href={`/blog/${post.slug}`} className="card group block overflow-hidden">
      <div className="aspect-[16/9] overflow-hidden" style={img ? undefined : gradientStyle(visual)}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center text-5xl" aria-hidden>{visual.emoji}</div>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs text-[color:var(--color-ink-soft)]">{formatBangkok(post.published_at, { day: "numeric", month: "long", year: "numeric" })}</p>
        <h3 className="mt-1 font-bold leading-snug group-hover:text-[color:var(--color-brand-600)]">{post.title}</h3>
        {post.description && <p className="mt-1 line-clamp-2 text-sm text-[color:var(--color-ink-soft)]">{post.description}</p>}
      </div>
    </Link>
  );
}
