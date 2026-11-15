import { Empty, ui } from "@/components/ui";
import { AUDIT_ENTITIES, auditFields, describeAudit, type AuditRow } from "@/lib/admin-pages";
import { dayTime } from "@/lib/format";
import styles from "../settings.module.css";

/** The audit log as a table: when, who, a readable line, and the changed fields on request. */
export function AuditTable({ rows, timeZone, empty }: { rows: AuditRow[]; timeZone: string; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className={ui.tableWrap}>
      <table className={ui.table}>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Who</th>
            <th scope="col">Area</th>
            <th scope="col">What happened</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const fields = auditFields(row.detail);
            return (
              <tr key={row.id}>
                <td className={`${ui.soft} ${styles.nowrap}`}>{dayTime(row.at, timeZone)}</td>
                <td>{row.actor_label ?? "System"}</td>
                <td className={ui.soft}>{AUDIT_ENTITIES[row.entity] ?? row.entity}</td>
                <td>
                  {describeAudit(row)}
                  {fields.length > 0 && (
                    <details className={styles.details}>
                      <summary className={ui.soft}>
                        Details<span className="sr-only"> of entry {row.id}</span>
                      </summary>
                      <dl className={ui.kv}>
                        {fields.map((field) => (
                          <div key={field.label} className={styles.pair}>
                            <dt>{field.label}</dt>
                            <dd className={`${ui.soft} ${styles.wrap}`}>{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
