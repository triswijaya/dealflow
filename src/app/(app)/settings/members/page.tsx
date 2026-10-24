import { Users } from "lucide-react";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { getTeam } from "@/server/settings/team";
import { load, requireWorkspace } from "../../workspace";
import { SettingsTabs } from "../settings-tabs";
import { InviteButton, MemberActions, RevokeInvitationButton } from "./member-actions";

export const metadata = { title: "Anggota tim" };

export default async function MembersPage() {
  const workspace = await requireWorkspace(["OWNER", "ADMIN"]);
  const team = await load((headers) => getTeam({ headers }));
  const { timezone } = workspace;

  return (
    <>
      <PageHeader title="Anggota tim" description={`Kelola akses ke ruang kerja ${workspace.organization.name}.`} actions={<InviteButton />} />
      <SettingsTabs active="members" />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Anggota</th>
              <th>Role</th>
              <th>Status</th>
              <th>Bergabung</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {team.members.map((entry) => (
              <tr key={entry.memberId}>
                <td data-label="Anggota">
                  <div className="member-name">
                    <Avatar name={entry.name} />
                    <div>
                      <b>
                        {entry.name}
                        {entry.isSelf ? " (Anda)" : ""}
                      </b>
                      <small>{entry.email}</small>
                    </div>
                  </div>
                </td>
                <td data-label="Role">
                  <Badge>{ROLE_LABEL[entry.role]}</Badge>
                </td>
                <td data-label="Status">
                  <Badge tone={entry.active ? "success" : "neutral"}>{entry.active ? "Aktif" : "Nonaktif"}</Badge>
                </td>
                <td data-label="Bergabung">{formatDate(entry.joinedAt, timezone)}</td>
                <td data-label="Aksi">
                  <MemberActions member={entry} viewerRole={team.viewerRole} soleActiveOwner={team.soleActiveOwner} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 26 }}>
        <Card>
          <h2>Undangan tertunda</h2>
          {team.invitations.length === 0 ? (
            <EmptyState icon={Users} title="Tidak ada undangan tertunda." description="Undangan yang dikirim akan tampil di sini." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Diundang oleh</th>
                    <th>Dikirim</th>
                    <th>Kedaluwarsa</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {team.invitations.map((entry) => (
                    <tr key={entry.id}>
                      <td data-label="Email">{entry.email}</td>
                      <td data-label="Role">
                        <Badge>{ROLE_LABEL[entry.role as keyof typeof ROLE_LABEL] ?? entry.role}</Badge>
                      </td>
                      <td data-label="Diundang oleh">{entry.invitedByName}</td>
                      <td data-label="Dikirim">{formatDate(entry.sentAt, timezone)}</td>
                      <td data-label="Kedaluwarsa">{formatDate(entry.expiresAt, timezone)}</td>
                      <td data-label="Aksi">
                        <RevokeInvitationButton invitationId={entry.id} email={entry.email} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
