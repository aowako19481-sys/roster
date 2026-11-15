import { ActionForm, Submit } from "@/components/ActionForm";
import { ui } from "@/components/ui";
import { FIELD_SOURCES } from "@/lib/autofill";
import type { PdfField } from "@/lib/pdf";
import { savePdfMap } from "./actions";

type Template = { id: string; name: string; purpose: string; attach_receipt: boolean; fields: unknown; field_map: unknown };
const TYPE_LABEL: Record<string, string> = { text: "Text", checkbox: "Tick box", choice: "Choice" };

/** One row per field in the brokerage's PDF: fill from the deal, ask a person, or leave blank. */
export function PdfMapForm({ template, canManage }: { template: Template; canManage: boolean }) {
  const fields = (Array.isArray(template.fields) ? template.fields : []) as PdfField[];
  const map = (template.field_map ?? {}) as Record<string, string>;
  return (
    <ActionForm action={savePdfMap}>
      <input type="hidden" name="id" value={template.id} />
      <fieldset disabled={!canManage} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 16 }}>
        <legend className="sr-only">Document settings and fields</legend>
        <div className={ui.formRow}>
          <label className={ui.field}>
            Document name
            <input className={ui.input} name="name" defaultValue={template.name} required minLength={2} maxLength={80} />
          </label>
          <label className={ui.field}>
            Used as
            <select className={ui.select} name="purpose" defaultValue={template.purpose}>
              <option value="deposit_record">The deposit record</option>
              <option value="deal">Another document for a deal</option>
            </select>
          </label>
        </div>
        <label className={ui.check}>
          <input type="checkbox" name="attach_receipt" defaultChecked={template.attach_receipt} />
          <span>Offer a bank receipt drop box on each deal</span>
        </label>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">Field in your PDF</th>
                <th scope="col">Kind</th>
                <th scope="col">Fill it with</th>
                <th scope="col">Label for the person filling it in</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const current = map[field.name] ?? "";
                const typed = current.startsWith("fill:");
                return (
                  <tr key={field.name}>
                    <th scope="row" className={ui.mono}>
                      {field.name}
                    </th>
                    <td>{TYPE_LABEL[field.type] ?? field.type}</td>
                    <td>
                      <select key={current} className={ui.select} name={`map_${index}`} defaultValue={typed ? "fill" : current} aria-label={`Fill ${field.name} with`}>
                        <option value="">Leave blank</option>
                        <option value="fill">Someone types it in on each deal</option>
                        {field.type === "text" &&
                          FIELD_SOURCES.map((source) => (
                            <option key={source.key} value={source.key}>
                              {source.label}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <input
                        key={current}
                        className={ui.input}
                        name={`label_${index}`}
                        defaultValue={typed ? current.slice(5) : ""}
                        maxLength={60}
                        placeholder={field.type === "checkbox" ? "e.g. Wire received (type yes)" : "Only if someone types it in"}
                        aria-label={`Label for ${field.name}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canManage ? <Submit>Save</Submit> : <p className={ui.help}>Only a manager can change this document.</p>}
      </fieldset>
      <p className={ui.help}>
        Tick boxes are ticked when the person types &quot;yes&quot;. The downloaded copy is final: its fields can no longer be edited.
      </p>
    </ActionForm>
  );
}
