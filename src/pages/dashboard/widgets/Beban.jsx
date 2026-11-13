import { Cell, Pie, PieChart } from "recharts";
import { useDashData } from "../data";
import { Card, State, cn, jt, juta, rangeLabel, unitNote } from "../ui";

// 5 beban terbesar + "Lainnya"; biru untuk beban terbesar, jingga/kuning untuk berikutnya
const COLORS = ["#2563eb", "#60a5fa", "#93c5fd", "#f59e0b", "#fcd34d", "#cbd5e1"];

export default function Beban() {
  const entry = useDashData("main");
  const d = entry.data;
  const b = d?.expense_breakdown;
  const items = b ? [...b.top.map((t) => ({ name: t.name, amount: t.amount })), ...(b.other.amount > 0 ? [{ name: "Lainnya*", amount: b.other.amount }] : [])] : [];
  const rest = b ? b.other.amount - b.other.items.reduce((s, i) => s + i.amount, 0) : 0;
  const bud = d?.budget;
  const budTone = bud ? (bud.used_percent > 100 ? "bg-rose-500" : bud.used_percent >= 80 ? "bg-amber-500" : "bg-emerald-500") : "";

  return (
    <Card title="Beban Perusahaan" subtitle={d ? rangeLabel(d.period.from, d.period.to) : undefined} note={unitNote(d)}>
      <State entry={entry} empty={b && items.length === 0 ? "Belum ada jurnal beban pada rentang ini." : null}>
        {d && b && (
          <>
            <div className="flex items-center gap-5">
              <div className="relative h-[130px] w-[130px] shrink-0">
                <PieChart width={130} height={130}>
                  <Pie data={items} dataKey="amount" innerRadius={44} outerRadius={62} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                    {items.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                </PieChart>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-extrabold tabular-nums text-slate-800">{juta(b.total)}</span>
                  <span className="text-[10px] text-slate-400">juta Rp</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
                {items.map((it, i) => (
                  <li key={it.name} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-slate-600">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[i] }} />
                      <span className="truncate">{it.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-700">{jt(it.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {b.other.items.length > 0 && (
              <p className="mt-3 text-[11px] text-slate-400">
                *Lainnya: {b.other.items.map((i) => `${i.name} ${jt(i.amount)}`).join(" · ")}
                {rest > 0.5 ? ` · beban lain ${jt(rest)}` : ""}
              </p>
            )}
            {bud && (
              <div className="mt-3 border-t border-slate-100 pt-2.5">
                <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                  <span>Anggaran beban terserap</span>
                  <span className="font-bold text-slate-700">{String(bud.used_percent).replace(".", ",")}% dari {jt(bud.total)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full", budTone)} style={{ width: `${Math.min(bud.used_percent, 100)}%` }} />
                </div>
              </div>
            )}
          </>
        )}
      </State>
    </Card>
  );
}
