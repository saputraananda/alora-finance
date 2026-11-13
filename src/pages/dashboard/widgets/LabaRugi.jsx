import { Cell, Pie, PieChart } from "recharts";
import { useDashData } from "../data";
import { Card, State, Stat, cn, jt, rangeLabel, unitNote } from "../ui";

const UNIT_LABEL = { waschen: "Waschen", cleanox: "Cleanox" };

// Laba/Rugi periode terpilih: donat margin, pendapatan − beban = laba (dari jurnal),
// dibandingkan dengan periode sebelumnya. Kotak Waschen/Cleanox = penjualan POS per unit.
export default function LabaRugi({ unit }) {
  const entry = useDashData("main");
  const sales = useDashData("sales").data;
  const d = entry.data;
  const k = d?.kpis;
  const profit = k ? k.net_profit >= 0 : true;
  const margin = k ? Math.max(0, Math.min(100, k.net_margin)) : 0;
  const chg = k?.profit_change_percent;

  return (
    <Card title="Laba / Rugi" subtitle={d ? rangeLabel(d.period.from, d.period.to) : undefined} note={unitNote(d)}>
      <State entry={entry}>
        {d && (
          <>
            <div className="flex items-center gap-5">
              <div className="relative h-[120px] w-[120px] shrink-0">
                <PieChart width={120} height={120}>
                  <Pie data={[{ v: margin }, { v: 100 - margin }]} dataKey="v" innerRadius={42} outerRadius={56} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                    <Cell fill={profit ? "#2563eb" : "#f43f5e"} />
                    <Cell fill="#eef2f7" />
                  </Pie>
                </PieChart>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-extrabold tabular-nums text-slate-800">{String(k.net_margin).replace(".", ",")}%</span>
                  <span className="text-[10px] text-slate-400">margin laba</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex items-center justify-between py-0.5">
                  <span className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />Pendapatan</span>
                  <span className="font-semibold tabular-nums text-slate-700">{jt(k.revenue)}</span>
                </div>
                <div className="flex items-center justify-between py-0.5">
                  <span className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Beban</span>
                  <span className="font-semibold tabular-nums text-slate-700">{jt(k.expense)}</span>
                </div>
                <div className="mt-2 flex items-end justify-between border-t border-slate-100 pt-2">
                  <span className="font-bold text-slate-700">{profit ? "Laba" : "Rugi"}</span>
                  <span className={cn("text-2xl font-extrabold tabular-nums", profit ? "text-blue-700" : "text-rose-600")}>{jt(k.net_profit)}</span>
                </div>
                {chg != null && (
                  <p className={cn("mt-1 text-[11px] font-semibold", chg >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toString().replace(".", ",")}% dibanding {rangeLabel(d.period.prev_from, d.period.prev_to)}
                  </p>
                )}
              </div>
            </div>
            {sales && (
              <div className={cn("mt-4 grid gap-3", unit === "all" ? "grid-cols-2" : "grid-cols-1")}>
                {Object.entries(UNIT_LABEL).filter(([k]) => unit === "all" || unit === k).map(([k, label]) => (
                  <Stat key={k} label={`Penjualan ${label}`} value={jt(sales.totals[k])} />
                ))}
              </div>
            )}
          </>
        )}
      </State>
    </Card>
  );
}
