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

/** A toolbar dropdown filter. `getValue` maps a row to the value compared
 * against the selected option ("" = all rows). */
export type FilterDef<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  getValue: (row: T) => string;
};

/** Build filter options from the distinct values present in the data. */
export function distinctOptions<T>(rows: T[], getValue: (row: T) => string | null | undefined) {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = getValue(r);
    if (v) seen.add(v);
  }
  return Array.from(seen)
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  searchKeys,
  filters,
  rowHref,
  emptyMessage = "No records yet.",
  toolbarLeft,
  searchPlaceholder = "Search…",
}: {
  columns: Column<T>[];
  data: T[];
  searchKeys?: (keyof T)[];
  filters?: FilterDef<T>[];
  rowHref?: (row: T) => string;
  emptyMessage?: string;
  toolbarLeft?: React.ReactNode;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [asc, setAsc] = React.useState(true);
  const [filterValues, setFilterValues] = React.useState<Record<string, string>>({});

  const filtered = React.useMemo(() => {
    let rows = data;
    if (query && searchKeys?.length) {
      const q = query.toLowerCase();
      rows = rows.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)),
      );
    }
    for (const f of filters ?? []) {
      const sel = filterValues[f.key];
      if (sel) rows = rows.filter((r) => f.getValue(r) === sel);
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
  }, [data, query, searchKeys, filters, filterValues, sortKey, asc, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const showToolbar = Boolean(toolbarLeft) || Boolean(searchKeys?.length) || Boolean(filters?.length);

  return (
    <div className="space-y-4">
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {toolbarLeft}
            {filters?.map((f) => (
              <label key={f.key} className="flex items-center gap-1.5">
                <span className="micro-label">{f.label}</span>
                <select
                  className="input py-1.5 text-[13px]"
                  value={filterValues[f.key] ?? ""}
                  onChange={(e) => setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                >
                  <option value="">All</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
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
