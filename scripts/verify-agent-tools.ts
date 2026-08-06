/**
 * Throwaway smoke test for the agent's LAPS-native tools that use ctx+prisma
 * directly (reads + create_task). Tools that delegate to server actions rely on
 * auth() and are covered by the live smoke after deploy. Run from repo root:
 *   set -a && . ./.env && set +a && npx tsx scripts/verify-agent-tools.ts
 */
import { prisma } from "@/lib/prisma";
import { TOOLS_BY_NAME, type AgentContext } from "@/lib/agent/tools";

async function run(name: string, input: Record<string, unknown>, ctx: AgentContext) {
  const tool = TOOLS_BY_NAME[name];
  if (!tool) throw new Error(`No tool ${name}`);
  const res = await tool.run(input, ctx);
  console.log(`  ${name}(${JSON.stringify(input)}) → ok=${res.ok} ${JSON.stringify(res).slice(0, 160)}`);
  return res;
}

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user in DB to act as.");
  const ctx: AgentContext = { userId: user.id, role: user.role, name: user.name, email: user.email };
  console.log(`Acting as ${user.email} (${user.id})\n`);

  console.log("READ TOOLS");
  const ps = await run("pipeline_summary", {}, ctx);
  if (!ps.ok) throw new Error("pipeline_summary failed");
  await run("list_leads", { limit: 3 }, ctx);
  await run("list_leads", { stage: "NEW", limit: 3 }, ctx);
  await run("list_appointments", { when: "upcoming", limit: 3 }, ctx);
  await run("list_proposals", { limit: 3 }, ctx);
  await run("list_tasks", {}, ctx);
  await run("list_event_types", {}, ctx);

  const someLead = await prisma.lead.findFirst({ select: { id: true } });
  if (someLead) await run("get_lead", { id: someLead.id }, ctx);

  console.log("\nWRITE TOOL (create_task → then delete)");
  const created = await run(
    "create_task",
    { description: "THROWAWAY agent-tool test task", dueDate: "2099-01-01" },
    ctx,
  );
  if (!created.ok || typeof created.id !== "string") throw new Error("create_task failed");
  const taskId = created.id;

  const listed = await run("list_tasks", {}, ctx);
  const found = Array.isArray(listed.tasks)
    ? (listed.tasks as { id: string }[]).some((t) => t.id === taskId)
    : false;
  console.log(`  task ${taskId} present in list_tasks: ${found}`);
  if (!found) throw new Error("created task not visible to list_tasks");

  await prisma.actionItem.delete({ where: { id: taskId } });
  console.log(`  cleaned up throwaway task ${taskId}`);

  console.log("\n✅ agent tools smoke passed");
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
