"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Users,
  CalendarClock,
  FileText,
  Trophy,
  BarChart3,
  LogOut,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { href: "/leads", label: "Lead Generation", icon: Users, letter: "L" },
  { href: "/appointments", label: "Appointments", icon: CalendarClock, letter: "A" },
  { href: "/proposals", label: "Proposals", icon: FileText, letter: "P" },
  { href: "/sales", label: "Sales Closed", icon: Trophy, letter: "S" },
  { href: "/reporting", label: "Reporting", icon: BarChart3, letter: "" },
];

export function Sidebar({
  user,
}: {
  user: { name?: string | null; email?: string | null; role?: string };
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <span className="text-xl font-bold tracking-tight">LAPS</span>
        <span className="text-xs text-muted-foreground">Sales Cycle</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/70 hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {item.letter && (
                <span
                  className={cn(
                    "ml-auto text-xs font-bold",
                    active ? "opacity-90" : "text-muted-foreground",
                  )}
                >
                  {item.letter}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user.name ?? user.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name ?? "User"}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="text-muted-foreground hover:text-foreground"
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
