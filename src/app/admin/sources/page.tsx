import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSources } from "@/lib/data/sources";
import { fetchAllSourcesAction } from "@/lib/actions/sources";
import { SourcesTable } from "@/components/admin/SourcesTable";
import { FetchAllButton } from "@/components/admin/FetchAllButton";

// Raises the Server Actions invoked from this route (fetchAllSourcesAction
// here, fetchSourceNowAction per-row inside SourcesTable) past Vercel's
// default execution ceiling (10s on the Hobby plan). Both now run a full
// sequential Gemini call per newly discovered article (auto-prepare) on top
// of the RSS fetch/dedupe/relevance work that used to comfortably fit in
// the old default -- without this, a source (or several, on "Fetch All")
// with more than a couple of new articles could get killed by the platform
// mid-request, silently dropping every article after whichever one was
// mid-flight with no exception the app's own code could catch or log. This
// can't be exported from src/lib/actions/sources.ts itself -- Next.js's
// "use server" file compiler only allows async-function exports there, and
// rejects a plain const like this one. If your Vercel plan caps maxDuration
// below 60, Vercel clamps to that plan's ceiling rather than failing the
// deploy.
export const maxDuration = 60;

export default async function AdminSourcesPage() {
  const supabase = await createClient();
  const sources = await getSources(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">News Sources</h1>
          <p className="mt-1 text-sm text-muted">
            Sources checked automatically every 2 hours. Add the ones you want monitored.
          </p>
        </div>
        <Link
          href="/admin/sources/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          + Add Source
        </Link>
      </div>

      <FetchAllButton action={fetchAllSourcesAction} />

      <SourcesTable sources={sources} />
    </div>
  );
}
