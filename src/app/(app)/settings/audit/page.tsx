import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, Tabs, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import {
  AUDIT_ENTITIES, AUDIT_PAGE_SIZE, auditEntity, auditSearch, auditSearchFilter, pageNumber, settingsTabs, type AuditRow,
} from "@/lib/admin-pages";
import { createClient } from "@/lib/supabase/server";
import styles from "../settings.module.css";
import { AuditTable } from "./AuditTable";

export const metadata: Metadata = { title: "Audit log" };

type Props = { searchParams: Promise<{ entity?: string | string[]; q?: string | string[]; page?: string | string[] }> };

export default async function AuditPage({ searchParams }: Props) {
  const access = await requireCap("audit.view");
  const ws = access.workspace;
  const raw = await searchParams;
  // Only fixed names and a cleaned-up search term are used; what was typed is never shown back.
  const entity = auditEntity(raw.entity);
  const q = auditSearch(raw.q);
  const page = pageNumber(raw.page);
  const from = (page - 1) * AUDIT_PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase.from("audit_log")
    .select("id, actor_label, action, entity, entity_id, summary, detail, at", { count: "exact" })
    .eq("workspace_id", ws.id);
  if (entity) query = query.eq("entity", entity);
  if (q) query = query.or(auditSearchFilter(q));
  const { data, count, error } = await query.order("at", { ascending: false }).order("id", { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1);

  const rows = (data ?? []) as AuditRow[];
  const total = count ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const filtered = Boolean(entity || q);

  const link = (target: number | null, path = "/settings/audit") => {
    const params = new URLSearchParams();
    if (entity) params.set("entity", entity);
    if (q) params.set("q", q);
    if (target && target > 1) params.set("page", String(target));
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Settings" title="Audit log" sub="Who did what, and when. Entries are written by the database itself and cannot be edited or removed.">
        <a href={link(null, "/settings/audit/export")} className={ui.btn} download>
          Export CSV
        </a>
      </PageHeader>
      <Tabs items={settingsTabs(access.caps)} current="/settings/audit" />

      <Card title="Find entries">
        <form method="get" action="/settings/audit" className={ui.inline} role="search">
          <label className={ui.field}>
            Area
            <select className={ui.select} name="entity" defaultValue={entity ?? ""}>
              <option value="">Everything</option>
              {Object.entries(AUDIT_ENTITIES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label className={ui.field}>
            Search
            <input className={ui.input} type="search" name="q" maxLength={60} autoComplete="off" />
          </label>
          <button type="submit" className={ui.btnPrimary}>Show</button>
          {filtered && <Link href="/settings/audit" className={ui.btn}>Clear filters</Link>}
        </form>
        <p className={ui.help}>
          Search looks at the person, the description and the kind of record. Letters, numbers and spaces only.
          {q ? " A search is switched on; choose “Clear filters” to see everything again." : ""}
        </p>
      </Card>

      <Card
        title={filtered ? "Matching entries" : "All entries"}
        aside={<span className={ui.soft}>{total === 1 ? "1 entry" : `${total.toLocaleString("en-US")} entries`} · newest first</span>}
      >
        {error ? (
          <p className={ui.empty}>The log could not be loaded. Try again in a moment.</p>
        ) : (
          <AuditTable
            rows={rows}
            timeZone={ws.timezone}
            empty={filtered ? "Nothing matches. Try a different area or search." : "Nothing has been recorded yet."}
          />
        )}
        {pages > 1 && (
          <nav className={styles.pager} aria-label="Pages">
            <span className={ui.soft}>Page {Math.min(page, pages)} of {pages}</span>
            <span className={ui.inline}>
              {page > 1 && <Link href={link(page - 1)} className={`${ui.btn} ${ui.small}`} rel="prev">Newer</Link>}
              {page < pages && <Link href={link(page + 1)} className={`${ui.btn} ${ui.small}`} rel="next">Older</Link>}
            </span>
          </nav>
        )}
      </Card>
    </div>
  );
}
