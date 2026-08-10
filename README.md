# Market Intelligence

Internal solar-industry market intelligence platform. Employees and
management can browse global/Indian market news, top-company news,
analytical news, and detailed profiles of the 15 tracked Indian solar
companies, with a news-app-style vertical swipe feed and advanced filtering.
Admins manage all content from a dedicated dashboard.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres, Auth,
Row Level Security). No AI, no unnecessary third-party services.

## Getting started

See **[docs/SETUP.md](docs/SETUP.md)** for the full setup guide (Supabase
project, database migrations, creating the Admin/Viewer accounts, local dev,
and deployment to Vercel).

Quick version once Supabase is configured:

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

## Project structure

```
src/app/(viewer)/     Viewer-facing pages: news feed, company profiles
src/app/admin/        Admin dashboard: news + company management
src/app/login/        Login page
src/components/       UI components (viewer, admin, shared)
src/lib/supabase/     Supabase client helpers (browser, server, session refresh)
src/lib/data/         Server-side data-fetching helpers
src/lib/actions/      Server Actions for admin mutations
src/lib/types/        Hand-written types mirroring the SQL schema
supabase/migrations/  SQL schema, indexes, Row Level Security, seed data
```

## Roles & security

Two roles: `admin` and `viewer`. Authorization is enforced in Postgres via
Row Level Security (see `supabase/migrations/20260101000004_rls.sql`) — not
just hidden UI — so a viewer session cannot read unpublished news or write
any data even if it bypassed the frontend entirely.

## Scripts

```bash
npm run dev      # local development
npm run build    # production build
npm run start    # run the production build
npm run lint     # ESLint
```
