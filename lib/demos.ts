import { prisma } from "@/lib/prisma";

/**
 * Firm demo library: anonymized SAMPLE deliverables, one per service line, shown
 * to prospects so no proposal goes out without an artifact of the work. Seeded
 * lazily with clearly-marked example data; while isPlaceholder is true the demo
 * renders a "sample" banner. Real client data must never be used — these are
 * illustrative samples. Edit via PUT /api/agent/demos.
 */

export type DemoMetric = { label: string; value: string; hint?: string };
export type DemoTable = { title: string; columns: string[]; rows: string[][] };

export type DemoContent = {
  key: string;
  serviceLine: string;
  name: string;
  title: string;
  subtitle: string | null;
  metrics: DemoMetric[];
  tables: DemoTable[];
  narrative: string | null;
  isPlaceholder: boolean;
};

type DemoSeed = Omit<DemoContent, "isPlaceholder">;

export const DEMO_SEEDS: DemoSeed[] = [
  {
    key: "demo-cas",
    serviceLine: "CAS",
    name: "Client Accounting Services — sample monthly package",
    title: "Monthly Financial Package",
    subtitle: "Example of your monthly close deliverable (sample data)",
    metrics: [
      { label: "Days to close", value: "5", hint: "from month-end" },
      { label: "Accounts reconciled", value: "12 / 12" },
      { label: "Cash on hand", value: "$412,900" },
      { label: "Gross margin", value: "58%" },
    ],
    tables: [
      {
        title: "Income statement (sample)",
        columns: ["Line", "This month", "YTD"],
        rows: [
          ["Revenue", "$248,000", "$1,910,000"],
          ["Cost of services", "$104,000", "$802,000"],
          ["Gross profit", "$144,000", "$1,108,000"],
          ["Operating expenses", "$96,500", "$742,000"],
          ["Net income", "$47,500", "$366,000"],
        ],
      },
    ],
    narrative:
      "Every month you receive a clean, reconciled close with financial statements and a short commentary on what changed and why — delivered by day five. (Sample figures.)",
  },
  {
    key: "demo-tax",
    serviceLine: "TAX",
    name: "Tax Planning — sample savings summary",
    title: "Tax Planning Summary",
    subtitle: "Example of a proactive planning deliverable (sample data)",
    metrics: [
      { label: "Identified savings", value: "$182,000" },
      { label: "Strategies applied", value: "6" },
      { label: "Effective rate", value: "24% → 19%" },
    ],
    tables: [
      {
        title: "Planning opportunities (sample)",
        columns: ["Strategy", "Est. savings"],
        rows: [
          ["Entity structure / S-election", "$64,000"],
          ["Accountable plan & fringe benefits", "$22,000"],
          ["Retirement plan optimization", "$51,000"],
          ["Cost segregation / accelerated depreciation", "$45,000"],
        ],
      },
    ],
    narrative:
      "Before year-end we model your liability and walk through concrete, defensible strategies to reduce it — so filing holds no surprises. (Sample figures.)",
  },
  {
    key: "demo-qoe",
    serviceLine: "QOE",
    name: "Quality of Earnings — sample report excerpt",
    title: "Quality of Earnings — Summary",
    subtitle: "Example of a QoE databook excerpt (sample data)",
    metrics: [
      { label: "Reported EBITDA", value: "$3.20M" },
      { label: "Adjustments", value: "+$0.86M" },
      { label: "Adjusted EBITDA", value: "$4.06M" },
      { label: "Net working capital peg", value: "$1.15M" },
    ],
    tables: [
      {
        title: "EBITDA bridge (sample)",
        columns: ["Item", "Amount"],
        rows: [
          ["Reported EBITDA", "$3,200,000"],
          ["Owner compensation normalization", "$420,000"],
          ["Non-recurring legal", "$180,000"],
          ["Run-rate new contracts", "$260,000"],
          ["Adjusted EBITDA", "$4,060,000"],
        ],
      },
    ],
    narrative:
      "We surface the adjustments, risks, and working-capital dynamics that determine true earnings — so you can move on a deal with confidence. (Sample figures.)",
  },
  {
    key: "demo-cfo",
    serviceLine: "ADVISORY",
    name: "Fractional CFO — sample dashboard",
    title: "CFO Dashboard",
    subtitle: "Example of your monthly advisory deliverable (sample data)",
    metrics: [
      { label: "Cash runway", value: "14 months" },
      { label: "MoM revenue growth", value: "+7%" },
      { label: "Gross margin", value: "61%" },
      { label: "Burn multiple", value: "1.2x" },
    ],
    tables: [
      {
        title: "13-week cash forecast (sample)",
        columns: ["Horizon", "Beginning cash", "Ending cash"],
        rows: [
          ["Weeks 1-4", "$820,000", "$690,000"],
          ["Weeks 5-8", "$690,000", "$742,000"],
          ["Weeks 9-13", "$742,000", "$705,000"],
        ],
      },
    ],
    narrative:
      "Each month you get forward-looking cash visibility, KPI tracking, and a strategy session — senior finance leadership without the full-time cost. (Sample figures.)",
  },
];

let seeded = false;

export async function ensureDemosSeeded() {
  if (seeded) return;
  const count = await prisma.demoTemplate.count();
  if (count < DEMO_SEEDS.length) {
    for (let i = 0; i < DEMO_SEEDS.length; i++) {
      const d = DEMO_SEEDS[i];
      await prisma.demoTemplate.upsert({
        where: { key: d.key },
        update: {
          serviceLine: d.serviceLine,
          name: d.name,
          title: d.title,
          subtitle: d.subtitle,
          metrics: d.metrics,
          tables: d.tables,
          narrative: d.narrative,
          sortOrder: i,
        },
        create: {
          key: d.key,
          serviceLine: d.serviceLine,
          name: d.name,
          title: d.title,
          subtitle: d.subtitle,
          metrics: d.metrics,
          tables: d.tables,
          narrative: d.narrative,
          isPlaceholder: true,
          sortOrder: i,
        },
      });
    }
  }
  seeded = true;
}

function toContent(d: {
  key: string;
  serviceLine: string;
  name: string;
  title: string;
  subtitle: string | null;
  metrics: unknown;
  tables: unknown;
  narrative: string | null;
  isPlaceholder: boolean;
}): DemoContent {
  return {
    key: d.key,
    serviceLine: d.serviceLine,
    name: d.name,
    title: d.title,
    subtitle: d.subtitle,
    metrics: (d.metrics as DemoMetric[]) ?? [],
    tables: (d.tables as DemoTable[]) ?? [],
    narrative: d.narrative,
    isPlaceholder: d.isPlaceholder,
  };
}

export async function listDemos(): Promise<DemoContent[]> {
  await ensureDemosSeeded();
  const rows = await prisma.demoTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(toContent);
}

export async function getDemo(key: string): Promise<DemoContent | null> {
  await ensureDemosSeeded();
  const d = await prisma.demoTemplate.findUnique({ where: { key } });
  return d ? toContent(d) : null;
}
