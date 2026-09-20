// Financial-health snapshot (manual-entry / QBO-export figures). Pure +
// client-safe. Config lives in LeadMagnet.config for QBO_SNAPSHOT magnets:
// valuation multiples, benchmark targets, and copy — the inputs + metrics are a
// fixed, purpose-built set for the M&A / CFO niche.

export type SnapshotInputs = {
  revenue: number;
  cogs: number;
  opex: number;
  depreciation: number;
  ownerAddbacks: number;
  cash: number;
  accountsReceivable: number;
  accountsPayable: number;
};

export const SNAPSHOT_FIELDS: { id: keyof SnapshotInputs; label: string; help?: string }[] = [
  { id: "revenue", label: "Annual revenue" },
  { id: "cogs", label: "Cost of goods sold (COGS)" },
  { id: "opex", label: "Operating expenses (excl. COGS)" },
  { id: "depreciation", label: "Depreciation & amortization" },
  { id: "ownerAddbacks", label: "Owner comp / discretionary add-backs", help: "Owner salary above market, personal expenses, one-offs" },
  { id: "cash", label: "Cash on hand" },
  { id: "accountsReceivable", label: "Accounts receivable" },
  { id: "accountsPayable", label: "Accounts payable" },
];

export type SnapshotConfig = {
  intro?: string;
  multipleLow: number; // × adjusted EBITDA
  multipleHigh: number;
  grossMarginTarget: number; // %, higher is better
  operatingMarginTarget: number; // %
  arDaysTarget: number; // days, lower is better
  apDaysTarget: number; // days
  bookingSlug?: string;
};

export function defaultSnapshotConfig(): SnapshotConfig {
  return { multipleLow: 3, multipleHigh: 5, grossMarginTarget: 50, operatingMarginTarget: 15, arDaysTarget: 45, apDaysTarget: 30 };
}

export function asSnapshotConfig(raw: unknown): SnapshotConfig {
  const d = defaultSnapshotConfig();
  const c = (raw ?? {}) as Partial<SnapshotConfig>;
  const num = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb);
  return {
    intro: typeof c.intro === "string" ? c.intro : undefined,
    multipleLow: num(c.multipleLow, d.multipleLow),
    multipleHigh: num(c.multipleHigh, d.multipleHigh),
    grossMarginTarget: num(c.grossMarginTarget, d.grossMarginTarget),
    operatingMarginTarget: num(c.operatingMarginTarget, d.operatingMarginTarget),
    arDaysTarget: num(c.arDaysTarget, d.arDaysTarget),
    apDaysTarget: num(c.apDaysTarget, d.apDaysTarget),
    bookingSlug: c.bookingSlug,
  };
}

export type Flag = "good" | "watch" | "risk";
export type SnapshotMetric = { key: string; label: string; formatted: string; flag: Flag; note?: string };
export type SnapshotResult = {
  metrics: SnapshotMetric[];
  adjEbitda: number;
  valuationLow: number;
  valuationHigh: number;
  score: number; // 0..100, share of "good" metrics
  bandLabel: string;
  bandBody: string;
};

const money = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const pct = (v: number) => `${Math.round(v * 10) / 10}%`;
const days = (v: number) => `${Math.round(v)} days`;
const div = (a: number, b: number) => (b === 0 ? 0 : a / b);

/** "higher is better" flag vs a target (watch within 20% under target). */
function flagHigher(value: number, target: number): Flag {
  if (value >= target) return "good";
  if (value >= target * 0.8) return "watch";
  return "risk";
}
/** "lower is better" flag vs a target (watch within 20% over target). */
function flagLower(value: number, target: number): Flag {
  if (value <= target) return "good";
  if (value <= target * 1.2) return "watch";
  return "risk";
}

export function computeSnapshot(config: SnapshotConfig, i: SnapshotInputs): SnapshotResult {
  const grossProfit = i.revenue - i.cogs;
  const operatingIncome = grossProfit - i.opex;
  const adjEbitda = operatingIncome + i.depreciation + i.ownerAddbacks;

  const grossMargin = div(grossProfit, i.revenue) * 100;
  const operatingMargin = div(operatingIncome, i.revenue) * 100;
  const ebitdaMargin = div(adjEbitda, i.revenue) * 100;
  const arDays = div(i.accountsReceivable, i.revenue) * 365;
  const apDays = div(i.accountsPayable, i.cogs + i.opex) * 365;
  const monthlyCosts = div(i.cogs + i.opex, 12);
  const runwayMonths = div(i.cash, monthlyCosts);

  const metrics: SnapshotMetric[] = [
    { key: "grossMargin", label: "Gross margin", formatted: pct(grossMargin), flag: flagHigher(grossMargin, config.grossMarginTarget), note: `Target ≥ ${config.grossMarginTarget}%` },
    { key: "operatingMargin", label: "Operating margin", formatted: pct(operatingMargin), flag: flagHigher(operatingMargin, config.operatingMarginTarget), note: `Target ≥ ${config.operatingMarginTarget}%` },
    { key: "ebitdaMargin", label: "Adjusted EBITDA margin", formatted: pct(ebitdaMargin), flag: flagHigher(ebitdaMargin, config.operatingMarginTarget), note: `${money(adjEbitda)} adjusted EBITDA` },
    { key: "arDays", label: "AR days (collection)", formatted: days(arDays), flag: flagLower(arDays, config.arDaysTarget), note: `Target ≤ ${config.arDaysTarget} days` },
    { key: "apDays", label: "AP days (payment)", formatted: days(apDays), flag: flagLower(apDays, config.apDaysTarget), note: `Target ≤ ${config.apDaysTarget} days` },
    { key: "runway", label: "Cash runway", formatted: `${Math.round(runwayMonths * 10) / 10} mo`, flag: flagHigher(runwayMonths, 3), note: "Months of operating costs in cash" },
  ];

  const goods = metrics.filter((m) => m.flag === "good").length;
  const score = Math.round((goods / metrics.length) * 100);
  const { label, body } =
    score >= 75
      ? { label: "Exit-ready shape", body: "Your fundamentals are strong. The gaps that remain are refinements, not blockers — a good time to plan proactively." }
      : score >= 50
        ? { label: "Solid, with gaps", body: "A healthy core with a few areas that a buyer or lender would question. Addressing them now lifts both valuation and certainty of close." }
        : { label: "Foundational work needed", body: "Several metrics are outside a defensible range. The upside is real — tightening these is exactly where value gets created before a transaction." };

  return {
    metrics,
    adjEbitda,
    valuationLow: adjEbitda * config.multipleLow,
    valuationHigh: adjEbitda * config.multipleHigh,
    score,
    bandLabel: label,
    bandBody: body,
  };
}

export const fmtMoney = money;
