"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  numeric?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
};

export function DataTable<T extends { id: string }>({
  columns,
  data,
  searchKeys,
  rowHref,
  emptyMessage = "No records yet.",
  toolbarLeft,
  searchPlaceholder = "Search…",
}: {
  columns: Column<T>[];
  data: T[];
  searchKeys?: (keyof T)[];
  rowHref?: (row: T) => string;
  emptyMessage?: string;
  toolbarLeft?: React.ReactNode;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [asc, setAsc] = React.useState(true);

  const filtered = React.useMemo(() => {
    let rows = data;
    if (query && searchKeys?.length) {
      const q = query.toLowerCase();
      rows = rows.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)),
      );
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      rows = [...rows].sort((a, b) => {
        const av = col?.sortValue ? col.sortValue(a) : (a as Record<string, unknown>)[sortKey];
        const bv = col?.sortValue ? col.sortValue(b) : (b as Record<string, unknown>)[sortKey];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    return rows;
  }, [data, query, searchKeys, sortKey, asc, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const showToolbar = Boolean(toolbarLeft) || Boolean(searchKeys?.length);

  return (
    <div className="space-y-4">
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>{toolbarLeft}</div>
          {searchKeys?.length ? (
            <div className="relative w-[300px] max-w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
              <input
                className="input pl-8"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={cn(col.numeric && "num", col.className)}>
                {col.sortable ? (
                  <button
                    className="inline-flex items-center gap-1 hover:text-ink"
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.header}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            filtered.map((row) => (
              <tr
                key={row.id}
                className={rowHref ? "cursor-pointer" : undefined}
                onClick={rowHref ? () => router.push(rowHref(row)) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn(col.numeric && "num", col.className)}>
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
