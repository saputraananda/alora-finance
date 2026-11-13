import { useDashData } from "../data";
import { Card, State, rangeLabel, rupiah } from "../ui";

// Volume cucian dari nota POS pada rentang terpilih (widget tambahan, tidak tampil di bawaan).
export default function Volume() {
  const entry = useDashData("overview");
  const d = entry.data;
  const k = d?.kpis;

  return (
    <Card title="Volume cucian" subtitle={d ? rangeLabel(d.period.start_date, d.period.end_date) : undefined}>
      <State entry={entry}>
        {k && (
          <>
            <p className="text-2xl font-extrabold tracking-tight text-slate-900">{rupiah(k.volume_kg)} kg</p>
            <p className="mt-1 text-[11px] text-slate-500">
              ± {rupiah(k.volume_kg_per_day)} kg per hari · {rupiah(k.volume_pcs)} pcs satuan · {rupiah(k.volume_notes)} nota
            </p>
          </>
        )}
      </State>
    </Card>
  );
}
