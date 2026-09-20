import Link from "next/link";
import { Inbox, Radio, Activity, Boxes, Gauge, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const MODULES = [
  {
    name: "Triage",
    caption: "Email",
    href: "/inbox",
    icon: Inbox,
    body: "Your Microsoft 365 inbox — read, reply, archive, tag, and turn messages into leads, tasks, or booked calls.",
  },
  {
    name: "Marketing",
    caption: "Content engine",
    href: "/marketing/evidence",
    icon: Radio,
    body: "Evidence → Calling Cards → Housed Content → Optics. Build the language and content that earns trust.",
  },
  {
    name: "Sales",
    caption: "Sales cycle",
    href: "/pipeline",
    icon: Activity,
    body: "Pipeline, leads, appointments, proposals, and reporting — the full lead-to-close sales workflow.",
  },
  {
    name: "Work",
    caption: "Delivery",
    href: "/work/engagements",
    icon: Boxes,
    body: "Client delivery, stage by stage — Staging, Takeoff, Assemble, Package, Leverage, Evangelize. Won deals land here automatically.",
  },
  {
    name: "Finance",
    caption: "Reporting & cash",
    href: "/finance/actuals",
    icon: Gauge,
    body: "Actuals from QuickBooks, general ledger, budgets, rolling cash forecasts, and the live KPI pulse — the financial command layer across all entities.",
  },
];

export default function HomePage() {
  return (
    <div>
      <PageHeader
        eyebrow="Pulse — Edler Zain"
        title="Home"
        description="Pick a module to work in."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.name}
              href={m.href}
              className="group flex flex-col border-2 border-ink bg-surface p-6 no-underline hover:bg-bg"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-7 w-7" />
                <ArrowRight className="h-5 w-5 text-neutral-500 group-hover:text-accent" />
              </div>
              <div className="mt-4 font-heading text-[26px] font-extrabold leading-none">{m.name}</div>
              <div className="micro-label mt-1 text-neutral-600">{m.caption}</div>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">{m.body}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
