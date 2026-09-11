import { createClient } from "@/lib/supabase/server";

// Middleware sends both 'pending' and 'rejected' accounts here (an
// approved user, or anyone with no session at all, never reaches this
// page -- see src/lib/supabase/middleware.ts), so the message has to be
// specific to which of those two it actually is, not a single fixed string.
export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let message =
    "Your registration request has been sent to the admin for approval. You'll be able to sign in once it's approved.";

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).single();
    if (profile?.status === "rejected") {
      message = "Your registration request was not approved. Contact your administrator for details.";
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Market Intelligence
        </h1>
        <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm text-foreground">{message}</p>
        </div>
      </div>
    </main>
  );
}
