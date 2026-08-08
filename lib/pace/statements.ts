import type { StatementKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyAccount, sectionsFor, SECTION_LABELS, type QboSection } from "@/lib/pace/qbo-taxonomy";

/**
 * Build P&L / Balance Sheet from cached trial-balance lines, classified natively
 * by QuickBooks' own account metadata (AccountType / Classification) — no manual
 * reporting-COA mapping. `entityId = null` = consolidated (sum across entities
 * for that month); QBO AccountType is standardized, so consolidation still
 * compares like with like.
 *
 * TB amounts are signed (debit +, credit -). Each line is normalized to its
 * section's natural side so normal balances read positive:
 *   magnitude = naturalSide === "CREDIT" ? -signedSum : signedSum
 */

export type StatementLine = {
  ledgerAccountId: string;
  externalId: string | null;
  acctNum: string | null;
  name: string; // leaf name (last segment of the QBO hierarchy)
  fqName: string | null;
  depth: number; // hierarchy depth from FullyQualifiedName (0 = top level)
  accountType: string | null;
  accountSubType: string | null;
  section: QboSection;
  amount: number; // natural-side positive
};

export type StatementGroup = {
  section: QboSection;
  label: string;
  lines: StatementLine[];
  subtotal: number;
};

export type StatementResult = {
  statement: StatementKind;
  periodMonth: string;
  lines: StatementLine[]; // flat, section-ordered
  groups: StatementGroup[];
  subtotals: Record<string, number>;
  unclassifiedAmount: number; // natural-side sum of lines QBO metadata couldn't place
};

function monthStart(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function leafName(fqName: string | null, name: string): string {
  if (!fqName) return name;
  const parts = fqName.split(":");
  return parts[parts.length - 1]?.trim() || name;
}

export async function buildStatement(
  entityId: string | null,
  periodMonthISO: string,
  statement: StatementKind,
): Promise<StatementResult> {
  const periodMonth = monthStart(periodMonthISO);

  const periods = await prisma.trialBalancePeriod.findMany({
    where: { periodMonth, ...(entityId ? { entityId } : {}) },
    include: { lines: { include: { ledgerAccount: true } } },
  });

  // Aggregate signed amounts per source ledger account, classified natively.
  type Agg = {
    line: StatementLine;
    naturalSide: "DEBIT" | "CREDIT";
    sortOrder: number;
    signed: number;
  };
  const byAccount = new Map<string, Agg>();

  for (const p of periods) {
    for (const l of p.lines) {
      const a = l.ledgerAccount;
      const def = classifyAccount({ accountType: a.sourceType, classification: a.classification });
      if (def.statement !== statement) continue;
      const amt = Number(l.amount);
      const existing = byAccount.get(a.id);
      if (existing) {
        existing.signed += amt;
      } else {
        byAccount.set(a.id, {
          naturalSide: def.naturalSide,
          sortOrder: def.sortOrder,
          signed: amt,
          line: {
            ledgerAccountId: a.id,
            externalId: a.externalId,
            acctNum: a.acctNum,
            name: leafName(a.fqName, a.name),
            fqName: a.fqName,
            depth: a.fqName ? a.fqName.split(":").length - 1 : 0,
            accountType: a.sourceType,
            accountSubType: a.accountSubType,
            section: def.section,
            amount: 0,
          },
        });
      }
    }
  }

  // Natural-side normalize + drop zero-balance lines (QBO hides them).
  const aggs = Array.from(byAccount.values())
    .map((a) => {
      a.line.amount = a.naturalSide === "CREDIT" ? -a.signed : a.signed;
      return a;
    })
    .filter((a) => Math.abs(a.line.amount) >= 0.005)
    .sort((a, b) => a.sortOrder - b.sortOrder || byAcctNum(a.line, b.line));

  const lines = aggs.map((a) => a.line);

  // Group into sections in statement display order.
  const groups: StatementGroup[] = [];
  for (const section of sectionsFor(statement)) {
    const secLines = lines.filter((l) => l.section === section);
    if (secLines.length === 0) continue;
    groups.push({
      section,
      label: SECTION_LABELS[section],
      lines: secLines,
      subtotal: secLines.reduce((s, l) => s + l.amount, 0),
    });
  }

  const sumSection = (s: QboSection) => lines.filter((l) => l.section === s).reduce((a, l) => a + l.amount, 0);
  const unclassifiedAmount = sumSection("Unclassified");

  const subtotals: Record<string, number> = {};
  if (statement === "IS") {
    const revenue = sumSection("Revenue");
    const cogs = sumSection("COGS");
    const grossProfit = revenue - cogs;
    const opex = sumSection("OpEx");
    const operatingIncome = grossProfit - opex;
    const otherIncome = sumSection("OtherIncome");
    const otherExpense = sumSection("OtherExpense");
    const netIncome = operatingIncome + otherIncome - otherExpense - unclassifiedAmount;
    Object.assign(subtotals, { revenue, cogs, grossProfit, opex, operatingIncome, otherIncome, otherExpense, netIncome });
  } else {
    const assets = sumSection("Asset");
    const liabilities = sumSection("Liability");
    const equity = sumSection("Equity");
    Object.assign(subtotals, { assets, liabilities, equity, checkDiff: assets - (liabilities + equity) });
  }

  return {
    statement,
    periodMonth: periodMonth.toISOString().slice(0, 10),
    lines,
    groups,
    subtotals,
    unclassifiedAmount,
  };
}

/** Numeric-aware account-number sort (blanks last), then by name. */
function byAcctNum(a: { acctNum: string | null; name: string }, b: { acctNum: string | null; name: string }): number {
  const an = a.acctNum ?? "";
  const bn = b.acctNum ?? "";
  if (an && bn) {
    const na = Number(an);
    const nb = Number(bn);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    if (an !== bn) return an.localeCompare(bn);
  } else if (an !== bn) {
    return an ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

/** Latest month's cash: natural-side sum of QBO Bank-type accounts (the cash
 * position QBO shows), in cents. Used to auto-seed the cash forecast opening. */
export async function latestBankCashCents(entityId?: string): Promise<{ cents: number; asOf: string } | null> {
  const months = await availableMonths(entityId);
  if (months.length === 0) return null;
  const bs = await buildStatement(entityId ?? null, months[0], "BS");
  const bank = bs.lines.filter((l) => l.accountType === "Bank");
  if (bank.length === 0) return null;
  const total = bank.reduce((s, l) => s + l.amount, 0);
  return { cents: Math.round(total * 100), asOf: months[0].slice(0, 10) };
}

/** Distinct months that have any trial balance loaded (newest first). */
export async function availableMonths(entityId?: string): Promise<string[]> {
  const periods = await prisma.trialBalancePeriod.findMany({
    where: entityId ? { entityId } : {},
    select: { periodMonth: true },
    orderBy: { periodMonth: "desc" },
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of periods) {
    const k = p.periodMonth.toISOString().slice(0, 10);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
