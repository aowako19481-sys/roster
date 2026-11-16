# Roster — PLAN.md (tonight: blueprint §11, step 1)

Status: **waiting for your OK.** No code is written until you approve.

## 0. Sources

| Source | Status |
| --- | --- |
| Blueprint | Read in full. Stored as `docs/blueprint.pdf` (exact) and `docs/blueprint.md` (text). |
| Design prototype | Unpacked from the uploaded canvas file. Every screen is in `design/` as reference HTML with exact colours, sizes, blur and motion values. `design/SignIn.html`, `design/Main.html` and `design/Sidebar.html` are the ones used tonight. Reference only: never served, never copied as-is. |
| Fonts | The Geist, Geist Mono and Instrument Serif files (Latin set) that the prototype itself uses, in `assets/fonts/` with their open licences. |
| GitHub repo | `aowako19481-sys/roster`, attached, push works. |
| Supabase test project | URL and publishable key received; project reachable; email sign-in is switched on. |
| Vercel | No access from this session. You import the repo once (steps will be given). |

## 1. Scope

In tonight:

1. Next.js (TypeScript, App Router) project in the GitHub repo.
2. Supabase TEST project wired in, fake data only.
3. `/sign-in` matching the Sign-in screen, with email-code sign-in.
4. `/` dashboard matching the Main screen, with the shared sidebar, filled from fake data.
5. Deployed to Vercel.

Explicitly out (later build steps): workspaces UI, roles and custom roles, two-factor, audit log, Google/Microsoft sign-in, the Agents / Teams / Riders / Files / Reports pages, Finance, add-ons, PWA install, emails beyond the sign-in code.

## 2. Architect — design

**Routes**

- `/sign-in` — public. Two steps on one page: email, then 6-digit code.
- `/` — dashboard, signed-in only. Server component; data read on the server.
- `/auth/sign-out` — POST only.
- Sidebar items for pages not built yet render as real links to a simple "Coming in a later step" page, so navigation is honest and keyboard-reachable.

**Auth flow**

- Server actions call Supabase: `signInWithOtp({ email, shouldCreateUser: false })`, then `verifyOtp`. Session lives in httpOnly cookies via `@supabase/ssr`.
- `shouldCreateUser: false` means only people you have added in Supabase can sign in. Strangers get the same neutral message as everyone else (no account enumeration).
- Middleware refreshes the session and redirects signed-out visitors to `/sign-in`. The dashboard also re-checks the user on the server (`getUser()`), never trusting the cookie alone.
- "Continue with Google Workspace" is shown as in the design but disabled, labelled "Coming soon". It needs Google Cloud setup and belongs with two-factor in step 2.

**Data (Supabase, test project)**

Small schema, enough to fill the dashboard and already shaped for step 2:

- `workspaces` — one fake brokerage.
- `workspace_members` — links a signed-in user to a workspace.
- `agents` — name, office, team, masked licence, W-9 / rider status, onboarding status, GCI. The high-rollers fan, the stat row and the cohort table all derive from this.
- `onboarding_batches` — sent / ready counts per batch.
- `attention_items` — the "Needs a human" list.
- `tier_approvals` — the "Tier clearance" card.

Every table: RLS enabled and forced, `select` only for members of the row's workspace, no insert / update / delete policies at all tonight (the dashboard is read-only). Nothing is granted to the `anon` role. Buttons such as Approve and Invite agents are present but do nothing yet and say so.

Delivered as one SQL migration plus one seed file in `supabase/`. You paste them into the Supabase SQL editor; I need no database password and no service-role key.

Fake data: the invented names from the design canvas (Maya Chen, Jordan Ellis, ...), invented licence fragments, invented dollar figures. The signed-in user's name comes from their own account, not seeded.

**Look**

- CSS Modules plus one global token file (greys, glass, radii, shadows). No UI library.
- Frosted panels with `backdrop-filter`, with a solid fallback where unsupported.
- 3D: CSS transforms only (fan of high-roller cards, stacked document cards on sign-in). Motion is CSS transitions, all switched off under `prefers-reduced-motion`.
- Icons: a handful of inline SVGs I draw myself. No icon package.
- Responsive: sidebar collapses to a top bar on phones.

**Fonts**

Geist, Geist Mono and Instrument Serif as `.woff2` files committed to the repo (`assets/fonts/`, taken from the prototype) and loaded with `next/font/local`. All three are open-licensed (OFL). Latin characters only for now; other alphabets fall back to the device font. This is stricter than `next/font/google`, which self-hosts for visitors but still downloads from Google during each build.

**Secrets**

Tonight needs **no secret keys at all**. Only two values, both public by design:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the "anon" / publishable key)

`.env*` is git-ignored from the first commit; `.env.example` holds names only.

## 3. Packages — need your OK

| Package | Why |
| --- | --- |
| `next`, `react`, `react-dom` | The framework. |
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom` | TypeScript. |
| `eslint`, `eslint-config-next` | Lint, includes accessibility rules. |
| `@supabase/supabase-js`, `@supabase/ssr` | Supabase client and cookie sessions. |

Nothing else. No Tailwind, no component kit, no analytics, no Sentry yet. No paid services: Vercel Hobby and Supabase Free.

## 4. Coder — commit sequence

1. Scaffold Next.js, `.gitignore`, `.env.example`, PLAN.md, blueprint into `docs/`.
2. Fonts, design tokens, global styles, security headers.
3. Supabase clients (server, browser, middleware) and route protection.
4. SQL migration with RLS, and seed.
5. Sign-in page UI.
6. Email-code server actions, sign-out.
7. Shared sidebar and app shell.
8. Dashboard sections, one commit each: header and high-rollers fan, stat row, onboarding counter, chart / tier / needs-a-human row, cohort table with filters.
9. Placeholder page for unbuilt sidebar links.
10. Fixes from Tester and Security.

## 5. Tester — checks

- `tsc`, `eslint`, `next build` clean.
- Browser run (Playwright already on this machine, not added to the project): signed-out visit to `/` redirects; bad email and bad code show clear errors; whole sign-in flow works by keyboard alone; visible focus rings; screenshots compared side by side with the design at desktop and phone widths; reduced-motion mode shows no animation.
- Break attempts: direct query with the public key and no session returns zero rows from every table; a signed-in user with no membership sees nothing; open-redirect attempt on sign-in; oversized and malformed input.
- Network log of both pages: no request leaves for Google or any third party except your Supabase project.
- Contrast check on text over glass (WCAG AA).

## 6. Security — review on every commit

- Diff scanned for keys before each commit; `.env*` never staged.
- Headers: Content-Security-Policy, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`, Permissions-Policy.
- Server actions validate input; errors shown to users are generic.
- RLS verified by the Tester's break attempts above, not just read.
- Findings are listed for you; nothing is waved through silently.

## 7. Manager — definition of done

Vercel link opens the sign-in page, you sign in with a code sent to your email, you land on the dashboard matching the Main screen, and the final report lists what is built, what was tested, open issues and next steps.

## 8. What I need from you

1. **Your OK** on this plan, including the package list (§3) and the Google button shown disabled (§2).
2. **Three things in Supabase**, when I hand you the files (step-by-step instructions will come with them):
   - SQL editor: run the migration, then the seed.
   - Authentication → Users: add your own email, so you can sign in.
   - Authentication → Email templates → Magic Link: add `{{ .Token }}` so the email shows a 6-digit code.
3. **Vercel**: import the GitHub repo at vercel.com/new and add the two environment variables. After that every push deploys by itself.

## 9. Known limits tonight

- Supabase's built-in email sender allows only a few emails per hour and may deliver only to your project's team addresses. Fine for you testing; Resend replaces it in step 2 or 3.
- No two-factor yet. Blueprint requires it; it is the first item of step 2. Until then, test data only.
- No rate limiting of our own on sign-in beyond Supabase's built-in limits. Step 2.

---

# Plan: Riders → Send for signature (Documenso)

Status: waiting for the owner's OK. Nothing below is built yet.

## Architect — what it does

1. On the Riders page, each rider waiting for signature gets a **Send for signature** button.
2. Kinu builds the rider PDF on our own server: the brokerage's rider PDF form if one is set up in Templates (filled in with the agent's split and tiers), otherwise a plain Kinu rider page.
3. Kinu adds a signature page at the end (signature, printed name, date) and sends the PDF to the brokerage's Documenso (sign.kinu.pro) with the agent as signer.
4. The agent gets an email from KINU and signs on sign.kinu.pro.
5. When signing completes, Kinu downloads the sealed PDF and its certificate, files both in the agent's file, and marks the rider signed. The existing tier and payroll rules then treat it exactly like a rider signed today.
6. Staff can see the state (sent, opened, signed, declined), resend, or cancel.

Step 2 of this feature (later, separate OK): placing signature, initials and date boxes anywhere on the brokerage's own PDF inside Kinu.

## Data

- New table `sign_requests` (workspace, rider, agent, Documenso envelope id, status, sent/completed times, file paths). Row-level security like `riders`; only the server writes status.
- One new migration, idempotent. No change to existing tables beyond a nullable link from `riders`.

## Coder — commit sequence

1. `src/lib/documenso.ts`: server-only client (create envelope, add recipient and fields, distribute, get status, download). Reads `DOCUMENSO_URL` and `DOCUMENSO_API_KEY`; if either is missing the button explains that instead of failing.
2. Migration + `sendRider`, `refreshRider`, `cancelRider` actions (permission: the same capability that can record a rider signature today).
3. Riders page UI: button, status, resend, cancel.
4. `/api/documenso/webhook`: verifies the shared secret, then re-reads the envelope from Documenso before trusting anything. Status is also refreshed when staff open the page, so it works before the webhook is set up.
5. Auto-file the sealed PDF and certificate into the agent file.

## Tester — checks

- Fake agents only, against a test envelope on sign.kinu.pro.
- Send, sign, decline, cancel, resend; signed copy appears in the agent file; rider becomes current only after completion.
- A second brokerage cannot see or act on the first brokerage's requests.
- Missing key, wrong key, Documenso offline: clear message, nothing half-saved.

## Security — review

- API key and webhook secret are server-only settings; never sent to the browser, never logged.
- The webhook is not trusted on its own: Kinu re-fetches the envelope by id and checks it belongs to the request on file.
- Only the agent's name and email go to Documenso, plus the rider PDF. No tax or bank details.
- No new package: plain `fetch` and the existing pdf-lib.

## Needed from the owner

1. OK on this plan.
2. Who signs a team rider: every member, or the team lead only.
3. Later: a webhook secret (one setting in Documenso and one in Vercel) and the signing certificate check.
