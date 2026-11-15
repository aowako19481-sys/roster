# Kinu build guide (for whoever is building pages)

Kinu is a Next.js 16 (App Router, TypeScript) app on Supabase. Product spec: `docs/blueprint.md`.
Design references (look only, never copy): `design/*.html`.

## The rule that matters most

**The database decides. The app asks.** Permissions, the rider check, payouts and every approval
live in SQL (`supabase/migrations/0003`–`0005`). Read those files before writing a page: they are
the schema reference, and every function you may call is defined there with a comment.

- Every query runs as the signed-in user through `createClient()` from `@/lib/supabase/server`.
  Row-level security filters what comes back. Never use the admin client outside `src/lib/portal.ts`.
- Never trust a value from the browser for identity, role, split, payout or approval. Send the
  minimum (ids and typed values) and let the database work the rest out.
- All data access is on the server (server components and server actions). No Supabase calls in
  client components. No new npm packages. No external requests of any kind.

## How a page is put together

```tsx
// src/app/(app)/things/page.tsx  (server component)
import type { Metadata } from "next";
import { Badge, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Things" };

export default async function ThingsPage() {
  const access = await requireCap("agents.view");      // redirects to /locked if not allowed
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("agents").select("id, full_name, office, status")
    .eq("workspace_id", access.workspace.id)             // always filter by the brokerage
    .order("full_name").limit(500);

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Onboarding" title="Things" sub="One line on what this page is for." />
      <Card title="All things">
        {rows?.length ? ( /* table using ui.tableWrap / ui.table */ null ) : <Empty>Nothing here yet.</Empty>}
      </Card>
    </div>
  );
}
```

- `requireCap(cap)` → `access` with `access.workspace` (`id`, `name`, `timezone`, `hasOps`,
  `hasFinance`, `addons`), `access.caps` (a `Set`), `access.viewAs`, `access.isPlatformAdmin`.
  Use `access.caps.has("deals.edit")` to decide whether to show a button or form.
  `requireAddon(addon, cap)` for add-on pages. `requirePlatformAdmin()` for the Kinu console.
- Capability names: `src/lib/roles.ts` (`CAPS`). What each role gets: `private.role_caps` in `0003`.

## How a form is put together

```ts
// src/app/(app)/things/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { done, fail, failure, text, uuid, num, isoDate, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

export async function renameThing(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("agents.edit");        // friendly refusal; blocks while previewing a role
  if ("denied" in gate) return fail(gate.denied);
  const id = uuid(form, "id");
  const name = text(form, "name", 120);
  if (!id || name.length < 2) return fail("Enter a name.");
  const supabase = await createClient();
  const { error } = await supabase.from("agents").update({ full_name: name })
    .eq("id", id).eq("workspace_id", gate.access.workspace.id);
  if (error) return failure(error);                       // safe wording; our own DB messages pass through
  revalidatePath("/things");
  return done("Saved.");
}
```

```tsx
// in the page
import { ActionForm, Submit } from "@/components/ActionForm";
<ActionForm action={renameThing} resetOnSuccess>
  <input type="hidden" name="id" value={row.id} />
  <label className={ui.field}>Name<input className={ui.input} name="name" defaultValue={row.full_name} required maxLength={120} /></label>
  <Submit>Save</Submit>
</ActionForm>
```

- Actions always: `actionAccess(cap)` first, validate every field with the `result.ts` readers,
  filter by `workspace_id`, return `failure(error)` / `done()`, and `revalidatePath`.
- For database functions: `supabase.rpc("decide_tier", { ws: gate.access.workspace.id, approval: id, decision: "approve" })`.
- A one-button action is a small `ActionForm` with hidden inputs and a `<Submit small variant="plain">`.
- Only write a client component (`"use client"`) for real interactivity (filter tabs, a live
  calculator, add/remove rows). Keep it small and pass data in as props.

## Look and feel

Use the kit in `src/components/ui.tsx` and `ui.module.css`: `PageHeader`, `Card`, `Badge`, `Stat`,
`Empty`, `Placeholder`, `Tabs`, `ButtonLink`, and the classes `ui.stack`, `ui.grid2/3/4`,
`ui.split`, `ui.tableWrap` + `ui.table` (+ `ui.num`, `ui.strong`, `ui.soft`, `ui.mono`,
`ui.rowLink`), `ui.form`, `ui.formRow`, `ui.field`, `ui.input`, `ui.select`, `ui.textarea`,
`ui.check`, `ui.help`, `ui.inline`, `ui.kv`, `ui.list`, `ui.btn`, `ui.btnPrimary`, `ui.btnDanger`,
`ui.small`, `ui.linkBtn`. Add a page-specific CSS module only when the kit cannot do it, and use
the tokens in `src/app/globals.css` (greys only; `var(--red)` / `var(--green)` for status).
Small spaced capitals use the global class `brandLabel`. Big figures use `ui.statValue`.

- Formatting: `money`, `moneyWhole`, `pct`, `day`, `dayTime`, `todayIso`, `titleCase` from `@/lib/format`.
- Role names: `roleLabel` from `@/lib/roles`. Product name: `BRAND` from `@/lib/brand` (never type "Kinu").

## Accessibility (required)

Real `<button>`, `<a>`, `<label>`, `<table>` with `<th scope>`. Every input has a label. Status is
always a word (`Badge`), never colour alone. Everything works by keyboard. No new animation
without a `prefers-reduced-motion` fallback (the kit already handles its own).

## Outside services are placeholders

Nothing calls Stripe, a W-9 service, an email service, Dotloop, Google or a licence lookup. Where
the product needs one, build the screen fully and put `<Placeholder service="…">` explaining what
will connect there. "Send email" buttons record the intent (audit log) and show the exact text
that would be sent; they do not send.

## Checking your work

A dev server runs at http://localhost:3100 against a local test database with one user per role.
Do not restart it and do not reset the database.

```bash
node /tmp/claude-0/-home-user/a0b0fa21-cd16-59e0-9a2d-420fb3e8fe36/scratchpad/dev/check.cjs owner1@x.test /agents /teams
BODY=600 node …/check.cjs finstaff@x.test /deals        # also prints the page text
node …/check.cjs ceo@kinu.test /agents --shot agents     # screenshot into scratchpad/shots/
```

Test users (password is handled by the script): `ceo@kinu.test` (Kinu staff), `owner1@x.test`
(owner), `finmgr@x.test`, `finstaff@x.test`, `opsstaff@x.test`, `sales@x.test` (Brooklyn only),
`auditor@x.test` (read-only), `owner2@x.test` (owner of the second, Ops-only brokerage),
`nobody@x.test` (no brokerage).

Before you finish: `npx tsc --noEmit` and `npx eslint .` must be clean for your files, each page
must load without errors for a user who may see it, and redirect to `/locked` for one who may not.
The local test server supports plain table reads and writes and `rpc` calls. It does **not**
support embedded selects (`select("a, other_table(b)")`), so fetch related rows with a second
query and join them in code.

Do not commit, do not edit shared files (`src/lib/*`, `src/components/ui.*`, `src/components/ActionForm.tsx`,
`src/components/Dock.*`, `src/app/(app)/layout.tsx`, `supabase/*`). If a shared file or the
database needs a change, say so in your final report instead of making it.
