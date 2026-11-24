import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineUsers,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import DepositHistoryDialog from "./DepositHistoryDialog";
import PageHeader, { FieldSelect, RefreshButton, SearchBox } from "../../components/ui/PageHeader";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dmy = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";
const TIER_CLS = { VIP: "bg-amber-50 text-amber-700", Gold: "bg-yellow-50 text-yellow-700", Reguler: "bg-slate-100 text-slate-600", "One-Time": "bg-sky-50 text-sky-700" };

// Customer > Daftar Customer (read-only dari POS). Ikon mata = riwayat deposit customer itu.
export default function DaftarCustomer() {
  const [outlet, setOutlet] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [custId, setCustId] = useState(null);

  useEffect(() => { document.title = "Daftar Customer | HO Finance"; }, []);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "25" });
      if (outlet) qs.set("outlet", outlet);
      if (q) qs.set("search", q);
      setData(await api(`/finance-ho/customers?${qs}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [outlet, q, page]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {custId && <DepositHistoryDialog id={custId} onClose={() => setCustId(null)} />}

      <PageHeader crumb="Customer" icon={HiOutlineUsers} tone="bg-rose-50 text-rose-700" title="Daftar Customer" subtitle="Data pelanggan dari POS (hanya dibaca)." search={<SearchBox value={search} onChange={setSearch} placeholder="Cari nama, telepon, atau kode customer" />}>
        <FieldSelect label="Cabang" value={outlet} onChange={(v) => { setOutlet(v); setPage(1); }}>
          <option value="">Semua</option>
          {(data?.outlets || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </FieldSelect>
        <RefreshButton onClick={load} spinning={loading} />
      </PageHeader>


      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className={th}>No</th><th className={th}>Nama pelanggan</th><th className={th}>No. telepon</th><th className={th}>Cabang terdaftar</th>
                <th className={cn(th, "text-center")}>Tier</th><th className={cn(th, "text-center")}>Member</th><th className={th}>Total transaksi</th>
                <th className={th}>Terdaftar pada</th><th className={th}>Terakhir transaksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">Memuat...</td></tr>
              ) : (data?.rows || []).length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">Tidak ada customer yang sesuai.</td></tr>
              ) : (
                data.rows.map((r, i) => (
                  <tr key={r.id} onClick={() => setCustId(r.id)} onKeyDown={(e) => e.key === "Enter" && setCustId(r.id)} tabIndex={0} title="Klik untuk melihat riwayat deposit" className="cursor-pointer hover:bg-slate-50/60 focus:bg-slate-50 focus:outline-none">
                    <td className="px-3 py-2.5 text-slate-400">{(data.pagination.page - 1) * data.pagination.limit + i + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-slate-800">{r.name}</p>
                      {r.area && <p className="text-[11px] font-semibold text-rose-900/70">{r.area}</p>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-emerald-700">{r.phone || "-"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.outlet_name}</td>
                    <td className="px-3 py-2.5 text-center">{r.tier ? <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold", TIER_CLS[r.tier] || "bg-slate-100 text-slate-600")}>{r.tier}</span> : "-"}</td>
                    <td className="px-3 py-2.5 text-center">{r.member ? <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cyan-700">{r.member.replace(/^Member\s+/i, "")}</span> : <span className="text-slate-300">-</span>}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-700">{rp(r.total_orders)}X</td>
                    <td className="px-3 py-2.5 text-slate-500">{dmy(r.registered_at)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{dmy(r.last_tx)}</td>
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
