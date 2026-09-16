import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getNewsById } from "@/lib/data/news";
import { NewsCard } from "@/components/viewer/NewsCard";

// The deep-link target for a "new article" push notification (see
// src/lib/push/send.ts and public/sw.js's notificationclick handler) -- the
// swipeable feed on "/" has no per-article URL of its own, so tapping a
// notification lands here instead, showing just that one article.
export default async function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const news = await getNewsById(supabase, id);

  // getNewsById selects through the same news_select_published_or_admin RLS
  // policy as everywhere else -- an unpublished article's id simply comes
  // back as no row for a non-admin viewer, not a separate check here.
  if (!news) notFound();

  return (
    <main className="flex flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-8">
      <Link href="/" className="mb-4 inline-block text-sm font-medium text-accent hover:underline">
        ← Back to feed
      </Link>
      <div className="mx-auto w-full max-w-2xl">
        <NewsCard news={news} index={0} />
      </div>
    </main>
  );
}
