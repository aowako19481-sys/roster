import { ActionForm, Submit } from "@/components/ActionForm";
import { ui } from "@/components/ui";
import { saveTemplate } from "./actions";

type Template = { id: string; name: string; body: string; purpose: string; attach_proof: boolean; attach_receipt: boolean };

export const STARTER = `# {{brokerage}}
## Deposit record

Property: {{address}}
Deal type: {{type}}
Deposit date: {{deposit_date}}
Gross commission: {{gci}}

## Payments received
{{payments_table}}

## Agents and payouts
{{payouts_table}}

Deposit slip number: {{fill:Deposit slip number}}

---
{{signature_lines}}`;

/** The layout editor. Used for a new document and for changing an existing one. */
export function TemplateForm({ template }: { template?: Template }) {
  return (
    <ActionForm action={saveTemplate}>
      {template && <input type="hidden" name="id" value={template.id} />}
      <div className={ui.formRow}>
        <label className={ui.field}>
          Document name
          <input className={ui.input} name="name" defaultValue={template?.name ?? ""} required maxLength={80} placeholder="Deposit record" />
        </label>
        <label className={ui.field}>
          Used as
          <select className={ui.select} name="purpose" defaultValue={template?.purpose ?? "deposit_record"}>
            <option value="deposit_record">The deposit record</option>
            <option value="deal">Another document for a deal</option>
          </select>
        </label>
      </div>
      <label className={ui.field}>
        Layout
        <textarea
          className={ui.textarea}
          name="body"
          defaultValue={template?.body ?? STARTER}
          required
          maxLength={20000}
          rows={22}
          spellCheck={false}
          style={{ fontFamily: "var(--mono)", fontSize: 13, minHeight: 420 }}
          aria-describedby="layout-help"
        />
      </label>
      <p id="layout-help" className={ui.help}>
        Write your document the way you want it to read. Wherever deal information belongs, put a placeholder from the
        list on this page. Paste the wording of your existing deposit record and swap the changing parts for
        placeholders.
      </p>
      <label className={ui.check}>
        <input type="checkbox" name="attach_proof" defaultChecked={template?.attach_proof ?? true} />
        <span>Attach the proof of payment under this document</span>
      </label>
      <label className={ui.check}>
        <input type="checkbox" name="attach_receipt" defaultChecked={template?.attach_receipt ?? false} />
        <span>Add a bank receipt drop zone to each deal, and attach the receipt under this document</span>
      </label>
      <Submit>{template ? "Save layout" : "Create document"}</Submit>
    </ActionForm>
  );
}
