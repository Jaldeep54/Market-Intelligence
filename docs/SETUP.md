# Setup Guide

This guide covers the steps that only the project owner can do (creating the
Supabase project, running migrations, creating the first two accounts, and
deploying). Everything else is already built.

## 1. Create a Supabase project

1. Go to https://supabase.com and create a new project (the Free plan is
   enough to start).
2. Note the **Project URL** and **anon/public API key** from
   *Project Settings → API*. You will need these in step 3.

## 2. Run the database migrations

The schema, security policies, and the 15 tracked companies live in
`supabase/migrations/`, in this order:

1. `20260101000001_extensions_and_helpers.sql`
2. `20260101000002_tables.sql`
3. `20260101000003_indexes.sql`
4. `20260101000004_rls.sql`
5. `20260101000005_seed_companies.sql`
6. `20260101000006_news_automation.sql` (News Sources / News Inbox / Gemini pipeline -- purely additive, does not touch the tables above)
7. `20260101000007_supabase_cron_dispatch.sql` (schedules the 2-hour source check -- see section 8 below; requires a one-time Vault secret first, do not run this one until you've read that section)
8. `20260101000009_price_trends.sql` and `20260101000010_price_trends_seed_historical.sql` (Price Trends)
9. `20260101000011_profile_approval_status.sql` (adds the self-registration approval gate -- see section 5 below)
10. `20260101000012_drop_escalation_column.sql` (cleanup -- drops a column that only ever supported a since-removed feature)
11. `20260101000013_user_activity.sql` (adds the news-swipe / Price Trends / Company Profile usage counters shown on Admin -> User Activity)

**Easiest way:** open the Supabase dashboard → **SQL Editor**, paste each
file's contents in order, and click *Run*.

**Alternative (Supabase CLI):** if you have the CLI installed and linked to
your project, `supabase db push` will apply all five in order automatically.

After this, `select * from companies;` should return the 15 tracked
companies with empty profile data — that's expected. You (or whoever you
assign as Admin) fill in real capacity/management/financial/technology data
later from the Admin Dashboard.

## 3. Configure environment variables

Copy `.env.example` to `.env.local` for local development:

```bash
cp .env.example .env.local
```

Fill in the two values from step 1:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

`.env.local` is git-ignored and will never be committed. When you deploy to
Vercel, add the same two variables in the project's **Settings → Environment
Variables** — do not commit them anywhere.

## 4. Create the two initial accounts

Passwords are never handled by this app's code or stored in the repository.
Create the accounts directly in Supabase:

1. Supabase dashboard → **Authentication → Users → Add user**.
2. Create the Admin account:
   - Email: `Admin@goldi.com`
   - Password: (choose one yourself — do not send it to Claude/this
     repository)
   - Leave "Auto Confirm User" checked so they can log in immediately.
3. Create the Viewer account the same way:
   - Email: `Management@goldi.com`
   - Password: (your choice)

A database trigger (`on_auth_user_created`) automatically creates a matching
row in `profiles` with `role = 'viewer'` for every new user. The Viewer
account is done at this point.

4. Promote the Admin account's role, and approve both accounts. In the SQL
   Editor, run:

```sql
update public.profiles
set role = 'admin', status = 'approved'
where email = 'admin@goldi.com';

update public.profiles
set status = 'approved'
where email = 'management@goldi.com';
```

(Supabase stores emails lower-cased internally, so match on lower-case.)
**The `status = 'approved'` part matters:** since migration 11 (section 5
below), every profile defaults to `status = 'pending'` and can't sign in or
see any content until approved -- these two manually-created accounts are no
exception, so skipping this step locks you out of your own fresh install.

5. Confirm it worked:

```sql
select email, role, status from public.profiles order by created_at;
```

You should see one `admin` row and one `viewer` row, both `approved`.

To add more people later: they can now self-register at `/signup` with a
`goldisolar.com` email (see section 5 below) instead of you creating their
account by hand -- repeat step 4's `role = 'admin'` update only if they
should be an admin.

## 5. Self-registration & admin approval

Beyond the two manually-created accounts above, anyone with a
`goldisolar.com` email can self-register at `/signup`. New signups are
**not** usable immediately -- they sit as `status = 'pending'` (migration 11)
until you approve or reject them from **Admin -> Registered Users**, which
highlights pending accounts at the top with Approve/Reject buttons. A
rejected or still-pending account can't sign in and can't read any data
(enforced by both middleware and RLS), and sees a plain explanation instead
of a generic error.

There is no self-service password reset and no automated reminder email for
a pending signup -- if someone forgot their password, or a signup has been
sitting pending for a while, checking **Admin -> Registered Users**
yourself (or the person emailing you) is the whole mechanism. This is
deliberate: it keeps the account model simple and avoids a second
credential (SMTP) or a second scheduled job for a small user base.

1. **Disable Supabase's own email confirmation** -- Supabase dashboard ->
   **Authentication -> Providers -> Email -> uncheck "Confirm email"**.
   Approval is the actual gate now, not email confirmation; leaving this
   checked doesn't break anything but makes a new user wait on a
   confirmation email that accomplishes nothing extra.
2. **Set the new environment variable** (locally in `.env.local`, and in
   Vercel's Project Settings -> Environment Variables for production -- see
   `.env.example` for the full explanation of why it's server-only):
   ```
   SUPABASE_SERVICE_ROLE_KEY=<Project Settings -> API -> service_role key>
   ```
   This powers the admin panel's "Set new password" action
   (`supabase.auth.admin.updateUserById`) -- this is how "forgot your
   password" resolves to "ask an admin" without anyone ever seeing or
   storing the user's actual password.

## 6. Run it locally

```bash
npm install
npm run dev
```

Visit http://localhost:3000 — you'll land on the login page. Sign in with
either account you created above.

## 7. Deploy to Vercel

1. Push this repository to GitHub (already done if you're reading this from
   the repo).
2. In Vercel, "Add New Project" → import `Jaldeep54/Market-Intelligence`.
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables (step 3) in the
   Vercel project settings.
4. Deploy. Vercel auto-detects Next.js — no extra configuration is required.

## 8. Set up automated news collection (optional)

This adds: News Sources, News Inbox, and Gemini-assisted preparation. Skip
this section if you only want manual news entry -- everything above works
without it.

The 2-hour scheduled check runs entirely inside **Supabase** (`pg_cron` +
`pg_net` calling a Supabase Edge Function) -- not Vercel. Vercel's Hobby
plan can't run Cron more than once a day, so nothing about scheduling
depends on Vercel at all; Vercel only hosts the web app.

1. **Get a Gemini API key.** Go to https://aistudio.google.com/apikey,
   create a key on the Free Tier. Do not paste it into any chat -- only
   into environment variables (step 4 below and Vercel's dashboard).
2. **Deploy the Edge Function.** The function code lives in
   `supabase/functions/fetch-sources` (with shared logic in
   `supabase/functions/_shared/automation`). With the
   [Supabase CLI](https://supabase.com/docs/guides/cli) installed and
   linked to your project (`supabase link --project-ref YOUR-PROJECT-REF`):
   ```bash
   supabase functions deploy fetch-sources
   ```
   No function-specific secrets need setting for this step -- Supabase
   automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   inside every Edge Function's environment. (No CLI? You can also
   create/paste this function's code directly in the Supabase Dashboard
   under **Edge Functions**.)
3. **Store the cron job's invocation secret in Vault.** This is a one-time
   step you run yourself, directly in the Supabase SQL Editor -- never
   paste this into chat or commit it to a file. In the SQL Editor, run:
   ```sql
   select vault.create_secret(
     '<paste your project''s service_role key here>',
     'edge_function_invoke_key',
     'Bearer token pg_cron uses to call the fetch-sources Edge Function'
   );
   ```
   (Find the `service_role` key at Project Settings -> API. Vault encrypts
   it at rest; only Postgres itself can decrypt it, and only the cron job's
   own SQL reads it back out.)
4. **Set the environment variables** (locally in `.env.local`, and in
   Vercel's Project Settings -> Environment Variables for production --
   these two are Gemini-only now, nothing scheduling-related belongs in
   Vercel):
   ```
   GEMINI_API_KEY=<from step 1>
   GEMINI_MODEL=gemini-2.5-flash
   ```
5. **Run migration 7** (`20260101000007_supabase_cron_dispatch.sql`) in the
   SQL Editor -- but first open the file and replace
   `https://YOUR-PROJECT-REF.supabase.co` with your actual project URL.
   This enables `pg_cron`/`pg_net` and schedules the job
   `fetch-news-sources-every-2-hours`, which calls the Edge Function every
   2 hours using the Vault secret from step 3 as its bearer token. Re-run
   this migration any time (it replaces the existing schedule rather than
   duplicating it) if you need to change the URL or timing.
6. **Add your news sources.** Log in as Admin -> News Sources -> Add
   Source. Use "Fetch Now" on a source right after adding it to confirm it
   works before waiting for the schedule -- "Fetch Now" and "Fetch All
   Active Sources" always run instantly from the Admin UI regardless of the
   2-hour schedule.
7. **Check it's actually running** (optional, after ~2 hours): Supabase
   Dashboard -> Database -> Cron shows recent job runs; Edge Functions ->
   fetch-sources -> Logs shows each invocation; and the Admin ->
   Automation page in the app shows the resulting fetch summaries either
   way.

## 9. Moving off Vercel later

This app only uses standard Next.js/Node.js features -- no Vercel-specific
storage or functions, and the 2-hour schedule already lives in Supabase, not
Vercel, so there is nothing Vercel-specific left to replace. To self-host:

```bash
npm install
npm run build
npm run start   # serves on PORT (default 3000)
```

Point it at the same Supabase project (or a self-hosted Postgres +
Supabase-compatible auth layer later) using the same environment variables,
behind your own reverse proxy/HTTPS termination.

## Adding real company data

Once the two accounts exist, log in as Admin and go to **Company
Management** to fill in each of the 15 companies' overview, manufacturing
capacity, management, revenue, and technology/product data as reliable
information becomes available. Leave a field blank if the information isn't
publicly disclosed — the app will show "Not publicly disclosed" rather than
a fabricated value.
