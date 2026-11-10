import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle } from "react-icons/hi2";
import { api } from "../../../lib/api";
import { currentCutoffKey, cutoffMonthLabel, cutoffRangeLabel, recentCutoffKeys } from "../../../lib/cutoff";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const selectCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

// Tutup Buku > Alokasi biaya pusat (Referensi hal. 27)
export default function AlokasiBiayaPusat() {
  const [month, setMonth] = useState(currentCutoffKey());
  const [rounding, setRounding] = useState("JUTA");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [y, m] = month.split("-").map(Number);
      setData(await api(`/finance-ho/closing/allocation?year=${y}&month=${m}&rounding=${rounding}`));
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [month, rounding]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const [y, m] = month.split("-").map(Number);
      const res = await api("/finance-ho/closing/allocation", { method: "POST", body: JSON.stringify({ year: y, month: m, rounding }) });
      setMsg({ type: "ok", text: res.message });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
        <label className="flex items-center gap-1.5">Periode:
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
            {recentCutoffKeys(18).map((k) => <option key={k} value={k}>{cutoffMonthLabel(k)}</option>)}
          </select>
        </label>
        <span className="text-[11px] font-medium text-slate-400">{cutoffRangeLabel(month)}</span>
        <label className="ml-auto flex items-center gap-1.5">Pembulatan:
          <select value={rounding} onChange={(e) => setRounding(e.target.value)} className={selectCls}>
            <option value="JUTA">ke juta terdekat</option>
            <option value="RIBU">ke ribu terdekat</option>
            <option value="NONE">tanpa pembulatan</option>
          </select>
        </label>
      </div>

      {msg && (
        <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs font-medium", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {msg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {loading && !data && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">Menghitung alokasi...</div>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Biaya pusat {cutoffMonthLabel(month).split(" ")[0]}</p>
              <p className="mt-1 text-xl font-extrabold text-slate-800">Rp {rp(data.central_total)}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Semua beban berdimensi "Pusat" di jurnal</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dasar alokasi</p>
              <p className="mt-1 text-xl font-extrabold text-slate-800">{data.base}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Pendapatan cabang Rp {rp(data.revenue_total)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
              <p className={cn("mt-1 text-xl font-extrabold", data.existing?.status === "POSTED" ? "text-emerald-700" : "text-slate-800")}>
                {data.existing?.status === "POSTED" ? "Diposting" : "Belum diposting"}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-400">{data.existing?.entry_no || "-"}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white xl:col-span-3">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50"><tr><th className={th}>Cabang</th><th className={cn(th, "text-right")}>Pendapatan</th><th className={cn(th, "text-right")}>Porsi</th><th className={cn(th, "text-right")}>Alokasi</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-slate-400">Belum ada pendapatan cabang di jurnal periode ini. <Link to="/finance-ho/integrasi-pos" className="font-bold text-emerald-700 hover:underline">Posting dari Integrasi POS</Link>.</td></tr>
                  ) : (
                    data.rows.map((r) => (
                      <tr key={r.outlet_id}><td className="px-3 py-2.5 font-bold text-slate-800">{r.outlet_name}</td><td className="px-3 py-2.5 text-right tabular-nums">{rp(r.revenue)}</td><td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{String(r.share).replace(".", ",")}%</td><td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rp(r.amount)}</td></tr>
                    ))
                  )}
                </tbody>
                {data.rows.length > 0 && (
                  <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-extrabold"><tr><td className="px-3 py-2.5">Total</td><td className="px-3 py-2.5 text-right tabular-nums">{rp(data.revenue_total)}</td><td className="px-3 py-2.5 text-right">100%</td><td className="px-3 py-2.5 text-right tabular-nums">{rp(data.rows.reduce((s, r) => s + r.amount, 0))}</td></tr></tfoot>
                )}
              </table>
            </div>

            <div className="space-y-3 xl:col-span-2">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <p className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Jurnal alokasi</p>
                {data.lines.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">Pratinjau muncul bila ada biaya pusat dan pendapatan cabang.</p>
                ) : (
                  <table className="w-full text-[11px]">
                    <tbody>
                      {data.lines.map((l, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className={cn("px-4 py-1.5", l.credit > 0 && "pl-8")}><span className="font-semibold text-slate-700">{l.account}</span><span className="block text-[10px] text-slate-400">{l.outlet}</span></td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{l.debit > 0 ? rp(l.debit) : ""}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{l.credit > 0 ? rp(l.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex justify-end">
                <button type="button" disabled={!data.can_post || busy} onClick={post} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
                  {busy ? "Memposting..." : "Posting alokasi"}
                </button>
              </div>
              {data.existing?.status === "POSTED" && <p className="text-right text-[11px] text-slate-400">Untuk mengulang, balik jurnal {data.existing.entry_no} di menu Jurnal.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
