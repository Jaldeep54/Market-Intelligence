import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSources } from "@/lib/data/sources";
import { fetchAllSourcesAction } from "@/lib/actions/sources";
import { SourcesTable } from "@/components/admin/SourcesTable";
import { FetchAllButton } from "@/components/admin/FetchAllButton";

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
