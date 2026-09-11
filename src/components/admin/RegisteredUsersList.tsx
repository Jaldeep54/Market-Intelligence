"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/shared/Modal";
import { approveUserAction, rejectUserAction, setUserPasswordAction } from "@/lib/actions/users";
import type { ProfileStatus, Role } from "@/lib/types/database";

interface UserRow {
  id: string;
  email: string;
  role: Role;
  status: ProfileStatus;
  created_at: string;
}

const STATUS_STYLES: Record<ProfileStatus, string> = {
  pending: "bg-amber-500/10 text-amber-600",
  approved: "bg-accent/10 text-accent",
  rejected: "bg-danger/10 text-danger",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Approve/Reject for one pending row. Same synchronous submittingRef guard
// used elsewhere in this codebase (e.g. AddProductRow) against a click
// firing twice before useTransition's `pending` state catches up.
function PendingRowActions({
  userId,
  onResolved,
}: {
  userId: string;
  onResolved: (userId: string, status: "approved" | "rejected") => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function run(action: (id: string) => Promise<{ error?: string }>, status: "approved" | "rejected") {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(userId);
        if (result.error) {
          setError(result.error);
          return;
        }
        onResolved(userId, status);
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(approveUserAction, "approved")}
          className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(rejectUserAction, "rejected")}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// "Set new password" for any row, any status -- opens a modal, lets the
// admin type a password or leave it blank to auto-generate one, then shows
// the result exactly once. Nothing here is persisted client-side beyond
// this component's own state, and it's gone once the modal closes.
function SetPasswordControl({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [typedPassword, setTypedPassword] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function close() {
    setOpen(false);
    setTypedPassword("");
    setResult(null);
    setError(null);
  }

  function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await setUserPasswordAction(userId, typedPassword);
        if (res.error) {
          setError(res.error);
          return;
        }
        setResult(res.password ?? null);
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
      >
        Set new password
      </button>
      <Modal open={open} onClose={close} title={`Set new password for ${email}`}>
        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              New password for <span className="font-medium">{email}</span> -- copy it now and relay
              it to them directly. It will not be shown again.
            </p>
            <p className="select-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground">
              {result}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={close}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-foreground">
                New password (leave blank to generate one)
              </label>
              <input
                id="new-password"
                type="text"
                value={typedPassword}
                onChange={(e) => setTypedPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Setting…" : "Set password"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export function RegisteredUsersList({ profiles }: { profiles: UserRow[] }) {
  const [users, setUsers] = useState(profiles);

  function handleResolved(userId: string, status: "approved" | "rejected") {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status } : u)));
  }

  const pendingUsers = users.filter((u) => u.status === "pending");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Registered Users</h1>
        <p className="mt-1 text-sm text-muted">
          {users.length} registered user{users.length === 1 ? "" : "s"}. Roles are managed directly
          in Supabase for security. See docs/SETUP.md for instructions.
        </p>
      </div>

      {pendingUsers.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-amber-600">
            Pending approval ({pendingUsers.length})
          </h2>
          <div className="flex flex-col gap-3">
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{u.email}</p>
                  <p className="text-xs text-muted">Registered {formatDate(u.created_at)}</p>
                </div>
                <PendingRowActions userId={u.id} onResolved={handleResolved} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Registered</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      u.role === "admin" ? "bg-accent/10 text-accent" : "bg-border/60 text-muted"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[u.status]}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3">
                  <SetPasswordControl userId={u.id} email={u.email} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
