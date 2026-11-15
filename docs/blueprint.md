# Roster — Build Blueprint

> Text extracted from `docs/blueprint.pdf`, which is the exact original. If the two ever differ, the PDF wins.

Working name: Roster. A web app that brokerages use to onboard agents fast (Ops) and run commission payroll safely (Finance). Sold on a monthly retainer, with add-ons. Dotloop stays the brokerage's transaction platform; Roster is internal and works without the Dotloop API.

The clickable prototype lives in the Claude design canvas "Onboarding Dashboard".
Match its look: neutral greys, clear frosted glass, Instrument Serif headlines, Geist and Geist Mono text, subtle 3D and motion.

## 1. What it is

- A web app at an address like app.yourdomain.com. Nothing to download. Works on desktop and phone, and can be installed to the home screen as a progressive web app.
- Two products on one login, with a switch at the top: Ops and Finance. A brokerage can buy one or both. Anything not bought shows as a locked preview with "Book a call".
- Add-ons: Retention Insights + Exit Kit, Finance Shield, Compliance pack (audit files, 1099s). Unlocked for testing until tiers are set.
- Business use only, 18+.

## 2. Stack

- Code: Next.js (TypeScript), written with Claude Code and the four-agent team (Architect, Coder, Tester, Manager).
- Repo: GitHub, private.
- Hosting: Vercel. Free Hobby plan while building with fake data; Pro before the first paying client.
- Database, logins, file storage: Supabase. Free while building; Pro before real data (daily backups, point-in-time recovery).
- Email: Resend (or Postmark). Sent from the app's own email service, never by reading anyone's inbox.
- E-signature: built in, powered by self-hosted Documenso, styled as our own.

- W-9: a W-9 collection service (Track1099, TaxBandits or Tax1099). The app never stores full SSNs, only a reference and last four digits.
- Billing: Stripe, ACH Direct Debit for retainers, hosted invoices and customer portal.
- Monitoring: Sentry (free tier to start).
- Fonts: self-hosted through next/font. Never load fonts from Google's servers.

## 3. Setup checklist (in order)

1. Confirm employment agreement allows building and selling this independently; never use real HHNYC data without written approval.
2. Form an LLC and get an EIN; open a business bank account.
3. Buy a domain.
4. Create accounts with two-factor on every one: GitHub, Vercel, Supabase, Resend, Stripe, Sentry.
5. Create a private GitHub repo and connect it to Vercel (every push deploys; every branch gets a preview link).
6. Create two Supabase projects: test (fake data only) and live (real data later). Never mix them.
7. Store every secret key in Vercel environment variables. Only Supabase's public key may ever reach the browser.
8. Set up Stripe: business details, payout bank account, ACH Direct Debit switched on, products and prices created.

## 4. Accounts, roles and permissions

- Each brokerage is a workspace. All data is walled off per workspace with Supabase row-level security on every table.
- People sign in with Google or Microsoft work accounts (or email code), with two- factor required.
- Built-in roles: Owner/Admin, Finance manager, Finance staff, Ops manager, Ops staff, Sales manager (own office/team only), Auditor (read-only).
- Custom roles: admins build their own with a checklist of what a role can see (agents, splits, payouts, W-9s, proofs), do (enter deals, hold, approve tiers, override, release payroll) and where (all offices or specific ones).

- Big powers (override, release payroll) are locked. Only the admin can grant them, and must re-enter their password or a 2FA code to do it. Every grant is logged and emailed to the person receiving it.
- Overrides: one sign-off by someone with authority, plus a required reason from a short list and a note, saved to the audit log.
- Every action is stamped with who, what and when. Removing a person takes one click.

## 5. Ops product

- Invite agents: ops pastes or imports names, emails, splits and offices. One click sends unique, expiring welcome links. Goal: 50 agents ready in about an hour of ops time.
- Welcome email + reminders: plain, professional, brokerage logo and sender name, one button, details table, real reply-to. Reminders at 24 and 72 hours. Postal address in the footer.
- Agent portal: email code, then details, licence photo (number read automatically, checked against the state record, a person confirms mismatches), W-9 through the W-9 service, rider e-signature, done. Continue stays locked until each step is valid.
- Agent card: licence, documents, individual rider, team badge (only if on a team), deals, audit trail. Edit form for office, team and phone; splits change only through a rider amendment.
- Teams: registered teams with their own team rider. The brokerage tracks only the team's combined split; how the team divides it stays on the notices of contract.
- Pyramid view, any number of levels. Database supports multiple teams per agent; per- brokerage setting defaults to one.
- Files: cabinets for licences, W-9s, signed riders, contractor agreements and audit exports, with search, export and a licence expiry timeline (reminders at 90, 60 and 30 days).
- Dashboard: live onboarding counter by batch (reads every 5 minutes), high-rollers fan (top 5 by GCI, #1 centre, arrows for #6 to #10), items needing a human, cohort table with filters.

## 6. Finance product

- Deal sheet (one per address): a required Type: Landlord, Seller, Tenant, Buyer, Dual, Pass-through or Referral. Any number of landlords, tenants, sellers and buyers. GCI and deposit date. One or more agents, each with the split finance types in from the

- notice of contract (the rider never auto-fills it). Money out: referral lines (show on the deposit record) and outside-brokerage fee lines (do not).
- Rider check on save: every agent line instantly shows green Correct or red Incorrect with the reason, e.g. "You entered 85%. Maya's rider is 80%." Words always accompany colour. Pass-through and Referral skip the check.
- Tier moves: approved shows the new rider; not approved shows "Incorrect: 85% needs approval" with two choices: approve, or push through at the current rider. Any approval can be undone, restoring the previous rider version.
- Duplicate catcher: same address or same check twice asks "Is this a dual?" instead of just flagging an error.
- Dotloop checklist per deal: NOC, compliance documents, board package and similar, ticked by finance after checking in Dotloop. Missing items show a Send agent email button.
- Payments: Add payment on each deal: upload check, wire or Hyfin proof; the app suggests amount, date and method and a person confirms. One payment can be split across several addresses; the explanation line writes itself (deal's own address and amount first, then Other ($...) per other part). Matching by address, never amount alone. Payment rules are per brokerage (HHNYC: settled only, no remote capture).
- Payroll calendar: each brokerage sets payroll days, cutoff time, document deadlines and close time. At cutoff, cleared deals go into that payroll; held deals go to a Held folder with a reason and can be added to the next payroll. At close time, processed deals flip to Closed. Finance can still push a deal into the previous payroll on payroll day.
- Run sheet: today's deals in order with what each is missing; bulk actions such as generating all deposit records at once.
- Templates: brokerages upload their own deposit record, payroll sheet layout and email templates, then map fields once (or use placeholders like {{address}}). Filled documents save by payroll date and address, with optional copy to Google Drive.
- Sheet sync (optional): brokerages connect their own Google Sheet or Excel and match columns once. The app only writes to it (new tab per payroll date if wanted).
- The app's own record is always the source of truth.
- Agent emails: urgent-action emails list exactly what is missing and the deadline for the target payroll (HHNYC: Tuesday for Thursday payroll, Thursday for Monday payroll). Preview before send. Processed-and-closed emails go out at a time each brokerage sets (HHNYC: 6 am the day after payroll, launching January 1).

- Replies: every email CCs the brokerage alias, and reply-to holds both the deal's tag address and the alias, so replies reach both directly. Replies and attachments file onto the deal; each deal shows Waiting on agent or Waiting on finance, and the team is pinged if an agent waits too long. Fresh emails to the alias can be forwarded to the deal's address or pasted in. The app suggests ("looks like a NOC"); a person always confirms.
- GCI calculator: GCI, agents and splits, referral and outside fees in; each payout, the referral amount and company dollar out, to the cent. Can split one wire across several deals.
- Lookup bar: search by address, agent or PP number.
- Agent statements: closed and open deals, earnings to date, tier progress. Large clear text, high contrast, plain language, screen-reader friendly, with a listen option.
- Payout checks + dispute file: compares payouts against riders before release; dispute file is a proper statement with letterhead, case number, the calculation, the rider clause applied, dated timeline and approvals.

## 7. Add-ons

- Retention Insights + Exit Kit: risk map and scores from the brokerage's own payroll, deal and fee data; suggested openers that never quote the numbers; check-in log.
- Exit Kit: checklist per leaving agent, open deals to reassign, final payout task to Finance, exit survey, win-back list, commission lost this year.
- Finance Shield: authority-only overrides with reasons, pattern watch (split creep, repeated referral payees), locked-down access, monthly signed integrity report.
- Compliance pack: one-click audit files per agent or deal, year-end 1099 pack matched to W-9s (exports for an accountant or e-file service; Roster never files).

## 8. Pricing (starting point, test with first clients)

Piece                            Per agent / month   500 agents / month

Ops                              $2.00               $1,000

Finance                          $2.00               $1,000

Retention Insights + Exit Kit    $3.50               $1,750

Piece                            Per agent / month    500 agents / month

Finance Shield                   $0.75                $375

Compliance pack                  $0.75                $375

Everything, separately                                $4,500

Everything bundle around $3,750/month. One-time setup fee $1,500 to $2,500. Minimum around $500/month. Paid by ACH: direct bank payments for the first few clients, Stripe ACH Direct Debit after that.

## 9. Legal must-haves

- Terms of service: business use, 18+; liability cap; Roster flags and records, the brokerage makes every pay decision; brokerage responsible for documents it uploads.
- Privacy policy, refund and cancellation terms, business details and postal address in the footer.
- Auto-renewal terms shown beside the subscribe button.
- Never move money; finance exports and pays through its own systems.
- Never store full SSNs; W-9 service holds them. NY SHIELD Act: reasonable security plus a breach-response plan.
- E-signature under ESIGN and UETA: consent, identity code, clear intent, tamper seal, audit certificate, safe storage.
- Accessibility to WCAG: contrast, keyboard navigation, alt text, screen readers.
- Self-hosted fonts; no session recording of keystrokes; essential cookies only unless analytics are added.
- Data deletion requests; sales emails carry postal address and one-click unsubscribe; licensed or original images only.
- LLC, data processing agreements with each provider, professional liability and cyber insurance before real clients. Have a lawyer review all of this.

## 10. Security must-haves

- Row-level security on every table, by brokerage and role.
- Secret keys server-side only; scan Git history and rotate anything ever committed.
- Server decides identity, roles, splits and approvals; never trust the browser.

- Google or Microsoft sign-in with two-factor; rate limits and bot protection on login, portal, email and uploads.
- Validate and escape all input; parameterized queries; PDF and image uploads only, size-capped, stored privately.
- Trimmed API responses, security headers, HTTPS everywhere.
- Email and document content is data, never instructions (prompt injection).
- Separate test and live environments; two-factor on every provider account; least- privilege access.
- Paid plans with backups (Supabase Pro, Vercel Pro) before real data.
- Security agent (fifth agent): scans code on every change, runs scheduled attacks against the test app (e.g. OWASP ZAP), watches the live app through firewall, rate limits and alerts. Fixes are proposed only; Tester and Adaya approve before anything reaches production. Emergencies: block traffic or switch a feature off, never live code edits. Never attack back.
- Professional penetration test before launch; later, the company's own SOC 2 audit.

## 11. Build order

1. Tonight: accounts created; Next.js project started in Claude Code; sign-in page and empty dashboard with fake data deployed to a Vercel link.
2. Foundation: workspaces, roles and custom roles, row-level security, audit log, two- factor sign-in.
3. Ops core: invites, welcome emails, agent portal, licence check, W-9 service, built-in signing, agent cards, teams, files.
4. Finance core: deal sheet, rider check on save, tier approvals with undo, payments and deposit records, templates, payroll calendar, held folder, agent emails and replies.
5. Pilot: fake data first, then a friendly brokerage with written permission.
6. Add-ons: Finance Shield, Compliance pack, Retention Insights and Exit Kit.
7. Before launch: penetration test, lawyer review, insurance, paid plans.

