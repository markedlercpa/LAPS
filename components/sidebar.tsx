"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  Users,
  Calendar,
  FileText,
  Trophy,
  BarChart3,
  LogOut,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { href: "/pipeline", index: "00", label: "Pipeline", icon: Activity, letter: "" },
  { href: "/leads", index: "01", label: "Lead Generation", icon: Users, letter: "L" },
  { href: "/appointments", index: "02", label: "Appointments", icon: Calendar, letter: "A" },
  { href: "/proposals", index: "03", label: "Proposals", icon: FileText, letter: "P" },
  { href: "/sales", index: "04", label: "Sales Closed", icon: Trophy, letter: "S" },
  { href: "/reporting", index: "05", label: "Reporting", icon: BarChart3, letter: "" },
];

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
        <div className="font-heading text-[26px] font-extrabold tracking-[-0.03em] leading-none">
          LAPS
        </div>
        <div className="micro-label mt-2">Sales Cycle</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "grid grid-cols-[18px_20px_1fr_auto] items-center gap-3 px-3 py-2.5 font-heading text-[14px] font-extrabold",
                active
                  ? "bg-accent text-bg hover:bg-accent-600"
                  : "text-ink hover:bg-[color:color-mix(in_srgb,var(--color-text)_7%,transparent)]",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span
                className={cn(
                  "text-[11px] font-normal",
                  active ? "text-bg/80" : "text-ink/40",
                )}
              >
                {item.index}
              </span>
              <span>{item.label}</span>
              <span
                className={cn(
                  "text-[13px]",
                  active ? "text-bg" : "text-neutral-500",
                )}
              >
                {item.letter}
              </span>
            </Link>
          );
        })}
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
