import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { NewResourceButton } from "@/components/work/new-resource";
import { listRoleBands } from "@/lib/work/capacity";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const [resources, bands] = await Promise.all([
    prisma.poolResource.findMany({ orderBy: { personName: "asc" }, include: { roleBand: true } }),
    listRoleBands(),
  ]);
  const bandOptions = bands.map((b) => ({ id: b.id, name: b.name }));

  return (
    <div>
      <PageHeader
        eyebrow="Work — Capacity"
        title="Pool resources"
        description="Delivery staff in the shared pool. The role band sets the charge rate; log their hours under Time."
      >
        <NewResourceButton bands={bandOptions} />
      </PageHeader>

      {resources.length === 0 ? (
        <p className="text-[14px] text-muted">No resources yet. Add pool members to sync their Karbon hours.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role band</th>
              <th className="num">Capacity</th>
              <th>Skills</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id}>
                <td className="font-heading font-extrabold">{r.personName}</td>
                <td className="text-muted">{r.email}</td>
                <td>{r.roleBand.name}</td>
                <td className="num">{Number(r.weeklyCapacityHours)}h</td>
                <td className="text-muted">{r.skillTags.join(", ") || "—"}</td>
                <td>
                  <span className={`tag ${r.active ? "tag-neutral" : "tag-outline"}`}>{r.active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
