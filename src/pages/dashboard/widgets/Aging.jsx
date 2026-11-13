import { HiOutlineExclamationTriangle } from "react-icons/hi2";
import { useDashData } from "../data";
import { Card, State, cn, ddmm, jt, rupiah } from "../ui";

const COLOR = ["bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500"];

// Aging piutang ritel = nota POS belum lunas, dibaca langsung dari POS (posisi hari ini).
export default function Aging({ unit }) {
  const entry = useDashData("overview");
  const aging = entry.data?.aging;
  const max = aging ? Math.max(1, ...aging.buckets.map((b) => b.amount)) : 1;

  return (
    <Card
      title="Aging piutang ritel"
      subtitle={aging ? `Nota belum lunas per ${ddmm(aging.as_of)}, umur dihitung sejak nota dibuat` : undefined}
      right={aging && <span className="text-xs font-extrabold text-slate-700">Rp {jt(aging.total)}</span>}
      note={unit !== "all" ? "Alokasi per nota" : undefined}
    >
      <State entry={entry}>
        {aging && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              {aging.buckets.map((b, i) => (
                <div key={b.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">{b.label}</span>
                    <span className="tabular-nums text-slate-600">{jt(b.amount)} <span className="text-[10px] text-slate-400">· {rupiah(b.count)} nota</span></span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn("h-full rounded-full", COLOR[i])} style={{ width: `${b.amount > 0 ? Math.max(2, (b.amount / max) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
              {aging.over_90_percent >= 30 && (
                <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2.5 text-[11px] font-semibold text-rose-700">
                  <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {aging.over_90_percent.toString().replace(".", ",")}% piutang berumur lebih dari 90 hari. Perlu kebijakan penagihan atau penghapusan.
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">5 pelanggan terbesar</p>
              <ul className="divide-y divide-slate-100">
                {aging.top_customers.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-700">{c.customer}</p>
                      <p className="text-[10px] text-slate-400">{c.count} nota · tertua {rupiah(c.oldest)} hari</p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-700">{jt(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </State>
    </Card>
  );
}
