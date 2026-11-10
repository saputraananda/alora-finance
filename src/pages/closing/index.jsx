import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AlokasiBiayaPusat from "./components/AlokasiBiayaPusat";
import { HiOutlineArrowRight, HiOutlineCheckCircle, HiOutlineLockClosed, HiOutlineMinusCircle, HiOutlineClock } from "react-icons/hi2";
import { api } from "../../lib/api";
import { currentCutoffKey, cutoffMonthLabel, cutoffRangeLabel, recentCutoffKeys } from "../../lib/cutoff";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const selectCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

const STATUS = {
  DONE: { label: "Selesai", icon: HiOutlineCheckCircle, ring: "bg-emerald-500 text-white", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PENDING: { label: "Belum", icon: HiOutlineClock, ring: "bg-amber-100 text-amber-700", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  UNAVAILABLE: { label: "Belum tersedia", icon: HiOutlineMinusCircle, ring: "bg-slate-100 text-slate-400", chip: "bg-slate-50 text-slate-400 border-slate-200" },
};

function ChecklistPeriode() {
  const [month, setMonth] = useState(currentCutoffKey());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Tutup Buku | HO Finance";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [y, m] = month.split("-");
      setData(await api(`/finance-ho/closing/checklist?year=${Number(y)}&month=${Number(m)}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleReview = async (done) => {
    setBusy(true);
    try {
      const [y, m] = month.split("-");
      await api("/finance-ho/closing/review", { method: "POST", body: JSON.stringify({ year: Number(y), month: Number(m), done }) });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const s = data?.summary;
  const pct = s ? Math.round((s.done / s.total) * 100) : 0;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">Tutup Buku</p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="rounded-xl bg-fuchsia-50 p-2 text-fuchsia-700"><HiOutlineLockClosed className="h-5 w-5" /></div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Checklist periode</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">Periode baru bisa dikunci setelah semua langkah selesai.</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Periode:
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls} title={cutoffRangeLabel(month)}>
            {recentCutoffKeys(18).map((k) => <option key={k} value={k}>{cutoffMonthLabel(k)}</option>)}
          </select>
          <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">{cutoffRangeLabel(month)}</span>
        </label>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {loading && !data && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">Memeriksa langkah tutup buku...</div>}

      {data && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-slate-800">{s.done} dari {s.total} langkah selesai</p>
              {s.unavailable > 0 && <p className="text-[11px] text-slate-400">{s.unavailable} langkah menunggu modul yang belum tersedia</p>}
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {data.steps.map((st) => {
                const meta = STATUS[st.status];
                const Icon = meta.icon;
                return (
                  <li key={st.no} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold", meta.ring)}>
                      {st.status === "DONE" ? <Icon className="h-5 w-5" /> : st.no}
                    </span>
                    <div className="min-w-[220px] flex-1">
                      <p className={cn("text-sm font-bold", st.status === "UNAVAILABLE" ? "text-slate-400" : "text-slate-800")}>{st.title}</p>
                      {(st.detail || st.progress) && (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {st.progress && st.progress.total > 0 && <span className="font-semibold text-slate-700">{rp(st.progress.done)} / {rp(st.progress.total)} {st.unit}</span>}
                          {st.progress && st.progress.total > 0 && st.detail ? " · " : ""}
                          {st.detail}
                        </p>
                      )}
                    </div>
                    {st.manual && (
                      <button type="button" disabled={busy} onClick={() => toggleReview(st.status !== "DONE")} className={cn("rounded-lg border px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-50", st.status === "DONE" ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}>
                        {st.status === "DONE" ? "Batalkan tanda" : "Tandai sudah direview"}
                      </button>
                    )}
                    {st.link && st.status !== "UNAVAILABLE" && (
                      <Link to={st.link} className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">Buka <HiOutlineArrowRight className="h-3 w-3" /></Link>
                    )}
                    {st.link && st.status === "UNAVAILABLE" && st.no === 3 && (
                      <Link to={st.link} className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">Buka <HiOutlineArrowRight className="h-3 w-3" /></Link>
                    )}
                    <span className={cn("whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold", meta.chip)}>{meta.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">
              Periode aktif tetap terbuka sampai semua langkah selesai. Penguncian periode akan ditambahkan setelah modul pendukungnya tersedia.
            </p>
            <button type="button" disabled className="cursor-not-allowed rounded-xl bg-slate-300 px-5 py-2.5 text-xs font-bold text-white">
              Kunci periode {cutoffMonthLabel(month).split(" ")[0]}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Tutup Buku: Checklist periode · Alokasi biaya pusat
const TABS = [
  { id: "checklist", label: "Checklist periode" },
  { id: "alokasi", label: "Alokasi biaya pusat" },
];

export default function TutupBuku() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "alokasi" ? "alokasi" : "checklist");
  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 px-4 pt-4 sm:px-6 sm:pt-6">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn("-mb-px border-b-2 px-4 py-2 text-xs font-bold transition", tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "checklist" ? <ChecklistPeriode /> : <AlokasiBiayaPusat />}
    </div>
  );
}
