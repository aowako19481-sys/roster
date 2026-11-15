import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, Empty, PageHeader, Placeholder, Tabs, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { settingsTabs } from "@/lib/admin-pages";
import { day, titleCase } from "@/lib/format";
import { BUILT_IN_ROLES, CAP_GROUPS, roleLabel } from "@/lib/roles";
import { supabaseSecretKey } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import styles from "../settings.module.css";
import {
  cancelInvite, deleteRole, inviteMember, removeMember, restoreMember, saveRole, setPower, updateMember,
} from "./actions";

export const metadata: Metadata = { title: "People and roles" };

type Member = {
  user_id: string; role: string; display_name: string | null; email: string | null; status: string;
  office_id: string | null; custom_role_id: string | null; can_override: boolean; can_release_payroll: boolean;
};
type Office = { id: string; name: string };
type CustomRole = { id: string; name: string; caps: string[]; office_id: string | null };

const POWERS = [
  { key: "override", label: "Override", column: "can_override", what: "pay a deal at a split that does not match the rider" },
  { key: "payroll.release", label: "Release payroll", column: "can_release_payroll", what: "release a payroll after cutoff" },
] as const;

function RoleFields({ role, offices, idPrefix }: { role?: CustomRole; offices: Office[]; idPrefix: string }) {
  return (
    <>
      <div className={ui.formRow}>
        <label className={ui.field}>
          Role name
          <input className={ui.input} name="name" defaultValue={role?.name ?? ""} required minLength={2} maxLength={60} autoComplete="off" />
        </label>
        <label className={ui.field}>
          Where
          <select className={ui.select} name="office" defaultValue={role?.office_id ?? ""}>
            <option value="">All offices</option>
            {offices.map((office) => (
              <option key={office.id} value={office.id}>{office.name} only</option>
            ))}
          </select>
        </label>
      </div>
      {CAP_GROUPS.map((group) => (
        <fieldset key={group.title} className={styles.group}>
          <legend>{group.title}</legend>
          <div className={styles.checks}>
            {group.caps.map((entry) => (
              <label key={entry.cap} className={ui.check} htmlFor={`${idPrefix}-${entry.cap}`}>
                <input
                  id={`${idPrefix}-${entry.cap}`}
                  type="checkbox"
                  name={`cap_${entry.cap}`}
                  defaultChecked={role?.caps.includes(entry.cap) ?? false}
                />{" "}
                {entry.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}

export default async function PeoplePage() {
  const access = await requireCap("members.manage");
  const ws = access.workspace;
  const editable = !access.viewAs;
  const supabase = await createClient();

  const [membersRes, officesRes, rolesRes, invitesRes, ...previews] = await Promise.all([
    supabase.from("workspace_members")
      .select("user_id, role, display_name, email, status, office_id, custom_role_id, can_override, can_release_payroll")
      .eq("workspace_id", ws.id).order("created_at").limit(1000),
    supabase.from("offices").select("id, name").eq("workspace_id", ws.id).order("name").limit(200),
    supabase.from("custom_roles").select("id, name, caps, office_id").eq("workspace_id", ws.id).order("name").limit(200),
    supabase.from("member_invites").select("id, email, role, office_id, created_at")
      .eq("workspace_id", ws.id).is("accepted_at", null).order("created_at", { ascending: false }).limit(200),
    ...BUILT_IN_ROLES.map((role) => supabase.rpc("role_preview", { ws: ws.id, role })),
  ]);

  const members = (membersRes.data ?? []) as Member[];
  const offices = (officesRes.data ?? []) as Office[];
  const roles = (rolesRes.data ?? []) as CustomRole[];
  const invites = invitesRes.data ?? [];
  const officeName = new Map(offices.map((office) => [office.id, office.name]));
  const roleName = new Map(roles.map((role) => [role.id, role.name]));
  const roleCaps = new Map(BUILT_IN_ROLES.map((role, index) => [role, new Set<string>(Array.isArray(previews[index]?.data) ? (previews[index].data as string[]) : [])]));

  const me = members.find((member) => member.user_id === access.userId);
  const iAmOwner = access.isPlatformAdmin || (me?.role === "owner_admin" && me.status === "active");
  const mayGrant = iAmOwner && editable;
  const active = members.filter((member) => member.status === "active");
  const hasKey = Boolean(supabaseSecretKey());
  const nameOf = (member: Member) => member.display_name ?? member.email ?? "No name yet";
  const roleOf = (member: Member) =>
    member.custom_role_id ? roleName.get(member.custom_role_id) ?? "Custom role" : roleLabel(member.role);

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Settings" title="People and roles" sub={`Who can open ${ws.name}, what they can see and do, and who holds the big powers.`} />
      <Tabs items={settingsTabs(access.caps)} current="/settings/people" />

      <Card title="People" aside={<span className={ui.soft}>{active.length} active</span>}>
        {members.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Office</th>
                  <th scope="col">Status</th>
                  <th scope="col">Big powers</th>
                </tr>
              </thead>
              {members.map((member) => {
                const isOwner = member.role === "owner_admin";
                const powers = isOwner
                  ? "Override · Release payroll (owner)"
                  : [member.can_override && "Override", member.can_release_payroll && "Release payroll"].filter(Boolean).join(" · ") || "None";
                return (
                  <tbody key={member.user_id}>
                    <tr>
                      <th scope="row" className={ui.strong}>
                        {nameOf(member)}
                        {member.user_id === access.userId && <span className={ui.soft}> (you)</span>}
                      </th>
                      <td className={ui.soft}>{member.email ?? "–"}</td>
                      <td>
                        {roleOf(member)}
                        {member.custom_role_id && <span className={ui.soft}> · custom</span>}
                      </td>
                      <td>{member.office_id ? officeName.get(member.office_id) ?? "–" : "All offices"}</td>
                      <td><Badge tone={member.status === "active" ? "ok" : "muted"}>{titleCase(member.status)}</Badge></td>
                      <td className={ui.soft}>{member.status === "active" ? powers : "None"}</td>
                    </tr>
                    {editable && (
                      <tr>
                        <td colSpan={6}>
                          {member.status === "active" ? (
                            <details className={styles.details}>
                              <summary className={ui.soft}>Change or remove {nameOf(member)}</summary>
                              <div className={styles.panel}>
                                <ActionForm action={updateMember}>
                                  <input type="hidden" name="member" value={member.user_id} />
                                  <div className={ui.formRow}>
                                    <label className={ui.field}>
                                      Name
                                      <input className={ui.input} name="name" defaultValue={member.display_name ?? ""} maxLength={120} autoComplete="off" />
                                    </label>
                                    <label className={ui.field}>
                                      Role
                                      <select className={ui.select} name="role" defaultValue={member.custom_role_id ? `custom:${member.custom_role_id}` : `role:${member.role}`}>
                                        <optgroup label="Built-in roles">
                                          {BUILT_IN_ROLES.map((role) => (
                                            <option key={role} value={`role:${role}`}>{roleLabel(role)}</option>
                                          ))}
                                        </optgroup>
                                        {roles.length > 0 && (
                                          <optgroup label="Custom roles">
                                            {roles.map((role) => (
                                              <option key={role.id} value={`custom:${role.id}`}>{role.name}</option>
                                            ))}
                                          </optgroup>
                                        )}
                                      </select>
                                    </label>
                                    <label className={ui.field}>
                                      Office
                                      <select className={ui.select} name="office" defaultValue={member.office_id ?? ""}>
                                        <option value="">All offices</option>
                                        {offices.map((office) => (
                                          <option key={office.id} value={office.id}>{office.name}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                  <p className={ui.help}>
                                    Changing someone’s built-in role takes away any big powers they were given. The office only
                                    limits what a Sales manager sees; a custom role carries its own office.
                                  </p>
                                  <div>
                                    <Submit small>Save changes</Submit>
                                  </div>
                                </ActionForm>
                                {member.user_id !== access.userId && (
                                  <ActionForm action={removeMember}>
                                    <input type="hidden" name="member" value={member.user_id} />
                                    <div>
                                      <Submit small variant="danger">Remove {nameOf(member)}</Submit>
                                    </div>
                                  </ActionForm>
                                )}
                              </div>
                            </details>
                          ) : (
                            <ActionForm action={restoreMember} className={ui.inline}>
                              <input type="hidden" name="member" value={member.user_id} />
                              <Submit small variant="plain">Restore access for {nameOf(member)}</Submit>
                            </ActionForm>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        ) : (
          <Empty>Nobody has access yet.</Empty>
        )}
      </Card>

      <div className={ui.grid2}>
        <Card title="Invite a person">
          {editable ? (
            <ActionForm action={inviteMember} resetOnSuccess>
              <label className={ui.field}>
                Work email
                <input className={ui.input} name="email" type="email" required maxLength={254} autoComplete="off" />
              </label>
              <div className={ui.formRow}>
                <label className={ui.field}>
                  Role
                  <select className={ui.select} name="role" defaultValue="ops_staff">
                    {BUILT_IN_ROLES.map((role) => (
                      <option key={role} value={role}>{roleLabel(role)}</option>
                    ))}
                  </select>
                </label>
                <label className={ui.field}>
                  Office (optional)
                  <select className={ui.select} name="office" defaultValue="">
                    <option value="">All offices</option>
                    {offices.map((office) => (
                      <option key={office.id} value={office.id}>{office.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <Submit>Invite</Submit>
              </div>
            </ActionForm>
          ) : (
            <Empty>Switch back to yourself to invite people.</Empty>
          )}
          {hasKey ? (
            <p className={ui.help}>
              Inviting someone creates their login, so they can sign in with that email straight away. Give them a custom role
              from the list above once they are added.
            </p>
          ) : (
            <Placeholder service="Supabase secret key">
              The invitation is recorded now, and someone who already has a login is added straight away. A person who is new
              will be able to sign in once the server key is added, which lets the app create their login.
            </Placeholder>
          )}
          <Placeholder service="Email">
            No invitation email is sent yet. Tell the person yourself until email is connected.
          </Placeholder>
        </Card>

        <Card title="Pending invitations" aside={<span className={ui.soft}>{invites.length} waiting</span>}>
          {invites.length ? (
            <ul className={ui.list}>
              {invites.map((invite) => (
                <li key={invite.id}>
                  <div className={ui.inline}>
                    <span>
                      <span className={ui.strong}>{invite.email}</span>
                      <br />
                      <span className={ui.soft}>
                        {roleLabel(invite.role)}
                        {invite.office_id ? ` · ${officeName.get(invite.office_id) ?? "one office"}` : ""} · invited {day(invite.created_at, ws.timezone)}
                      </span>
                    </span>
                    {editable && (
                      <ActionForm action={cancelInvite} className={ui.inline}>
                        <input type="hidden" name="invite" value={invite.id} />
                        <Submit small variant="plain">Cancel<span className="sr-only"> invitation for {invite.email}</span></Submit>
                      </ActionForm>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No invitations are waiting.</Empty>
          )}
        </Card>
      </div>

      <Card title="Big powers" aside={<Badge tone="dark">Owner only</Badge>}>
        <div className={ui.stack}>
          <p className={styles.warning}>
            <strong>Grant these with care.</strong> Override lets a person pay a deal at a split that does not match the signed
            rider. Release payroll lets a person release a payroll. They are never part of a role: an owner gives them to one
            person at a time, every grant and removal is written to the audit log, and changing someone’s role or removing them
            takes the powers away again.
          </p>
          <Placeholder service="Step-up sign-in">
            Re-entering your password or a two-factor code before granting a big power will be required once two-factor sign-in
            is connected. The grant will also be emailed to the person receiving it once email is connected.
          </Placeholder>
          {!iAmOwner && (
            <p className={ui.help}>Only an owner can grant or remove these. You can see who holds them.</p>
          )}
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  {POWERS.map((power) => (
                    <th key={power.key} scope="col">{power.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map((member) => (
                  <tr key={member.user_id}>
                    <th scope="row" className={ui.strong}>{nameOf(member)}</th>
                    <td>{roleOf(member)}</td>
                    {POWERS.map((power) => {
                      if (member.role === "owner_admin") {
                        return <td key={power.key}><Badge tone="dark">Always (owner)</Badge></td>;
                      }
                      const has = member[power.column];
                      return (
                        <td key={power.key}>
                          <div className={ui.inline}>
                            <Badge tone={has ? "warn" : "muted"}>{has ? "Granted" : "Not granted"}</Badge>
                            {mayGrant && (
                              <ActionForm action={setPower} className={ui.inline}>
                                <input type="hidden" name="member" value={member.user_id} />
                                <input type="hidden" name="power" value={power.key} />
                                <input type="hidden" name="granted" value={has ? "no" : "yes"} />
                                <Submit small variant={has ? "plain" : "danger"}>
                                  {has ? "Remove" : "Grant"}
                                  <span className="sr-only"> {power.label} {has ? "from" : "to"} {nameOf(member)}</span>
                                </Submit>
                              </ActionForm>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card title="Custom roles" aside={<span className={ui.soft}>{roles.length} made</span>}>
        <div className={ui.stack}>
          <p className={ui.help}>
            Build a role from a checklist of what it can see and do, and where. Big powers are not on the list on purpose.
            Give a custom role to someone from the People list above. Permissions for a product the brokerage does not have
            stay switched off.
          </p>
          {roles.length ? (
            <ul className={ui.list}>
              {roles.map((role) => {
                const holders = active.filter((member) => member.custom_role_id === role.id).length;
                return (
                  <li key={role.id}>
                    <span className={ui.strong}>{role.name}</span>{" "}
                    <span className={ui.soft}>
                      · {role.caps.length} {role.caps.length === 1 ? "permission" : "permissions"} ·{" "}
                      {role.office_id ? `${officeName.get(role.office_id) ?? "one office"} only` : "all offices"} ·{" "}
                      {holders === 1 ? "1 person" : `${holders} people`}
                    </span>
                    {editable && (
                      <details className={styles.details}>
                        <summary className={ui.soft}>Edit or delete {role.name}</summary>
                        <div className={styles.panel}>
                          <ActionForm action={saveRole}>
                            <input type="hidden" name="role_id" value={role.id} />
                            <RoleFields role={role} offices={offices} idPrefix={`r-${role.id}`} />
                            <div>
                              <Submit small>Save role</Submit>
                            </div>
                          </ActionForm>
                          <ActionForm action={deleteRole}>
                            <input type="hidden" name="role_id" value={role.id} />
                            <div>
                              <Submit small variant="danger">Delete {role.name}</Submit>
                            </div>
                          </ActionForm>
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No custom roles yet. The built-in roles below cover most brokerages.</Empty>
          )}
          {editable && (
            <details className={styles.details}>
              <summary className={ui.strong}>Create a custom role</summary>
              <div className={styles.panel}>
                <ActionForm action={saveRole} resetOnSuccess>
                  <RoleFields offices={offices} idPrefix="r-new" />
                  <div>
                    <Submit>Create role</Submit>
                  </div>
                </ActionForm>
              </div>
            </details>
          )}
        </div>
      </Card>

      <Card title="What each built-in role can do">
        <div className={ui.tableWrap}>
          <table className={`${ui.table} ${styles.matrix}`}>
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {BUILT_IN_ROLES.map((role) => (
                  <th key={role} scope="col">{roleLabel(role)}</th>
                ))}
              </tr>
            </thead>
            {CAP_GROUPS.map((group) => (
              <tbody key={group.title}>
                <tr>
                  <th scope="colgroup" colSpan={BUILT_IN_ROLES.length + 1} className="brandLabel">{group.title}</th>
                </tr>
                {group.caps.map((entry) => (
                  <tr key={entry.cap}>
                    <th scope="row">{entry.label}</th>
                    {BUILT_IN_ROLES.map((role) => (
                      <td key={role}>
                        {roleCaps.get(role)?.has(entry.cap) ? "Yes" : <span className={ui.soft}>No</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
            <tbody>
              <tr>
                <th scope="colgroup" colSpan={BUILT_IN_ROLES.length + 1} className="brandLabel">Big powers</th>
              </tr>
              {POWERS.map((power) => (
                <tr key={power.key}>
                  <th scope="row">{power.label}</th>
                  {BUILT_IN_ROLES.map((role) => (
                    <td key={role}>{role === "owner_admin" ? "Yes" : <span className={ui.soft}>Only if granted</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={ui.help}>
          This table is read from the database for this brokerage, so a product that is not in the plan shows as “No” for
          every role. A Sales manager sees only their own office.
        </p>
      </Card>
    </div>
  );
}
