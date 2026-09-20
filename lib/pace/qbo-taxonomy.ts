// PACE — QuickBooks-native account taxonomy. Client-safe (no prisma import).
//
// The pivot: PACE no longer asks anyone to map an entity's source accounts to a
// firm reporting COA. Instead we classify each account by the descriptive
// metadata QuickBooks already carries — AccountType, AccountSubType, and
// Classification — and rebuild the P&L / Balance Sheet the way QuickBooks
// organizes them organically. AccountType is standardized across QBO files, so
// consolidation across entities still compares like with like.
//
// TB amounts are signed (debit +, credit -). Each section has a natural side so
// normal balances read positive on the statements.

import type { StatementKind, NaturalSide } from "@prisma/client";

/** The statement sections we group into, in display order per statement. */
export type QboSection =
  | "Revenue"
  | "COGS"
  | "OpEx"
  | "OtherIncome"
  | "OtherExpense"
  | "Asset"
  | "Liability"
  | "Equity"
  | "Unclassified";

export type SectionDef = {
  statement: StatementKind;
  section: QboSection;
  naturalSide: NaturalSide;
  sortOrder: number;
  /** The budget/variance dimension this section rolls up into (reporting `type`). */
  varianceType: "Revenue" | "COGS" | "OpEx" | "OtherExpense" | "Asset" | "Liability" | "Equity" | null;
};

export const SECTION_LABELS: Record<QboSection, string> = {
  Revenue: "Revenue",
  COGS: "Cost of Goods Sold",
  OpEx: "Operating Expenses",
  OtherIncome: "Other Income",
  OtherExpense: "Other Expense",
  Asset: "Assets",
  Liability: "Liabilities",
  Equity: "Equity",
  Unclassified: "Unclassified",
};

/**
 * QuickBooks AccountType → section. These are the canonical QBO AccountType
 * strings (v3 API). Everything an English QBO file emits is covered; anything
 * unknown falls through to Classification, then to Unclassified (never dropped).
 */
const BY_ACCOUNT_TYPE: Record<string, SectionDef> = {
  // ── Income statement ──
  // Order mirrors a QBO P&L: Income → COGS → (Gross Profit) → Expenses →
  // (Net Operating Income) → Other Income → Other Expense → (Net Income).
  Income: { statement: "IS", section: "Revenue", naturalSide: "CREDIT", sortOrder: 10, varianceType: "Revenue" },
  "Cost of Goods Sold": { statement: "IS", section: "COGS", naturalSide: "DEBIT", sortOrder: 20, varianceType: "COGS" },
  Expense: { statement: "IS", section: "OpEx", naturalSide: "DEBIT", sortOrder: 30, varianceType: "OpEx" },
  "Other Income": { statement: "IS", section: "OtherIncome", naturalSide: "CREDIT", sortOrder: 35, varianceType: "Revenue" },
  "Other Expense": { statement: "IS", section: "OtherExpense", naturalSide: "DEBIT", sortOrder: 40, varianceType: "OtherExpense" },
  // ── Balance sheet ──
  Bank: { statement: "BS", section: "Asset", naturalSide: "DEBIT", sortOrder: 100, varianceType: "Asset" },
  "Accounts Receivable": { statement: "BS", section: "Asset", naturalSide: "DEBIT", sortOrder: 110, varianceType: "Asset" },
  "Other Current Asset": { statement: "BS", section: "Asset", naturalSide: "DEBIT", sortOrder: 120, varianceType: "Asset" },
  "Fixed Asset": { statement: "BS", section: "Asset", naturalSide: "DEBIT", sortOrder: 130, varianceType: "Asset" },
  "Other Asset": { statement: "BS", section: "Asset", naturalSide: "DEBIT", sortOrder: 140, varianceType: "Asset" },
  "Accounts Payable": { statement: "BS", section: "Liability", naturalSide: "CREDIT", sortOrder: 200, varianceType: "Liability" },
  "Credit Card": { statement: "BS", section: "Liability", naturalSide: "CREDIT", sortOrder: 210, varianceType: "Liability" },
  "Other Current Liability": { statement: "BS", section: "Liability", naturalSide: "CREDIT", sortOrder: 220, varianceType: "Liability" },
  "Long Term Liability": { statement: "BS", section: "Liability", naturalSide: "CREDIT", sortOrder: 230, varianceType: "Liability" },
  Equity: { statement: "BS", section: "Equity", naturalSide: "CREDIT", sortOrder: 300, varianceType: "Equity" },
};

/** QBO Classification (coarse) → section, used when AccountType is unknown. */
const BY_CLASSIFICATION: Record<string, SectionDef> = {
  Revenue: BY_ACCOUNT_TYPE.Income,
  Expense: BY_ACCOUNT_TYPE.Expense,
  Asset: BY_ACCOUNT_TYPE["Other Current Asset"],
  Liability: BY_ACCOUNT_TYPE["Other Current Liability"],
  Equity: BY_ACCOUNT_TYPE.Equity,
};

const UNCLASSIFIED: SectionDef = {
  statement: "IS",
  section: "Unclassified",
  naturalSide: "DEBIT",
  sortOrder: 900,
  varianceType: null,
};

/**
 * Resolve an account's section from its QBO descriptive metadata. AccountType
 * wins; Classification is the fallback; Unclassified is the floor (so a line is
 * always placed, never dropped). Unclassified is treated as an IS line so a
 * miss shows up on the P&L rather than silently unbalancing the BS.
 */
export function classifyAccount(meta: {
  accountType?: string | null;
  classification?: string | null;
}): SectionDef {
  const t = meta.accountType?.trim();
  if (t && BY_ACCOUNT_TYPE[t]) return BY_ACCOUNT_TYPE[t];
  const c = meta.classification?.trim();
  if (c && BY_CLASSIFICATION[c]) return BY_CLASSIFICATION[c];
  return UNCLASSIFIED;
}

/** Sections that make up a statement, in display order. */
export function sectionsFor(statement: StatementKind): QboSection[] {
  const defs = Object.values(BY_ACCOUNT_TYPE)
    .concat(UNCLASSIFIED)
    .filter((d) => d.statement === statement || d.section === "Unclassified");
  const seen = new Set<QboSection>();
  const out: QboSection[] = [];
  for (const d of defs.sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!seen.has(d.section)) {
      seen.add(d.section);
      out.push(d.section);
    }
  }
  return out;
}
