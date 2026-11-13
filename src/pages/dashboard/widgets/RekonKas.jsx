import { Link } from "react-router-dom";
import { HiOutlineArrowRight } from "react-icons/hi2";
import { useDashData } from "../data";
import { Card, State, Stat, jt, rangeLabel, rupiah } from "../ui";

// Ringkasan rekonsiliasi & kas pada rentang terpilih: hari cocok, selisih kas, QRIS/EDC belum cair, beban MDR.
export default function RekonKas() {
  const entry = useDashData("overview");
  const d = entry.data;
  const k = d?.kpis;

  return (
    <Card
      title="Rekonsiliasi & Kas"
      subtitle={d ? rangeLabel(d.period.start_date, d.period.end_date) : undefined}
      right={
        <Link to="/finance-ho/rekonsiliasi" className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
          Buka <HiOutlineArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <State entry={entry}>
        {k && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Stat label="Hari cocok" value={`${rupiah(k.cocok_days)} / ${rupiah(k.active_days)}`} hint="sudah dikunci & cocok" />
              <Stat
                label="Selisih kas"
                value={k.cash_diff_total === 0 ? "0" : `${k.cash_diff_total < 0 ? "−" : "+"}${rupiah(Math.abs(k.cash_diff_total))}`}
                tone={k.cash_diff_total < 0 ? "text-rose-600" : undefined}
                hint={`${k.cash_diff_days} hari berselisih`}
              />
              <Stat
                label="Belum cair"
                value={k.unsettled.count === 0 ? "Beres" : jt(k.unsettled.amount)}
                tone={k.unsettled.oldest_days >= 2 ? "text-amber-600" : undefined}
                hint={k.unsettled.count === 0 ? "QRIS/EDC cair semua" : `${k.unsettled.worst} · ${k.unsettled.oldest_days} hari`}
              />
            </div>
            <p className="mt-3 flex justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
              <span>Beban MDR periode ini</span>
              <span className="font-extrabold tabular-nums text-slate-800">Rp {rupiah(k.mdr_expense)}</span>
            </p>
          </>
        )}
      </State>
    </Card>
  );
}
