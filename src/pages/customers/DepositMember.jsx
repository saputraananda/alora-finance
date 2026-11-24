import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineUsers,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import DepositHistoryDialog from "./DepositHistoryDialog";
import PageHeader, { FieldDateRange, FieldSelect, RefreshButton, SearchBox } from "../../components/ui/PageHeader";
import { currentCutoffKey, cutoffRangeForKey } from "../../lib/cutoff";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn("mt-1 text-xl font-extrabold tracking-tight text-slate-800", tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export default function DepositMember() {
  // Periode bawaan = periode cutoff berjalan (26 bulan lalu – 25 bulan ini)
  const [range, setRange] = useState(() => cutoffRangeForKey(currentCutoffKey()));
  const [outlet, setOutlet] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [dormant, setDormant] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [memberId, setMemberId] = useState(null);

  useEffect(() => {
    document.title = "Riwayat Deposit | HO Finance";
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to, page: String(page), limit: "25" });
      if (outlet) qs.set("outlet", outlet);
      if (q) qs.set("search", q);
      if (dormant) qs.set("dormant", "1");
      setData(await api(`/finance-ho/customers/deposit?${qs}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range, outlet, q, dormant, page]);

  useEffect(() => {
    load();
  }, [load]);

  const k = data?.kpis;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {memberId && <DepositHistoryDialog id={memberId} onClose={() => setMemberId(null)} />}

      <PageHeader crumb="Customer" icon={HiOutlineUsers} tone="bg-rose-50 text-rose-700" title="Riwayat Deposit" subtitle="Deposit untuk transaksi reguler. Deposit paket member tidak termasuk." search={<SearchBox value={search} onChange={setSearch} placeholder="Cari nama atau telepon customer" />}>
        <FieldSelect label="Cabang" value={outlet} onChange={(v) => { setOutlet(v); setPage(1); }}>
          <option value="">Semua</option>
          {(data?.outlets || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </FieldSelect>
        <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={dormant} onChange={(e) => { setDormant(e.target.checked); setPage(1); }} /> Tanpa transaksi &gt; 12 bln
        </label>
        <FieldDateRange from={range.from} to={range.to} onChange={(f, t) => { setRange({ from: f, to: t }); setPage(1); }} />
        <RefreshButton onClick={load} spinning={loading} />
      </PageHeader>


      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

      {k && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Kpi label="Total deposit" value={`Rp ${rp(k.topup_period)}`} hint={`Top-up periode ini · saldo tersisa Rp ${rp(k.pos_balance)}`} />
          <Kpi label="Total customer" value={rp(k.total_customers)} hint={`yang pernah deposit · ${rp(k.customers_period)} aktif di periode ini`} />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr><th className={th}>Customer</th><th className={th}>Cabang</th><th className={cn(th, "text-right")}>Top-up</th><th className={cn(th, "text-right")}>Dipakai</th><th className={cn(th, "text-right")}>Saldo terakhir</th><th className={th}>Transaksi terakhir</th><th className={th} /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">Memuat...</td></tr>
              ) : (data?.rows || []).length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">Tidak ada customer yang sesuai.</td></tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-bold text-slate-800">{r.name}{r.dormant && <span className="ml-1.5 rounded bg-amber-50 px-1.5 text-[9px] font-bold text-amber-700">&gt; 12 bln</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.outlet_name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.topup ? rp(r.topup) : "-"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.used ? rp(r.used) : "-"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rp(r.balance)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{dmy(r.last_tx)}</td>
                    <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => setMemberId(r.id)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">Lihat riwayat</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
            <span>{rp(data.pagination.total)} customer</span>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><HiOutlineChevronLeft className="h-4 w-4" /></button>
              <span className="px-1 font-bold text-slate-700">{page} / {data.pagination.totalPages}</span>
              <button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><HiOutlineChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
