"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  Users,
  Calendar,
  CalendarClock,
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
  LogOut,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";

// Multi-module ERP: each module groups its own subsections.
const MODULES = [
  {
    name: "LAPS",
    caption: "Sales cycle",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: Activity },
      { href: "/inbox", label: "Email Triage", icon: Inbox },
      { href: "/leads", label: "Lead Generation", icon: Users },
      { href: "/appointments", label: "Appointments", icon: Calendar },
      { href: "/scheduling", label: "Scheduling", icon: CalendarClock },
      { href: "/proposals", label: "Proposals", icon: FileText },
      { href: "/sales", label: "Sales Closed", icon: Trophy },
      { href: "/reporting", label: "Reporting", icon: BarChart3 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    name: "ECHO",
    caption: "Content engine",
    items: [
      { href: "/echo", label: "Overview", icon: Radio },
      { href: "/echo/evidence", label: "Evidence", icon: Vault },
      { href: "/echo/calling-cards", label: "Calling Cards", icon: Megaphone },
      { href: "/echo/content", label: "Housed Content", icon: PenLine },
      { href: "/echo/optics", label: "Optics", icon: LineChart },
    ],
  },
];

function isActive(pathname: string, href: string) {
  // Exact for module roots like /echo; prefix for the rest.
  if (href === "/echo") return pathname === "/echo";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  user,
}: {
  user: { name?: string | null; email?: string | null; role?: string };
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[252px] shrink-0 flex-col border-r-2 border-divider bg-bg">
      {/* Brand */}
      <div className="border-b-2 border-divider px-4 py-6">
        <div className="font-heading text-[22px] font-extrabold tracking-[-0.03em] leading-none">
          Edler Zain
        </div>
        <div className="micro-label mt-2">Operating System</div>
      </div>

      {/* Modules */}
      <nav className="flex-1 overflow-y-auto p-2">
        {MODULES.map((mod) => (
          <div key={mod.name} className="mb-4">
            <div className="flex items-baseline gap-2 px-3 pb-1 pt-2">
              <span className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">
                {mod.name}
              </span>
              <span className="micro-label text-neutral-500">{mod.caption}</span>
            </div>
            <div className="space-y-0.5">
              {mod.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
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
        ))}
      </nav>

      {/* Footer / user */}
      <div className="border-t-2 border-divider px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-ink font-heading text-[12px] font-extrabold text-bg">
            {initials(user.name ?? user.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading text-[13px] font-extrabold">
              {user.name ?? "User"}
            </div>
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
