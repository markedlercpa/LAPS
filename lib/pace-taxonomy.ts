// PACE shared taxonomy — client-safe (no prisma import at runtime).
import type { StatementKind, LedgerProvider, PeriodStatus, NaturalSide } from "@prisma/client";

export const STATEMENT_LABELS: Record<StatementKind, string> = {
  IS: "Income Statement",
  BS: "Balance Sheet",
};

export const PROVIDER_LABELS: Record<LedgerProvider, string> = {
  QBO: "QuickBooks Online",
  ZOHO: "Zoho Books",
  MANUAL: "Manual / CSV",
};

export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
};

export const ENTITY_KINDS = ["operating", "holdco", "opm", "other"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];
export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  operating: "Operating company",
  holdco: "Holding company",
  opm: "OPM",
  other: "Other",
};

/**
 * Firm-standard reporting chart of accounts. Every entity's source COA maps to
 * one of these so consolidated statements and cross-entity KPIs compare like
 * with like. A starter set — extend in the app. IS lines carry the P&L; BS
 * lines carry the balance sheet. naturalSide follows accounting convention
 * (assets/expenses DEBIT, liabilities/equity/revenue CREDIT).
 */
export type ReportingAccountSeed = {
  code: string;
  name: string;
  statement: StatementKind;
  type: string;
  category?: string;
  subcategory?: string;
  naturalSide: NaturalSide;
  sortOrder: number;
};

export const REPORTING_COA_SEED: ReportingAccountSeed[] = [
  // ---- Income Statement ----
  { code: "4000", name: "Revenue — Recurring (CAS/CFO)", statement: "IS", type: "Revenue", category: "Revenue", naturalSide: "CREDIT", sortOrder: 10 },
  { code: "4100", name: "Revenue — Project (QofE/Advisory)", statement: "IS", type: "Revenue", category: "Revenue", naturalSide: "CREDIT", sortOrder: 20 },
  { code: "4200", name: "Revenue — Tax", statement: "IS", type: "Revenue", category: "Revenue", naturalSide: "CREDIT", sortOrder: 30 },
  { code: "4900", name: "Other Income", statement: "IS", type: "Revenue", category: "Other Income", naturalSide: "CREDIT", sortOrder: 40 },
  { code: "5000", name: "Cost of Delivery — Labor", statement: "IS", type: "COGS", category: "Cost of Delivery", naturalSide: "DEBIT", sortOrder: 100 },
  { code: "5100", name: "Cost of Delivery — Contractors", statement: "IS", type: "COGS", category: "Cost of Delivery", naturalSide: "DEBIT", sortOrder: 110 },
  { code: "5200", name: "Cost of Delivery — Software/Tools", statement: "IS", type: "COGS", category: "Cost of Delivery", naturalSide: "DEBIT", sortOrder: 120 },
  { code: "6000", name: "Payroll — Admin/Overhead", statement: "IS", type: "OpEx", category: "Payroll", naturalSide: "DEBIT", sortOrder: 200 },
  { code: "6100", name: "Marketing & Advertising", statement: "IS", type: "OpEx", category: "Marketing", naturalSide: "DEBIT", sortOrder: 210 },
  { code: "6200", name: "Rent & Facilities", statement: "IS", type: "OpEx", category: "Facilities", naturalSide: "DEBIT", sortOrder: 220 },
  { code: "6300", name: "Software & Subscriptions", statement: "IS", type: "OpEx", category: "Technology", naturalSide: "DEBIT", sortOrder: 230 },
  { code: "6400", name: "Professional Fees", statement: "IS", type: "OpEx", category: "G&A", naturalSide: "DEBIT", sortOrder: 240 },
  { code: "6500", name: "General & Administrative", statement: "IS", type: "OpEx", category: "G&A", naturalSide: "DEBIT", sortOrder: 250 },
  { code: "7000", name: "Interest Expense", statement: "IS", type: "OtherExpense", category: "Below the Line", naturalSide: "DEBIT", sortOrder: 300 },
  { code: "7100", name: "Depreciation & Amortization", statement: "IS", type: "OtherExpense", category: "Below the Line", naturalSide: "DEBIT", sortOrder: 310 },
  { code: "7900", name: "Income Tax Expense", statement: "IS", type: "OtherExpense", category: "Below the Line", naturalSide: "DEBIT", sortOrder: 320 },
  // ---- Balance Sheet ----
  { code: "1000", name: "Cash & Equivalents", statement: "BS", type: "Asset", category: "Current Assets", naturalSide: "DEBIT", sortOrder: 1000 },
  { code: "1100", name: "Accounts Receivable", statement: "BS", type: "Asset", category: "Current Assets", naturalSide: "DEBIT", sortOrder: 1010 },
  { code: "1200", name: "Other Current Assets", statement: "BS", type: "Asset", category: "Current Assets", naturalSide: "DEBIT", sortOrder: 1020 },
  { code: "1500", name: "Fixed Assets (net)", statement: "BS", type: "Asset", category: "Long-term Assets", naturalSide: "DEBIT", sortOrder: 1030 },
  { code: "1800", name: "Other Assets", statement: "BS", type: "Asset", category: "Long-term Assets", naturalSide: "DEBIT", sortOrder: 1040 },
  { code: "2000", name: "Accounts Payable", statement: "BS", type: "Liability", category: "Current Liabilities", naturalSide: "CREDIT", sortOrder: 2000 },
  { code: "2100", name: "Credit Cards", statement: "BS", type: "Liability", category: "Current Liabilities", naturalSide: "CREDIT", sortOrder: 2010 },
  { code: "2200", name: "Accrued Liabilities", statement: "BS", type: "Liability", category: "Current Liabilities", naturalSide: "CREDIT", sortOrder: 2020 },
  { code: "2500", name: "Line of Credit", statement: "BS", type: "Liability", category: "Debt", naturalSide: "CREDIT", sortOrder: 2030 },
  { code: "2600", name: "Notes Payable (SBA/Seller)", statement: "BS", type: "Liability", category: "Debt", naturalSide: "CREDIT", sortOrder: 2040 },
  { code: "3000", name: "Equity — Contributions", statement: "BS", type: "Equity", category: "Equity", naturalSide: "CREDIT", sortOrder: 3000 },
  { code: "3100", name: "Equity — Distributions", statement: "BS", type: "Equity", category: "Equity", naturalSide: "DEBIT", sortOrder: 3010 },
  { code: "3200", name: "Retained Earnings", statement: "BS", type: "Equity", category: "Equity", naturalSide: "CREDIT", sortOrder: 3020 },
];
