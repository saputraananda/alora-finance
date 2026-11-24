import { useMemo } from "react";
import { cutoffMonthLabel, cutoffRangeLabel, recentCutoffKeys, todayWib } from "../../lib/cutoff";
import { PERIOD_MODES } from "../../lib/period";

const cn = (...c) => c.filter(Boolean).join(" ");
const inputCls = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const lbl = "mb-1 block text-[11px] font-semibold text-slate-500";

// Pilihan periode di dalam dialog <MoreFilters>: jenis (Cutoff/Tahun/Bulan/Tanggal) + isian sesuai jenis.
// value/onChange memakai objek dari lib/period.js. modes: batasi jenis yang tampil, mis. ["cutoff","month"].
export default function PeriodPicker({ value, onChange, modes, label = "Periode", maxDate }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const years = useMemo(() => { const y = Number(todayWib().slice(0, 4)); return [y, y - 1, y - 2, y - 3].map(String); }, []);
  const list = PERIOD_MODES.filter(([k]) => !modes || modes.includes(k));
  return (
    <div className="!block">
      <p className={lbl}>{label}</p>
      <div className={cn("grid gap-1.5", list.length === 4 ? "grid-cols-4" : list.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {list.map(([k, l]) => (
          <button key={k} type="button" onClick={() => set("mode", k)} className={cn("rounded-lg border px-2 py-2 text-xs font-bold transition", value.mode === k ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>{l}</button>
        ))}
      </div>
      <div className="mt-2.5">
        {value.mode === "cutoff" && (
          <select value={value.cutoff} onChange={(e) => set("cutoff", e.target.value)} className={inputCls}>
            {recentCutoffKeys(24).map((k) => <option key={k} value={k}>{cutoffMonthLabel(k)} · {cutoffRangeLabel(k)}</option>)}
          </select>
        )}
        {value.mode === "year" && (
          <select value={value.year} onChange={(e) => set("year", e.target.value)} className={inputCls}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        )}
        {value.mode === "month" && (
          <input type="month" value={value.month} onChange={(e) => e.target.value && set("month", e.target.value)} className={inputCls} />
        )}
        {value.mode === "date" && (
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Dari</label><input type="date" value={value.from} max={value.to || maxDate} onChange={(e) => e.target.value && set("from", e.target.value)} className={inputCls} /></div>
            <div><label className={lbl}>Sampai</label><input type="date" value={value.to} min={value.from} max={maxDate} onChange={(e) => e.target.value && set("to", e.target.value)} className={inputCls} /></div>
          </div>
        )}
      </div>
    </div>
  );
}
