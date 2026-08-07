"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { importQboBudgetAction, listQboBudgetsAction } from "@/app/(dashboard)/finance/budget-actions";

type QboBudgetOption = { name: string; years: number[] };

/**
 * Import a budget from a QBO-connected entity. Two steps: fetch the company's
 * budgets from QuickBooks, then pick which budget + fiscal year to import.
 */
export function ImportQboBudgetButton({ entities }: { entities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [options, setOptions] = useState<QboBudgetOption[] | null>(null);
  const [budgetName, setBudgetName] = useState("");
  const [year, setYear] = useState<number>(new Date().getUTCFullYear());
  const [result, setResult] = useState<{
    budgetId: string;
    imported: number;
    skipped: number;
    skippedAccounts: string[];
    rawLineCount: number;
    totalPulled: number;
  } | null>(null);

  if (entities.length === 0) return null;

  const selected = options?.find((o) => o.name === budgetName);

  function reset() {
    setOptions(null);
    setBudgetName("");
    setMsg(null);
    setResult(null);
  }

  function fetchBudgets() {
    setMsg(null);
    startTransition(async () => {
      const res = await listQboBudgetsAction(entityId);
      if (!res.ok) {
        setMsg(res.error);
        setOptions(null);
        return;
      }
      if (res.budgets.length === 0) {
        setMsg("No budgets found in QuickBooks for this company.");
        setOptions([]);
        return;
      }
      setOptions(res.budgets);
      const first = res.budgets[0];
      setBudgetName(first.name);
      if (first.years[0]) setYear(first.years[0]);
    });
  }

  function doImport() {
    setMsg(null);
    setResult(null);
    startTransition(async () => {
      const res = await importQboBudgetAction({ entityId, fiscalYear: year, budgetName });
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      const summary = {
        budgetId: res.budgetId,
        imported: res.imported,
        skipped: res.skipped,
        skippedAccounts: res.skippedAccounts,
        rawLineCount: res.rawLineCount,
        totalPulled: res.totalPulled,
      };
      // If every line landed (nothing skipped), go straight to the budget.
      if (res.imported > 0 && res.skipped === 0) {
        router.push(`/finance/budgets/${res.budgetId}`);
        return;
      }
      // Otherwise keep the modal open with a diagnostic summary so the user can
      // see whether amounts came through (mapping issue) or not (pull issue).
      setResult(summary);
    });
  }

  const dollars = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <>
      <button className="btn btn-secondary" onClick={() => { reset(); setOpen(true); }}>
        <Download className="h-4 w-4" /> Import from QBO
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Import budget from QuickBooks">
        <div className="space-y-3">
          <label className="field">
            <span className="micro-label">Entity (QBO-connected)</span>
            <select
              className="input"
              value={entityId}
              onChange={(e) => { setEntityId(e.target.value); reset(); }}
            >
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>

          {!options ? (
            <button className="btn btn-secondary btn-block" onClick={fetchBudgets} disabled={pending}>
              <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Fetching…" : "Fetch budgets from QBO"}
            </button>
          ) : options.length === 0 ? null : (
            <>
              <label className="field">
                <span className="micro-label">QuickBooks budget</span>
                <select
                  className="input"
                  value={budgetName}
                  onChange={(e) => {
                    setBudgetName(e.target.value);
                    const y = options.find((o) => o.name === e.target.value)?.years[0];
                    if (y) setYear(y);
                  }}
                >
                  {options.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="micro-label">Fiscal year</span>
                <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {(selected?.years.length ? selected.years : [year]).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
              <p className="text-[12px] text-muted">
                Accounts map to your reporting COA. Unmapped accounts are skipped and flagged in COA Mapping — map them and re-import to include them.
              </p>
            </>
          )}

          {msg && <p className="text-[13px] text-accent-700">{msg}</p>}

          {result && (
            <div className="border-2 border-divider bg-surface p-3 text-[13px]">
              <div className="micro-label mb-1">Import summary</div>
              <p>
                Pulled <strong>{result.rawLineCount}</strong> budget line{result.rawLineCount === 1 ? "" : "s"} from
                QuickBooks totaling <strong>{dollars(result.totalPulled)}</strong> for FY{year}.
              </p>
              <p className="mt-1">
                Applied <strong>{result.imported}</strong> to mapped reporting accounts;{" "}
                <strong>{result.skipped}</strong> skipped as unmapped.
              </p>
              {result.imported === 0 && result.totalPulled > 0 && (
                <p className="mt-2 text-accent-700">
                  Amounts came through, but none of the QBO accounts are mapped to your reporting COA yet — so the
                  budget saved empty. Map these accounts in <strong>COA Mapping</strong>, then re-import.
                </p>
              )}
              {result.totalPulled === 0 && (
                <p className="mt-2 text-accent-700">
                  QuickBooks returned the budget structure but no dollar amounts for FY{year}. Check that the budget
                  actually has figures entered for this fiscal year in QBO.
                </p>
              )}
              {result.skippedAccounts.length > 0 && (
                <p className="mt-2 text-muted">
                  Unmapped: {result.skippedAccounts.slice(0, 8).join(", ")}
                  {result.skippedAccounts.length > 8 ? `, +${result.skippedAccounts.length - 8} more` : ""}
                </p>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-block mt-3"
                onClick={() => router.push(`/finance/budgets/${result.budgetId}`)}
              >
                Open the imported budget
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Close</button>
            {options && options.length > 0 && !result && (
              <button type="button" className="btn btn-primary" onClick={doImport} disabled={pending || !budgetName}>
                {pending ? "Importing…" : "Import"}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
