'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// Reference palette (dataviz skill): one series hue, recessive axes/grid, text in ink colors.
const SERIES = '#2a78d6';
const INK_2 = '#52514e';
const GRID = '#e7e6e2';

type Row = { label: string; value: number | null; detail?: string };

function ChartTooltip({ active, payload, unit }: { active?: boolean; payload?: Array<{ payload: Row }>; unit: string }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-900">{r.label}</p>
      <p className="text-slate-700">
        {r.value === null ? 'not assessed yet' : `${r.value}${unit}`}
      </p>
      {r.detail && <p className="mt-0.5 max-w-[240px] text-slate-500">{r.detail}</p>}
    </div>
  );
}

/** Small key under a chart explaining the dashed target line (keeps labels off the bars). */
function TargetKey({ label }: { label: string }) {
  return (
    <div className="mt-2 flex items-center justify-end gap-4 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIES }} />Attainment</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="4" aria-hidden><line x1="0" y1="2" x2="18" y2="2" stroke={INK_2} strokeWidth="1.5" strokeDasharray="4 3" /></svg>{label}</span>
    </div>
  );
}

/** Vertical bars with a dashed target line, e.g. CLO attainment per CLO. */
export function AttainmentBarChart({ data, target, targetLabel, unit = '%', height = 260 }: { data: Row[]; target?: number; targetLabel?: string; unit?: string; height?: number }) {
  return (
    <div>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: -12 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fill: INK_2, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: INK_2, fontSize: 12 }} axisLine={false} tickLine={false} unit={unit} />
        <Tooltip cursor={{ fill: 'rgba(42,120,214,0.06)' }} content={<ChartTooltip unit={unit} />} />
        {target !== undefined && (
          <ReferenceLine y={target} stroke={INK_2} strokeDasharray="4 4" />
        )}
        <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
    {target !== undefined && <TargetKey label={targetLabel ?? `Target ${target}${unit}`} />}
    </div>
  );
}

/** Horizontal bars for long category names, e.g. PLO attainment. */
export function HorizontalBarChart({ data, target, unit = '%' }: { data: Row[]; target?: number; unit?: string }) {
  const height = Math.max(160, data.length * 34 + 40);
  return (
    <div>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }} barCategoryGap="24%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: INK_2, fontSize: 12 }} axisLine={false} tickLine={false} unit={unit} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fill: INK_2, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(42,120,214,0.06)' }} content={<ChartTooltip unit={unit} />} />
        {target !== undefined && <ReferenceLine x={target} stroke={INK_2} strokeDasharray="4 4" />}
        <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
    {target !== undefined && <TargetKey label={`Target ${target}${unit}`} />}
    </div>
  );
}

/** Count histogram (e.g. grade distribution). */
export function HistogramChart({ data, height = 220 }: { data: Array<{ label: string; value: number }>; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: -20 }} barCategoryGap="12%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fill: INK_2, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: INK_2, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(42,120,214,0.06)' }} content={<ChartTooltip unit=" students" />} />
        <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
