// Interactive calculator config + evaluation. Pure + client-safe. Config lives
// in LeadMagnet.config for CALCULATOR magnets. Numeric inputs → a formula →
// an output value, interpreted by result bands (same shape as the quiz).

import { cryptoId, type QuizBand } from "@/lib/leadmagnets/quiz";

export type CalcInputKind = "number" | "currency" | "percent";
export type CalcInput = { id: string; label: string; kind: CalcInputKind; default?: number; help?: string };
export type CalcOutputUnit = "number" | "currency" | "multiple" | "percent";

export type CalculatorConfig = {
  intro?: string;
  inputs: CalcInput[];
  formula: string; // arithmetic over input ids, e.g. "ebitda * multiple"
  outputLabel: string;
  outputUnit: CalcOutputUnit;
  bands: QuizBand[]; // interpret the computed value (min/max on the output)
  bookingSlug?: string;
};

export function emptyCalculatorConfig(): CalculatorConfig {
  return { inputs: [], formula: "", outputLabel: "Result", outputUnit: "number", bands: [] };
}

export function asCalculatorConfig(raw: unknown): CalculatorConfig {
  const c = (raw ?? {}) as Partial<CalculatorConfig>;
  const inputs: CalcInput[] = Array.isArray(c.inputs)
    ? c.inputs
        .filter((i): i is CalcInput => !!i && typeof i.label === "string")
        .map((i) => ({
          id: (i.id || "").replace(/[^A-Za-z0-9_]/g, "") || cryptoId(),
          label: i.label,
          kind: i.kind === "currency" || i.kind === "percent" ? i.kind : "number",
          default: i.default != null ? Number(i.default) || 0 : undefined,
          help: i.help,
        }))
    : [];
  const bands: QuizBand[] = Array.isArray(c.bands)
    ? c.bands
        .filter((b): b is QuizBand => !!b && typeof b.label === "string")
        .map((b) => ({
          key: b.key || cryptoId(),
          label: b.label,
          min: Number(b.min) || 0,
          max: Number.isFinite(Number(b.max)) ? Number(b.max) : 0,
          headline: b.headline,
          body: b.body,
          recommendations: Array.isArray(b.recommendations) ? b.recommendations.filter((r) => typeof r === "string") : [],
        }))
    : [];
  return {
    intro: c.intro,
    inputs,
    formula: typeof c.formula === "string" ? c.formula : "",
    outputLabel: typeof c.outputLabel === "string" && c.outputLabel ? c.outputLabel : "Result",
    outputUnit: (["number", "currency", "multiple", "percent"] as const).includes(c.outputUnit as CalcOutputUnit) ? (c.outputUnit as CalcOutputUnit) : "number",
    bands,
    bookingSlug: c.bookingSlug,
  };
}

/**
 * Safe arithmetic evaluator — recursive descent over + - * / ^ ( ) and input
 * variables. No eval; unknown tokens resolve to 0. Admin-authored formulas run
 * server-side on public submissions, so this must never execute code.
 */
export function evalFormula(expr: string, vars: Record<string, number>): number {
  const tokens = (expr.match(/[0-9]*\.?[0-9]+|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/^]/g) ?? []);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") { const op = eat(); const r = parseTerm(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  function parseTerm(): number {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/") { const op = eat(); const r = parseFactor(); v = op === "*" ? v * r : r === 0 ? 0 : v / r; }
    return v;
  }
  function parseFactor(): number {
    if (peek() === "-") { eat(); return -parseFactor(); }
    if (peek() === "+") { eat(); return parseFactor(); }
    let v = parseAtom();
    if (peek() === "^") { eat(); v = Math.pow(v, parseFactor()); }
    return v;
  }
  function parseAtom(): number {
    const t = peek();
    if (t === "(") { eat(); const v = parseExpr(); if (peek() === ")") eat(); return v; }
    eat();
    if (t === undefined) return 0;
    if (/^[0-9.]/.test(t)) return Number(t) || 0;
    return Number(vars[t] ?? 0);
  }
  const result = parseExpr();
  return Number.isFinite(result) ? result : 0;
}

export function bandForValue(bands: QuizBand[], value: number): QuizBand | null {
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  return sorted.find((b) => value >= b.min && value <= b.max) ?? sorted[sorted.length - 1] ?? null;
}

export function computeCalculator(config: CalculatorConfig, values: Record<string, number>): { output: number; band: QuizBand | null } {
  const output = evalFormula(config.formula, values);
  return { output, band: bandForValue(config.bands, output) };
}

/** Human-format the computed output by its unit. */
export function formatCalcOutput(value: number, unit: CalcOutputUnit): string {
  const round = Math.round(value * 100) / 100;
  if (unit === "currency") return `$${Math.round(value).toLocaleString("en-US")}`;
  if (unit === "percent") return `${round}%`;
  if (unit === "multiple") return `${round}×`;
  return round.toLocaleString("en-US");
}
