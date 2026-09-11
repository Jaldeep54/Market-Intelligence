import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationEmail } from "@/lib/email/mailer";

const ESCALATION_RECIPIENT = "jaldeep.g@goldisolar.com";
const ESCALATION_THRESHOLD_HOURS = 24;

// Accepts either an "Authorization: Bearer <secret>" header (what Vercel
// Cron sends when configured with a secret) or a "?secret=" query param
// (for manual/curl testing), checked against CRON_SECRET -- without this,
// this route would let anyone spam the escalation email or churn through
// Gmail's send quota.
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = request.nextUrl.searchParams.get("secret");
  return headerSecret === secret || querySecret === secret;
}

// Uses the service-role client, not the cookie-bound one: a cron call has
// no user session/cookies at all, so RLS would see it as anonymous and
// block every read/write here regardless of the query's own logic.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const thresholdIso = new Date(Date.now() - ESCALATION_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

  const { data: overdue, error } = await supabase
    .from("profiles")
    .select("id, email, created_at")
    .eq("status", "pending")
    .lt("created_at", thresholdIso)
    .is("escalated_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let notified = 0;
  for (const profile of overdue ?? []) {
    try {
      await sendNotificationEmail({
        to: ESCALATION_RECIPIENT,
        subject: `Pending approval: ${profile.email} — awaiting review for over 24h`,
        text: `${profile.email} signed up on ${profile.created_at} and is still awaiting approval or rejection, more than ${ESCALATION_THRESHOLD_HOURS} hours later.\n\nReview it here: ${request.nextUrl.origin}/admin/users`,
      });
    } catch (sendError) {
      // Leave escalated_at null on a genuine send failure, so the next run
      // retries this profile instead of silently dropping the notification.
      console.error(`Failed to send escalation email for ${profile.email}`, sendError);
      continue;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ escalated_at: new Date().toISOString() })
      .eq("id", profile.id);
    if (updateError) {
      console.error(`Failed to set escalated_at for ${profile.email}`, updateError);
      continue;
    }
    notified += 1;
  }

  return NextResponse.json({ checked: overdue?.length ?? 0, notified });
}
