# Placeholders: what still needs an outside service

Everything below is built as a working screen with a clearly marked placeholder where an outside
service will connect. Nothing in this list is live yet. Each needs an account, and most cost money.

| Area | What works today | What the placeholder stands for | Service to connect |
| --- | --- | --- | --- |
| Billing | Kinu console shows each brokerage's products, add-ons and a price estimate | Invoices, ACH Direct Debit, customer portal, "Book a call" | Stripe |
| Emails | Invites create private links that staff copy and send; email previews show the exact text | Welcome emails, 24h and 72h reminders, urgent-action emails, closed-deal emails, replies filing onto deals | Resend (or Postmark), own domain |
| Sign-in emails | Emailed link (few per hour), password for the builder | Branded email with a 6-digit code, higher limits | Resend via Supabase custom SMTP |
| W-9 | Agent confirms legal name and last four digits; staff see status | The real W-9 form, held by the provider | Track1099, TaxBandits or Tax1099 |
| Licence check | Agent enters number, expiry and a photo; a person confirms | Reading the number from the photo and checking the state record automatically | State licence lookup + document reading |
| E-signature | Disclosure and consent, typed legal name, time, internet address, browser, exact wording and document fingerprint kept in a record that cannot be edited; signed copy (PDF) for the agent and the brokerage | Cryptographic tamper seal on the PDF itself, independent audit certificate | Self-hosted Documenso (needs its own server) |
| Documents | Managers write autofill layouts or upload their own PDF form and map its fields; each deal fills itself in, with proof of payment and bank receipt attached | Word files and PDFs without fill-in fields; bulk "all deposit records for this payroll" | – |
| Payment proofs | Upload and manual entry, split across deals | Suggesting amount, date and method from the proof | Document reading |
| Direct deposit | Signed authorisation, bank name, account type and last four digits only | Taking full account and routing numbers and sending payouts | The brokerage's bank or a payout provider (e.g. Stripe) |
| Sheet sync | – | Writing each payroll to the brokerage's Google Sheet or Excel | Google / Microsoft |
| Staff invitations | Recorded; existing users join at once | Creating the person's login automatically | Supabase secret key on the server |
| Two-factor, Google and Microsoft sign-in | – | Required two-factor; step-up before granting big powers | Supabase Auth settings + provider apps |
| Monitoring | Server logs | Error alerts | Sentry |
| Retention check-ins | Risk list and openers | Saving check-in notes | A small database addition |

Public website: the policy pages are drafts written to match the product and have not been reviewed by a lawyer; `src/lib/company.ts` still needs the legal company name, address, contact email and governing state. Live chat is not built (it needs a paid chat service); Get started messages go to the console inbox.

Before real client data (blueprint sections 9 and 10): paid Supabase and Vercel plans with
backups, a penetration test, lawyer review of terms and privacy policy, insurance, and data
processing agreements with each provider.
