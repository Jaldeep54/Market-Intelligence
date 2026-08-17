import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSourceById } from "@/lib/data/sources";
import { updateSourceAction } from "@/lib/actions/sources";
import { SourceForm } from "@/components/admin/SourceForm";

export default async function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const source = await getSourceById(supabase, id);

  if (!source) notFound();

  const boundAction = updateSourceAction.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Edit Source</h1>
      <SourceForm action={boundAction} initial={source} submitLabel="Save changes" />
    </div>
  );
}
