import { createClient } from "@/lib/supabase/server";
import { getInboxCandidates } from "@/lib/data/candidates";
import { getCompanies } from "@/lib/data/companies";
import { AdminReviewList } from "@/components/admin/AdminReviewList";

export default async function AdminReviewPage() {
  const supabase = await createClient();
  const [candidates, companies] = await Promise.all([getInboxCandidates(supabase, {}), getCompanies(supabase)]);

  const queue = candidates.filter((c) => c.status !== "published" && c.status !== "rejected");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Admin News View</h1>
      </div>

      <AdminReviewList candidates={queue} companies={companies} />
    </div>
  );
}
