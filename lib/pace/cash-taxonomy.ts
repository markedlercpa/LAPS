// Finance — cash-forecast taxonomy. Client-safe (no prisma).

export type CashSection = "RECEIPTS" | "DISBURSEMENTS" | "FINANCING";

export type CashCategoryDef = { key: string; label: string; section: CashSection; sign: 1 | -1 };

/** The fixed category rows of the direct cash-flow statement, in display order. */
export const CASH_CATEGORIES: CashCategoryDef[] = [
  { key: "ar_collections", label: "AR Collections", section: "RECEIPTS", sign: 1 },
  { key: "wip_collections", label: "WIP Collections", section: "RECEIPTS", sign: 1 },
  { key: "mrr_subscriptions", label: "MRR — Auto Pay Subscriptions", section: "RECEIPTS", sign: 1 },
  { key: "qofe_projects", label: "QofE & One-Time Projects (est.)", section: "RECEIPTS", sign: 1 },
  { key: "other_receipts", label: "Other Receipts", section: "RECEIPTS", sign: 1 },

  { key: "ap_payments", label: "AP Payments", section: "DISBURSEMENTS", sign: -1 },
  { key: "accrued_liability", label: "Accrued Liability Payments", section: "DISBURSEMENTS", sign: -1 },
  { key: "credit_card", label: "Credit Card Payments", section: "DISBURSEMENTS", sign: -1 },
  { key: "payroll", label: "Payroll", section: "DISBURSEMENTS", sign: -1 },
  { key: "payroll_taxes", label: "Payroll Taxes", section: "DISBURSEMENTS", sign: -1 },
  { key: "rent_occupancy", label: "Rent & Occupancy", section: "DISBURSEMENTS", sign: -1 },
  { key: "software_subscriptions", label: "Software & Subscriptions", section: "DISBURSEMENTS", sign: -1 },
  { key: "insurance", label: "Insurance", section: "DISBURSEMENTS", sign: -1 },
  { key: "income_tax", label: "Income Tax Estimates", section: "DISBURSEMENTS", sign: -1 },
  { key: "other_operating", label: "Other Operating", section: "DISBURSEMENTS", sign: -1 },

  { key: "loc_draws", label: "LOC Draws", section: "FINANCING", sign: 1 },
  { key: "loc_repayments", label: "LOC Repayments", section: "FINANCING", sign: -1 },
  { key: "term_debt_service", label: "Term Debt Service", section: "FINANCING", sign: -1 },
  { key: "owner_distributions", label: "Owner Distributions", section: "FINANCING", sign: -1 },
];

export const CASH_CATEGORY_MAP: Record<string, CashCategoryDef> = Object.fromEntries(
  CASH_CATEGORIES.map((c) => [c.key, c]),
);

export function categoriesFor(section: CashSection): CashCategoryDef[] {
  return CASH_CATEGORIES.filter((c) => c.section === section);
}

export const CADENCE_LABELS: Record<string, string> = {
  ONE_TIME: "One-time",
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  MONTHLY: "Monthly",
};

export type CashMode = "daily" | "weekly" | "monthly";

export const MODE_LABELS: Record<CashMode, string> = {
  daily: "14-day",
  weekly: "13-week",
  monthly: "12-month",
};
