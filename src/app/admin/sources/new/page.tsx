import { createSourceAction } from "@/lib/actions/sources";
import { SourceForm } from "@/components/admin/SourceForm";

export default function NewSourcePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Add Source</h1>
      <SourceForm action={createSourceAction} submitLabel="Add source" />
    </div>
  );
}
