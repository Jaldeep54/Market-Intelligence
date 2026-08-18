// TEMPORARY DIAGNOSTIC -- delete this page once the Supabase project
// reference has been confirmed. It exists only to answer one question:
// which Supabase project is NEXT_PUBLIC_SUPABASE_URL (as set in Vercel)
// actually pointing at.
//
// Nothing secret is displayed here. NEXT_PUBLIC_* variables are already
// compiled into this app's client-side JS bundle and sent to every visitor's
// browser -- that's what the NEXT_PUBLIC_ prefix means. This page reveals
// only the project ref segment of that already-public URL, and explicitly
// does not display the full URL, the anon key, the service role key, or the
// Gemini key. It reads no other environment variable, runs no Supabase
// query, and makes no database or auth change. Admin-only because it lives
// under /admin, which src/app/admin/layout.tsx already gates.
function getProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return null;
  }
}

export default function DebugProjectRefPage() {
  const projectRef = getProjectRef();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">Temporary Diagnostic</h1>
      <p className="max-w-lg text-sm text-muted">
        This page is temporary. Once you&apos;ve confirmed the project reference below, ask for
        this page to be removed.
      </p>
      <pre className="w-fit rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground">
        {projectRef ? `SUPABASE_PROJECT_REF: ${projectRef}` : "NEXT_PUBLIC_SUPABASE_URL is not set in this environment."}
      </pre>
    </div>
  );
}
