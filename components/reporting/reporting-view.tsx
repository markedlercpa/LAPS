"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LapsRow, PipelineStageRow, RepRow } from "@/lib/reporting";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROPOSAL_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import type { ProposalStatus } from "@prisma/client";

type LapsBundle = { week: LapsRow[]; month: LapsRow[]; quarter: LapsRow[] };

export function ReportingView({
  laps,
  pipeline,
  reps,
}: {
  laps: LapsBundle;
  pipeline: { rows: PipelineStageRow[]; totalCount: number; totalValue: number };
  reps: RepRow[];
}) {
  return (
    <Tabs defaultValue="laps">
      <TabsList>
        <TabsTrigger value="laps">LAPS Performance</TabsTrigger>
        <TabsTrigger value="pipeline">Open Pipeline</TabsTrigger>
        <TabsTrigger value="reps">Sales Reps</TabsTrigger>
      </TabsList>

      <TabsContent value="laps">
        <LapsPerformance laps={laps} />
      </TabsContent>
      <TabsContent value="pipeline">
        <Pipeline pipeline={pipeline} />
      </TabsContent>
      <TabsContent value="reps">
        <Reps reps={reps} />
      </TabsContent>
    </Tabs>
  );
}

function LapsPerformance({ laps }: { laps: LapsBundle }) {
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("week");
  const data = laps[period];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
        {(["week", "month", "quarter"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-3 py-1 capitalize ${
              period === p ? "bg-background shadow" : "text-muted-foreground"
            }`}
          >
            {p}ly
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LAPS Throughput ({period}ly)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="newLeads" name="Leads" fill="#94a3b8" />
              <Bar dataKey="apptsBooked" name="Appts" fill="#60a5fa" />
              <Bar dataKey="proposalsSent" name="Proposals" fill="#fbbf24" />
              <Bar dataKey="dealsWon" name="Won" fill="#4ade80" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Appts Booked</TableHead>
                <TableHead>Appts Completed</TableHead>
                <TableHead>Proposals Sent</TableHead>
                <TableHead>Deals Won</TableHead>
                <TableHead>Won Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell>{r.newLeads}</TableCell>
                  <TableCell>{r.apptsBooked}</TableCell>
                  <TableCell>{r.apptsCompleted}</TableCell>
                  <TableCell>{r.proposalsSent}</TableCell>
                  <TableCell>{r.dealsWon}</TableCell>
                  <TableCell>{formatCurrency(r.wonValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

const STAGE_FILL = ["#94a3b8", "#60a5fa", "#818cf8", "#a78bfa"];

function Pipeline({
  pipeline,
}: {
  pipeline: { rows: PipelineStageRow[]; totalCount: number; totalValue: number };
}) {
  const chartData = pipeline.rows.map((r) => ({
    label: PROPOSAL_STATUS_LABELS[r.status as ProposalStatus] ?? r.status,
    value: r.value,
    count: r.count,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Open Proposals" value={pipeline.totalCount} />
        <StatCard label="Open Pipeline Value" value={formatCurrency(pipeline.totalValue)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open Pipeline by Stage</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No open proposals in the pipeline.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={12} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="label" fontSize={12} width={80} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="value" name="Value">
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={STAGE_FILL[i % STAGE_FILL.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Reps({ reps }: { reps: RepRow[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Closed-Won Volume by Rep</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={reps}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="repName" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="wonValue" name="Won Value" fill="#4ade80" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead>Proposals</TableHead>
                <TableHead>Won</TableHead>
                <TableHead>Won Value</TableHead>
                <TableHead>Close Rate</TableHead>
                <TableHead>Avg Cycle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reps.map((r) => (
                <TableRow key={r.repId}>
                  <TableCell className="font-medium">{r.repName}</TableCell>
                  <TableCell>{r.proposalsCount}</TableCell>
                  <TableCell>{r.wonCount}</TableCell>
                  <TableCell>{formatCurrency(r.wonValue)}</TableCell>
                  <TableCell>{(r.closeRate * 100).toFixed(0)}%</TableCell>
                  <TableCell>
                    {r.avgCycleDays != null ? `${r.avgCycleDays} days` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
