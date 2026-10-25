import { listPosts } from "@/lib/queries";
import { t } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import PostCard from "@/components/PostCard";
import EmptyState from "@/components/EmptyState";
import type { Metadata } from "next";

export const revalidate = 1800;

export const metadata: Metadata = pageMetadata({ title: `${t.blog.title}: Bangkok guides`, description: t.blog.intro, path: "/blog" });

export default async function BlogIndex() {
  const posts = await listPosts(100);
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.blog.title}</h1>
        <p className="mt-1 text-[color:var(--color-ink-soft)]">{t.blog.intro}</p>
      </header>
      {posts.length === 0 ? (
        <EmptyState title={t.blog.empty} cta={false} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}
