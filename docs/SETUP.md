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

4. Promote the Admin account's role. In the SQL Editor, run:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@goldi.com';
```

(Supabase stores emails lower-cased internally, so match on lower-case.)

5. Confirm it worked:

```sql
select email, role from public.profiles order by created_at;
```

You should see one `admin` row and one `viewer` row.

To add more people later, repeat steps 2 and (if they should be an admin)
step 4 — no code changes needed.

## 5. Run it locally

```bash
npm install
npm run dev
```

Visit http://localhost:3000 — you'll land on the login page. Sign in with
either account you created above.

## 6. Deploy to Vercel

1. Push this repository to GitHub (already done if you're reading this from
   the repo).
2. In Vercel, "Add New Project" → import `Jaldeep54/Market-Intelligence`.
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables (step 3) in the
   Vercel project settings.
4. Deploy. Vercel auto-detects Next.js — no extra configuration is required.

## 7. Moving off Vercel later

This app only uses standard Next.js/Node.js features — no Vercel-specific
storage, functions, or config. To self-host:

```bash
npm install
npm run build
npm run start   # serves on PORT (default 3000)
```

Point it at the same Supabase project (or a self-hosted Postgres +
Supabase-compatible auth layer later) using the same two environment
variables, behind your own reverse proxy/HTTPS termination.

## Adding real company data

Once the two accounts exist, log in as Admin and go to **Company
Management** to fill in each of the 15 companies' overview, manufacturing
capacity, management, revenue, and technology/product data as reliable
information becomes available. Leave a field blank if the information isn't
publicly disclosed — the app will show "Not publicly disclosed" rather than
a fabricated value.
