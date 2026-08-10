"use client";

import { useActionState, useTransition } from "react";
import {
  addTechnologyAction,
  deleteTechnologyAction,
  type ActionState,
} from "@/lib/actions/companies";
import { PRODUCTS, TECHNOLOGIES, type CompanyTechnology } from "@/lib/types/database";

export function TechnologiesManager({
  companyId,
  technologies,
}: {
  companyId: string;
  technologies: CompanyTechnology[];
}) {
  const boundAdd = addTechnologyAction.bind(null, companyId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAdd, {});
  const [deleting, startDelete] = useTransition();

  return (
    <div className="space-y-4">
      {technologies.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {technologies.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-foreground">{t.technology}</span>{" "}
                <span className="text-muted">
                  · {t.product} · {t.max_efficiency ?? "Not publicly disclosed"}
                </span>
              </span>
              <button
                type="button"
                disabled={deleting}
                onClick={() => startDelete(() => deleteTechnologyAction(companyId, t.id))}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Technology</label>
          <select
            name="technology"
            required
            className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          >
            {TECHNOLOGIES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Product</label>
          <select
            name="product"
            required
            className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          >
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Max Efficiency</label>
          <input
            name="max_efficiency"
            placeholder="e.g. 22.8%"
            className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50"
          >
            {pending ? "Adding…" : "+ Add row"}
          </button>
        </div>
        {state.error && (
          <p className="sm:col-span-4 text-sm text-danger">{state.error}</p>
        )}
      </form>
    </div>
  );
}
