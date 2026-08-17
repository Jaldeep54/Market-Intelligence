import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchAllActiveSources } from "@/lib/automation/fetchSources";

// Invoked every 2 hours by Vercel Cron (see vercel.json). Vercel
// automatically sends `Authorization: Bearer $CRON_SECRET` on its own
// invocations once CRON_SECRET is set in the project's environment
// variables, so this also doubles as the auth check against anyone else
// hitting the route. No admin is logged in during a scheduled run, so this
// uses the service-role client (src/lib/supabase/service.ts) rather than
// the normal cookie-scoped one -- see that file for why that's safe here.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on the server." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const summary = await fetchAllActiveSources(supabase, "scheduled");
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unexpected error while checking sources." },
      { status: 500 }
    );
  }
}
