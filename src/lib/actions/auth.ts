"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedSignupEmail, signUpSchema } from "@/lib/validation/auth";

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface AuthFormState {
  error?: string;
}

// The domain restriction is enforced here, not just in SignupForm's
// client-side check -- that check is instant feedback only, since anyone
// could bypass the UI and post straight to this action (or, in theory, call
// supabase.auth.signUp directly with the public anon key; see the PR
// description for why that residual gap needs a Supabase "Before User
// Created" Auth Hook, which is a dashboard/infra step, not app code).
export async function signUpAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, password } = parsed.data;

  if (!isAllowedSignupEmail(email)) {
    return { error: "Registration is limited to goldisolar.com email addresses." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { error: error.message };
  }

  // No email confirmation step ("Confirm email" is disabled on the Supabase
  // project -- see docs/SETUP.md): the handle_new_user trigger creates the
  // profile with status = 'pending' by default, and that status -- not
  // email confirmation -- is the actual gate. The account is unusable until
  // an admin approves it from /admin/users.
  redirect("/pending-approval");
}
