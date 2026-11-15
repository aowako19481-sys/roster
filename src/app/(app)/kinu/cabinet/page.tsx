import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { DropZone } from "@/components/DropZone";
import { ButtonLink, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/access";
import { BRAND } from "@/lib/brand";
import { dayTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { fileInCabinet, removeFromCabinet } from "./actions";

export const metadata: Metadata = { title: "Filing cabinet" };

const SUGGESTED = ["Company", "Legal", "Insurance", "Banking", "Tax", "Templates", "General"];

export default async function CabinetPage() {
  const access = await requirePlatformAdmin();
  if (!access.isFounder) redirect("/kinu");
  const supabase = await createClient();
  const { data: files, error } = await supabase.from("founder_files").select("id, folder, title, file_name, note, created_at").order("folder").order("created_at", { ascending: false }).limit(1000);
  const rows = files ?? [];
  const folders = [...new Set([...rows.map((row) => row.folder as string), ...SUGGESTED])];
  const used = [...new Set(rows.map((row) => row.folder as string))];

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow={`${BRAND} · founder only`} title="Filing cabinet" sub="Your own company documents: formation papers, insurance, bank letters, templates. No one else at Kinu and no brokerage can see these.">
        <ButtonLink href="/kinu">Console</ButtonLink>
      </PageHeader>

      <div className={ui.grid2}>
        <Card title="File a document">
          <ActionForm action={fileInCabinet} resetOnSuccess>
            <label className={ui.field}>
              Title
              <input className={ui.input} name="title" required maxLength={160} placeholder="Certificate of formation" />
            </label>
            <div className={ui.formRow}>
              <label className={ui.field}>
                Folder
                <select className={ui.select} name="folder" defaultValue="Company">
                  {folders.map((folder) => (
                    <option key={folder}>{folder}</option>
                  ))}
                </select>
              </label>
              <label className={ui.field}>
                Or a new folder
                <input className={ui.input} name="new_folder" maxLength={60} placeholder="Leave empty to use the one chosen" />
              </label>
            </div>
            <DropZone name="file" label="The document" required />
            <label className={ui.field}>
              Note
              <input className={ui.input} name="note" maxLength={500} />
            </label>
            <div><Submit busy="Filing…">File it</Submit></div>
          </ActionForm>
        </Card>

        <Card title="In the cabinet" aside={<span className={ui.soft}>{rows.length} document{rows.length === 1 ? "" : "s"}</span>}>
          {error ? (
            <Empty>The filing cabinet needs the latest database update before it can be used.</Empty>
          ) : rows.length ? (
            used.map((folder) => (
              <div key={folder}>
                <p className={`brandLabel ${ui.eyebrow}`} style={{ margin: "14px 0 6px" }}>{folder}</p>
                <ul className={ui.list}>
                  {rows.filter((row) => row.folder === folder).map((row) => (
                    <li key={row.id}>
                      <div className={ui.inline} style={{ justifyContent: "space-between" }}>
                        <span>
                          <a className={ui.rowLink} href={`/kinu/cabinet/${row.id}`} target="_blank" rel="noopener noreferrer">
                            {row.title}<span className="sr-only"> (opens in a new tab)</span>
                          </a>
                          <span className={ui.soft}> · {dayTime(row.created_at)}</span>
                          {row.note && <><br /><span className={ui.soft}>{row.note}</span></>}
                        </span>
                        <ActionForm action={removeFromCabinet} className={ui.inline}>
                          <input type="hidden" name="id" value={row.id} />
                          <Submit small variant="link">Remove<span className="sr-only"> {row.title}</span></Submit>
                        </ActionForm>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <Empty>Nothing filed yet.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
