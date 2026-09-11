"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UserActionState {
  error?: string;
}

export interface SetPasswordState {
  error?: string;
  password?: string;
}

// Re-verified here, not just hidden behind an admin-only button in the UI --
// a Server Action is a directly callable endpoint regardless of what does or
// doesn't render for a given caller (same principle as signUpAction's own
// domain check). Every action below checks this before touching anything.
async function requireAdmin(): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Admin access required." };

  return { ok: true };
}

export async function approveUserAction(userId: string): Promise<UserActionState> {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status: "approved" }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return {};
}

export async function rejectUserAction(userId: string): Promise<UserActionState> {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status: "rejected" }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return {};
}

function generateStrongPassword(): string {
  // 16 characters from a mixed alphabet, drawn from cryptographically
  // random bytes (not Math.random()) -- plenty strong for a one-time
  // admin-issued temporary password.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(16);
  let password = "";
  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length];
  }
  return password;
}

// Sets a fresh password for any user, any status -- this is what lets
// "forgot your password" resolve to "ask Jaldeep" without ever storing or
// even seeing the user's original password (Supabase only ever stores a
// hash, by design). Uses the service-role client (see supabase/admin.ts)
// only for this one call; the generated/typed password itself is returned
// directly and never written to the database, a log, or anywhere else --
// it exists only in this one response, for the admin to relay once.
export async function setUserPasswordAction(
  userId: string,
  requestedPassword: string
): Promise<SetPasswordState> {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const password = requestedPassword.trim() || generateStrongPassword();
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };

  return { password };
}
