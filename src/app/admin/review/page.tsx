import { createClient } from "@/lib/supabase/server";
import { getInboxCandidates } from "@/lib/data/candidates";
import { getCompanies } from "@/lib/data/companies";
import { AdminReviewList } from "@/components/admin/AdminReviewList";

export default async function AdminReviewPage() {
  const supabase = await createClient();
  const [candidates, companies] = await Promise.all([getInboxCandidates(supabase, {}), getCompanies(supabase)]);

  const queue = candidates.filter((c) => c.status !== "published" && c.status !== "rejected");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Admin News View</h1>
        <p className="mt-1 text-sm text-muted">
          Mobile-friendly review queue, newest first. Publish, reject, or delete straight from each card -- use
          News Inbox for bulk triage and filtering.
        </p>
      </div>

      <AdminReviewList candidates={queue} companies={companies} />
    </div>
  );
}
