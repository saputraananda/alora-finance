import { useMemo, useState } from "react";
import { HiOutlineCalendarDays } from "react-icons/hi2";
import { currentCutoff, cutoffRange, todayWib } from "../lib/cutoff";

const cn = (...c) => c.filter(Boolean).join(" ");

// Filter tanggal seperti halaman Pengajuan SuperApp: Cutoff · Rentang Tanggal · Satu Hari · Semua.
// Cutoff = tanggal 26 bulan sebelumnya s/d 25 bulan terpilih.
// Dipakai di Pembelian dan Dashboard. Prop `modes` membatasi pilihan mode yang tampil.
const MODES = [
  { key: "cutoff", label: "Cutoff" },
  { key: "range", label: "Rentang Tanggal" },
  { key: "single", label: "Satu Hari" },
  { key: "all", label: "Semua" },
];

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition";

const fmtLong = (s) => (s ? `${s.slice(0, 4)}-${s.slice(5, 7)}-${s.slice(8, 10)}` : "");

/** State + rentang tanggal efektif untuk dikirim ke backend. */
export function useDateFilter(defaultMode = "cutoff") {
  const cur = useMemo(() => currentCutoff(), []);
  const [mode, setMode] = useState(defaultMode);
  const [year, setYear] = useState(cur.year);
  const [month, setMonth] = useState(cur.month);
  const [customFrom, setCustomFrom] = useState(todayWib());
  const [customTo, setCustomTo] = useState(todayWib());
  const [single, setSingle] = useState(todayWib());

  let from = "";
  let to = "";
  if (mode === "cutoff") ({ from, to } = cutoffRange(year, month));
  else if (mode === "range") ({ from, to } = { from: customFrom, to: customTo });
  else if (mode === "single") ({ from, to } = { from: single, to: single });

  return {
    mode, setMode, year, setYear, month, setMonth,
    customFrom, setCustomFrom, customTo, setCustomTo, single, setSingle,
    from, to, ready: mode === "all" || (!!from && !!to),
    curYear: cur.year,
  };
}

// compact: tanpa judul & keterangan rentang, tidak membungkus baris (untuk bilah filter satu baris)
export default function DateFilter({ f, modes, compact = false }) {
  const years = [f.curYear, f.curYear - 1, f.curYear - 2];
  const range = cutoffRange(f.year, f.month);

  return (
    <div className={cn("flex items-center gap-2", compact ? "shrink-0 flex-nowrap" : "flex-wrap")}>
      {!compact && (
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
          <HiOutlineCalendarDays className="h-3.5 w-3.5" />
          <span className="font-semibold">Filter Tanggal:</span>
        </div>
      )}

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
        {MODES.filter((m) => !modes || modes.includes(m.key)).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => f.setMode(m.key)}
            className={cn(
              "whitespace-nowrap rounded-[10px] px-3 py-1.5 text-xs font-semibold transition",
              f.mode === m.key ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {f.mode === "cutoff" && (
        <>
          <select value={f.year} onChange={(e) => f.setYear(Number(e.target.value))} className={inputCls}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={f.month} onChange={(e) => f.setMonth(Number(e.target.value))} className={inputCls}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          {!compact && (
            <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-[11px] text-slate-400 sm:inline">
              {fmtLong(range.from)} s/d {fmtLong(range.to)}
            </span>
          )}
        </>
      )}

      {f.mode === "range" && (
        <>
          <input type="date" value={f.customFrom} max={f.customTo || undefined} onChange={(e) => f.setCustomFrom(e.target.value)} className={inputCls} />
          <span className="text-xs font-semibold text-slate-400">s/d</span>
          <input type="date" value={f.customTo} min={f.customFrom || undefined} onChange={(e) => f.setCustomTo(e.target.value)} className={inputCls} />
          {(!f.customFrom || !f.customTo) && (
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] text-amber-600">Pilih tanggal awal & akhir</span>
          )}
        </>
      )}

      {f.mode === "single" && (
        <>
          <input type="date" value={f.single} onChange={(e) => f.setSingle(e.target.value)} className={inputCls} />
          {!f.single && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] text-amber-600">Pilih tanggal</span>}
        </>
      )}

      {f.mode === "all" && (
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] text-slate-400">Menampilkan semua periode</span>
      )}
    </div>
  );
}
