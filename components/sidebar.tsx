"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Home,
  Activity,
  Users,
  Calendar,
  FileText,
  Trophy,
  BarChart3,
  Settings,
  Vault,
  Megaphone,
  Radio,
  PenLine,
  LineChart,
  Inbox,
  Boxes,
  ClipboardList,
  Gauge,
  Landmark,
  Clock,
  CalendarRange,
  Waves,
  Table2,
  Scale,
  FileBarChart,
  Crosshair,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };
type Module = {
  key: string;
  name: string;
  caption: string;
  href: string;
  icon: LucideIcon;
  items: NavItem[];
};

// Top-level modules, in display order: Triage, Marketing, Sales, Work, Finance.
const MODULES: Module[] = [
  {
    key: "triage",
    name: "Triage",
    caption: "Email & tasks",
    href: "/inbox",
    icon: Inbox,
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/tasks", label: "To-Do", icon: ClipboardList },
    ],
  },
  {
    key: "marketing",
    name: "Marketing",
    caption: "Content engine",
    href: "/marketing/evidence",
    icon: Radio,
    items: [
      { href: "/marketing/evidence", label: "Evidence", icon: Vault },
      { href: "/marketing/calling-cards", label: "Keywords & Phrases", icon: Megaphone },
      { href: "/marketing/content", label: "Content Builder", icon: PenLine },
      { href: "/marketing/optics", label: "Content Performance", icon: LineChart },
    ],
  },
  {
    key: "sales",
    name: "Sales",
    caption: "Sales cycle",
    href: "/pipeline",
    icon: Activity,
    items: [
      { href: "/pipeline", label: "Pipeline", icon: Activity },
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/prospecting", label: "Prospecting", icon: Crosshair },
      { href: "/appointments", label: "Appointments", icon: Calendar },
      { href: "/proposals", label: "Proposals", icon: FileText },
      { href: "/sales", label: "Sales Closed", icon: Trophy },
      { href: "/reporting", label: "Reporting", icon: BarChart3 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    key: "work",
    name: "Work",
    caption: "Delivery",
    href: "/work/engagements",
    icon: Boxes,
    items: [
      { href: "/work/engagements", label: "Delivery", icon: ClipboardList },
      { href: "/work/capacity/grid", label: "Capacity grid", icon: CalendarRange },
      { href: "/work/capacity/queue", label: "Booking queue", icon: Inbox },
      { href: "/work/capacity/engagements", label: "Engagements", icon: Table2 },
      { href: "/work/capacity/time", label: "Time", icon: Clock },
      { href: "/work/capacity/portfolios", label: "Portfolios", icon: Landmark },
      { href: "/work/capacity/resources", label: "Resources", icon: Users },
      { href: "/work/capacity/admin", label: "Capacity admin", icon: Settings },
    ],
  },
  {
    key: "finance",
    name: "Finance",
    caption: "Reporting & cash",
    href: "/finance/actuals",
    icon: Gauge,
    items: [
      { href: "/finance/actuals", label: "Actuals", icon: Landmark },
      { href: "/finance/cash", label: "Cash Forecast", icon: Waves },
      { href: "/finance/budgets", label: "Budgets", icon: Table2 },
      { href: "/finance/variance", label: "Budget vs Actual", icon: Scale },
      { href: "/finance/review", label: "Operating Review", icon: FileBarChart },
      { href: "/finance/entities", label: "Entities", icon: Boxes },
    ],
  },
];

function activeModuleKey(pathname: string): string | null {
  if (pathname.startsWith("/inbox") || pathname.startsWith("/tasks")) return "triage";
  if (pathname.startsWith("/marketing")) return "marketing";
  if (pathname.startsWith("/work")) return "work";
  if (pathname.startsWith("/finance")) return "finance";
  if (pathname.startsWith("/home")) return null;
  return "sales"; // pipeline/leads/appointments/proposals/sales/reporting/settings
}

function itemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  user,
}: {
  user: { name?: string | null; email?: string | null; role?: string };
}) {
  const pathname = usePathname();
  const activeKey = activeModuleKey(pathname);
  const activeModule = MODULES.find((m) => m.key === activeKey) ?? null;

  return (
    <aside className="flex h-screen w-[248px] shrink-0 flex-col border-r-2 border-divider bg-bg">
      {/* Brand → Home */}
      <Link href="/home" className="block border-b-2 border-divider px-4 py-6 no-underline">
        <div className="font-heading text-[22px] font-extrabold leading-none tracking-[-0.03em] text-ink">
          Pulse
        </div>
        <div className="micro-label mt-2">Edler Zain</div>
      </Link>

      <nav className="flex-1 overflow-y-auto p-2">
        {/* Module switcher */}
        <div className="space-y-0.5">
          <SwitcherLink href="/home" label="Home" icon={Home} active={activeKey === null} />
          {MODULES.map((m) => (
            <SwitcherLink
              key={m.key}
              href={m.href}
              label={m.name}
              icon={m.icon}
              active={activeKey === m.key}
            />
          ))}
        </div>

        {/* Current module's pages */}
        {activeModule && activeModule.items.length > 0 && (
          <div className="mt-5">
            <div className="flex items-baseline gap-2 px-3 pb-1">
              <span className="micro-label text-neutral-500">{activeModule.name}</span>
            </div>
            <div className="space-y-0.5">
              {activeModule.items.map((item) => {
                const Icon = item.icon;
                const active = itemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "grid grid-cols-[18px_1fr] items-center gap-3 px-3 py-2.5 font-heading text-[14px] font-extrabold",
                      active
                        ? "bg-accent text-bg hover:bg-accent-600"
                        : "text-ink hover:bg-[color:color-mix(in_srgb,var(--color-text)_7%,transparent)]",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Footer / user */}
      <div className="border-t-2 border-divider px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-ink font-heading text-[12px] font-extrabold text-bg">
            {initials(user.name ?? user.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading text-[13px] font-extrabold">{user.name ?? "User"}</div>
            <div className="truncate text-[11px] text-muted">{user.email}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="btn btn-ghost btn-icon"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SwitcherLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "grid grid-cols-[18px_1fr] items-center gap-3 border-2 px-3 py-2 font-heading text-[14px] font-extrabold no-underline",
        active
          ? "border-ink bg-ink text-bg"
          : "border-transparent text-ink hover:border-divider hover:bg-surface",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span>{label}</span>
    </Link>
  );
}
