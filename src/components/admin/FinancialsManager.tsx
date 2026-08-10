"use client";

import { useActionState, useTransition } from "react";
import {
  addFinancialAction,
  deleteFinancialAction,
  type ActionState,
} from "@/lib/actions/companies";
import type { CompanyFinancial } from "@/lib/types/database";

export function FinancialsManager({
  companyId,
  financials,
}: {
  companyId: string;
  financials: CompanyFinancial[];
}) {
  const boundAdd = addFinancialAction.bind(null, companyId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAdd, {});
  const [deleting, startDelete] = useTransition();

  return (
    <div className="space-y-4">
      {financials.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {financials.map((f) => (
            <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-foreground">{f.period_label}</span>{" "}
                <span className="text-muted">
                  ({f.period_type === "quarter" ? "Quarter" : "Fiscal Year"}) —{" "}
                  {f.revenue_display ?? "Not publicly disclosed"}
                </span>
              </span>
              <button
                type="button"
                disabled={deleting}
                onClick={() => startDelete(() => deleteFinancialAction(companyId, f.id))}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
        <div className="sm:col-span-1">
          <label className="mb-1 block text-xs font-medium text-muted">Type</label>
          <select
            name="period_type"
            required
            className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          >
            <option value="quarter">Quarter</option>
            <option value="fiscal_year">Fiscal Year</option>
          </select>
        </div>
        <div className="sm:col-span-1">
          <label className="mb-1 block text-xs font-medium text-muted">Label</label>
          <input
            name="period_label"
            required
            placeholder="Q1 FY27 / FY26"
            className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted">Revenue</label>
          <input
            name="revenue_display"
            placeholder="Not publicly disclosed"
            className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-1">
          <label className="mb-1 block text-xs font-medium text-muted">Sort order</label>
          <input
            name="sort_order"
            type="number"
            defaultValue={0}
            className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-5">
          {state.error && <p className="mb-2 text-sm text-danger">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50"
          >
            {pending ? "Adding…" : "+ Add revenue record"}
          </button>
        </div>
      </form>
    </div>
  );
}
