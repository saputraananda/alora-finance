import { useCallback, useEffect, useState } from "react";
import { HiOutlineArrowPath, HiOutlineCreditCard } from "react-icons/hi2";
import { api } from "../../lib/api";
import FinanceOnly from "./components/FinanceOnly";
import RequestDetailModal from "./components/RequestDetailModal";
import { cn, dmy, rp, selectCls, thCls } from "./utils/format";

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn("mt-1 text-xl font-extrabold tracking-tight text-slate-800", tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const todayStr = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export default function Kredit() {
  const [paid, setPaid] = useState("unpaid");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    document.title = "Kredit & Cicilan | HO Finance";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (paid) qs.set("paid", paid);
      setData(await api(`/finance-ho/purchasing/credit?${qs}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [paid]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary;
  const today = todayStr();
  const rows = data?.data || [];

  return (
    <FinanceOnly>
      <div className="space-y-5 p-4 sm:p-6">
        {openId && <RequestDetailModal id={openId} onClose={() => setOpenId(null)} />}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-slate-400">Pembelian</p>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="rounded-xl bg-amber-50 p-2 text-amber-700"><HiOutlineCreditCard className="h-5 w-5" /></div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Kredit & cicilan</h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">Pengajuan yang dibayar kredit. Sisa yang belum dibayar menjadi hutang usaha.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={paid} onChange={(e) => setPaid(e.target.value)} className={selectCls}>
              <option value="unpaid">Belum lunas</option>
              <option value="paid">Lunas</option>
              <option value="">Semua</option>
            </select>
            <button type="button" onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
              <HiOutlineArrowPath className={cn("h-4 w-4", loading && "animate-spin")} /> Muat ulang
            </button>
          </div>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

        {s && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Total kredit" value={`Rp ${rp(s.target)}`} hint={`${rp(s.count_all)} pengajuan`} />
            <Kpi label="Sudah dibayar" value={`Rp ${rp(s.paid)}`} />
            <Kpi label="Sisa hutang" value={`Rp ${rp(s.sisa)}`} tone={s.sisa ? "text-amber-600" : undefined} hint={`${rp(s.count_unpaid)} belum lunas`} />
            <Kpi label="Lunas" value={rp(s.count_paid)} />
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className={thCls}>Kode</th>
                  <th className={thCls}>Barang / keperluan</th>
                  <th className={thCls}>Pengaju</th>
                  <th className={thCls}>Jatuh tempo</th>
                  <th className={cn(thCls, "text-right")}>Total</th>
                  <th className={cn(thCls, "text-right")}>Dibayar</th>
                  <th className={cn(thCls, "text-right")}>Sisa</th>
                  <th className={thCls}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !data ? (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-400">Memuat...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-400">Tidak ada data kredit.</td></tr>
                ) : (
                  rows.map((r) => {
                    const late = !r.is_lunas && r.jatuh_tempo && String(r.jatuh_tempo).slice(0, 10) < today;
                    return (
                      <tr key={r.pr_id} onClick={() => setOpenId(r.pr_id)} className="cursor-pointer hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{r.pr_code}</td>
                        <td className="max-w-[240px] truncate px-3 py-2 text-slate-700" title={r.nama_barang}>{r.nama_barang}</td>
                        <td className="max-w-[160px] truncate px-3 py-2 text-slate-500">{r.pengaju_name || "-"}</td>
                        <td className={cn("whitespace-nowrap px-3 py-2 tabular-nums", late ? "font-bold text-rose-600" : "text-slate-500")}>
                          {r.jatuh_tempo ? dmy(r.jatuh_tempo) : "-"}{late ? " · lewat" : ""}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{rp(r.amount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{rp(r.total_paid)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{rp(r.sisa)}</td>
                        <td className="px-3 py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", r.is_lunas ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                            {r.is_lunas ? "Lunas" : "Belum lunas"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </FinanceOnly>
  );
}
