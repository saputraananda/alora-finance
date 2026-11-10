import { HiOutlineCalendarDays } from "react-icons/hi2";
import { cutoffMonthLabel, cutoffRangeForKey, cutoffRangeLabel, recentCutoffKeys } from "../../lib/cutoff";

// Filter periode standar (StrukturCode §12): bulan cutoff 26→25, atau tanggal kustom.
// value: { custom: boolean, month: "YYYY-MM", from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
const cls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

const fmt = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");

/** Rentang tanggal aktual dari nilai filter. */
export function periodRange(v) {
  if (v.custom && v.from && v.to) return { from: v.from, to: v.to };
  return cutoffRangeForKey(v.month);
}

/** Teks periode untuk judul / footer. */
export function periodText(v) {
  if (v.custom && v.from && v.to) return `${fmt(v.from)} – ${fmt(v.to)}`;
  return cutoffMonthLabel(v.month);
}

export default function PeriodFilter({ value, onChange, label = "Periode" }) {
  const set = (patch) => onChange({ ...value, ...patch });

  // Tanggal awal = 26 → tanggal akhir otomatis 25 bulan berikutnya
  const onStart = (val) => {
    const patch = { from: val };
    if (val && Number(val.slice(8, 10)) === 26) {
      const d = new Date(`${val}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1);
      d.setUTCDate(25);
      patch.to = d.toISOString().slice(0, 10);
    }
    set(patch);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500">
      <span>{label}:</span>
      {!value.custom ? (
        <>
          <select value={value.month} onChange={(e) => set({ month: e.target.value })} className={cls} title={cutoffRangeLabel(value.month)}>
            {recentCutoffKeys(18).map((k) => (
              <option key={k} value={k}>{cutoffMonthLabel(k)}</option>
            ))}
          </select>
          <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">{cutoffRangeLabel(value.month)}</span>
        </>
      ) : (
        <>
          <input type="date" value={value.from || ""} onChange={(e) => onStart(e.target.value)} className={cls} />
          <span>s/d</span>
          <input type="date" value={value.to || ""} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} className={cls} />
        </>
      )}
      <button
        type="button"
        onClick={() => {
          if (value.custom) set({ custom: false });
          else {
            const r = cutoffRangeForKey(value.month);
            set({ custom: true, from: value.from || r.from, to: value.to || r.to });
          }
        }}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100"
      >
        <HiOutlineCalendarDays className="h-4 w-4 text-slate-400" />
        {value.custom ? "Gunakan Cutoff Bulanan" : "Custom Tanggal"}
      </button>
    </div>
  );
}
