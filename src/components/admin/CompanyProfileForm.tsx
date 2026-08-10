"use client";

import { useActionState } from "react";
import { updateCompanyProfileAction, type ActionState } from "@/lib/actions/companies";
import type { CompanyFull } from "@/lib/types/database";

function Field({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder="Not publicly disclosed"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}

export function CompanyProfileForm({ company }: { company: CompanyFull }) {
  const boundAction = updateCompanyProfileAction.bind(null, company.id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, {});

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label htmlFor="overview" className="mb-1 block text-sm font-medium text-foreground">
          Overview <span className="text-xs font-normal text-muted">(up to ~100 words)</span>
        </label>
        <textarea
          id="overview"
          name="overview"
          rows={4}
          defaultValue={company.overview ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Manufacturing Capacity</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Module Capacity" name="module_capacity" defaultValue={company.capacity?.module_capacity} />
          <Field
            label="Planned Module Capacity"
            name="planned_module_capacity"
            defaultValue={company.capacity?.planned_module_capacity}
          />
          <Field label="Cell Capacity" name="cell_capacity" defaultValue={company.capacity?.cell_capacity} />
          <Field
            label="Planned Cell Capacity"
            name="planned_cell_capacity"
            defaultValue={company.capacity?.planned_cell_capacity}
          />
          <Field
            label="Wafer/Ingot Capacity"
            name="wafer_capacity"
            defaultValue={company.capacity?.wafer_capacity}
          />
          <Field
            label="Planned Wafer/Ingot Capacity"
            name="planned_wafer_capacity"
            defaultValue={company.capacity?.planned_wafer_capacity}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Top Management</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Owner / Promoter" name="owner_promoter" defaultValue={company.management?.owner_promoter} />
          <Field label="CEO / MD" name="ceo_md" defaultValue={company.management?.ceo_md} />
          <Field label="CTO" name="cto" defaultValue={company.management?.cto} />
          <Field label="CFO" name="cfo" defaultValue={company.management?.cfo} />
        </div>
      </div>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.success && <p className="text-sm text-accent">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
