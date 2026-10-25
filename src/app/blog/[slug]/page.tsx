import { notFound } from "next/navigation";
import Link from "next/link";
import { getPostBySlug } from "@/lib/queries";
import { decodeSlug, safeHttpUrl } from "@/lib/url";
import { markdownToText, renderMarkdown } from "@/lib/markdown";
import { formatBangkok } from "@/lib/datetime";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { t } from "@/lib/i18n";
import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";

export const revalidate = 1800;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPostBySlug(decodeSlug((await params).slug));
  if (!post) return { title: t.notFound.title, robots: { index: false } };
  return pageMetadata({
    title: post.title,
    description: post.description ?? markdownToText(post.body_md, 180),
    path: `/blog/${post.slug}`,
    image: safeHttpUrl(post.cover_image_url),
    type: "article",
    publishedTime: post.published_at,
    modifiedTime: post.updated_at,
  });
}

export default async function BlogPost({ params }: Props) {
  const post = await getPostBySlug(decodeSlug((await params).slug));
  if (!post) notFound();
  const cover = safeHttpUrl(post.cover_image_url);
  const url = absoluteUrl(`/blog/${post.slug}`);
  // A leading "# Title" in the body would duplicate the page H1.
  const body = post.body_md.replace(/^\s*#\s+[^\n]+\n/, "");
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.description ?? undefined,
          datePublished: post.published_at,
          dateModified: post.updated_at,
          image: cover ? [cover] : undefined,
          mainEntityOfPage: url,
          url,
          keywords: post.tags?.join(", ") || undefined,
        }}
      />
      <Link href="/blog" className="text-sm font-semibold text-[color:var(--color-brand-600)] hover:underline">← {t.blog.back}</Link>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{post.title}</h1>
      <p className="mt-2 text-sm text-[color:var(--color-ink-soft)]">{formatBangkok(post.published_at, { day: "numeric", month: "long", year: "numeric" })}</p>
      {post.description && <p className="mt-4 text-lg text-[color:var(--color-ink-soft)]">{post.description}</p>}
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="mt-6 aspect-[16/9] w-full rounded-2xl object-cover" />
      )}
      <div className="prose-bke mt-8" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
      {post.tags && post.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[color:var(--color-brand-50)] px-2.5 py-1 text-xs font-semibold text-[color:var(--color-brand-700)]">#{tag}</span>
          ))}
        </div>
      )}
    </article>
  );
}
