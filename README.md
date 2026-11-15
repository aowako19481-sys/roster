# Kinu

(Repository name: `roster`. The product name lives in `src/lib/brand.ts`.)

Web app for real estate brokerages: agent onboarding (Ops) and commission payroll (Finance).
Product spec: `docs/blueprint.md`. Build plan: `PLAN.md`. Design references: `design/`.

## What is built (blueprint section 11, step 1)

- `/sign-in`: email + 6-digit code sign-in through Supabase. Existing users only.
- `/`: dashboard with the shared sidebar, filled with fake sample data from Supabase.
- Other navigation links open a "coming later" page.
- A first-run walkthrough of the dashboard, shown once per account and replayable.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the two public Supabase values
npm run dev
```

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Supabase (TEST project only)

1. Authentication: switch off "Allow new users to sign up".
2. Authentication -> Users: add each tester by email.
3. Authentication -> Email templates -> Magic Link: include `{{ .Token }}` so the email shows the code.
4. SQL editor: run `supabase/migrations/0001_step1_dashboard.sql`, then `supabase/migrations/0002_first_run_tour.sql`, then `supabase/seed.sql`.
   Both are safe to run again. Run the seed again after adding a new tester.

## Rules this repo follows

- No secret keys in the code or in the browser. The only Supabase values used are the public URL and publishable key.
- Row-level security is enabled and forced on every table. The API has read-only access, for workspace members only.
- Fonts are files in `assets/fonts/`, loaded with `next/font/local`. Nothing loads from third parties.
- No analytics, no session recording. Next.js build telemetry is switched off in the npm scripts.
- Never commit `.env` files. Fake data only until the blueprint's pre-launch steps are done.
