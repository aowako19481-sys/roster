# Kinu

(Repository name: `roster`. The product name lives in `src/lib/brand.ts`.)

Web app for real estate brokerages: agent onboarding (Ops) and commission payroll (Finance).
Product spec: `docs/blueprint.md`. Build plan: `PLAN.md`. Design references: `design/`.

## What is built

- **Sign-in**: emailed link or code through Supabase; existing users only.
- **Kinu console** (Kinu staff only): every brokerage, its plan pieces with lock/unlock, people, price estimate; create and open brokerages.
- **Roles and permissions**: seven built-in roles, custom roles, big powers (override, release payroll), offices, invitations, "view as role" preview, audit log.
- **Ops**: dashboard, agents and agent cards, invitations with private onboarding links, the agent portal (details, licence, W-9, rider signature, onboarding packet), teams, riders and tier approvals with undo, files, reports.
- **Finance**: overview and run sheet, deals with the rider check on save, fees, checklist, payments split across deals, payroll calendar with cutoff, held folder, release and close, GCI calculator, agent statements.
- **Add-ons**: Retention Insights, Exit Kit, Payout checks.
- Outside services are placeholders: see `docs/PLACEHOLDERS.md`. How pages are written: `docs/BUILD_GUIDE.md`.

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
3. Authentication -> URL Configuration: set Site URL to the deployed address and add `<address>/auth/callback` to Redirect URLs, so the emailed link works.
   (Showing a 6-digit code in the email needs custom SMTP; Supabase locks templates on its built-in sender.)
4. SQL editor: run `supabase/setup_test_project.sql` (the two migrations and the seed joined into one paste).
   Both are safe to run again. Run the seed again after adding a new tester.

## Rules this repo follows

- No secret keys in the code or in the browser. The one secret (`SUPABASE_SECRET_KEY`) is a server-only environment variable, used only for the agent portal and for creating logins for invited people.
- Row-level security is enabled and forced on every table. What each role may read or change is decided in the database, and every change is written to the audit log.
- Fonts are files in `assets/fonts/`, loaded with `next/font/local`. Nothing loads from third parties.
- No analytics, no session recording. Next.js build telemetry is switched off in the npm scripts.
- Never commit `.env` files. Fake data only until the blueprint's pre-launch steps are done.
