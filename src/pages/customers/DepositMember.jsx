import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass,
  HiOutlineUsers,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import { currentCutoffKey, cutoffMonthLabel, cutoffRangeLabel, recentCutoffKeys } from "../../lib/cutoff";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");
const selectCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
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

function Mutations({ id, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    api(`/finance-ho/customers/deposit/${id}`).then(setD).catch(() => setD({ rows: [], member: { name: "-", balance: 0 } }));
  }, [id]);
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h3 className="text-base font-bold text-slate-800">Mutasi member {d?.member?.name}</h3>
            <p className="text-xs text-slate-500">Saldo saat ini Rp {rp(d?.member?.balance)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>
        <div className="overflow-auto">
          {!d ? (
            <p className="p-10 text-center text-xs text-slate-400">Memuat...</p>
          ) : d.rows.length === 0 ? (
            <p className="p-10 text-center text-xs text-slate-400">Belum ada mutasi.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50"><tr><th className={th}>Waktu</th><th className={th}>Jenis</th><th className={cn(th, "text-right")}>Jumlah</th><th className={cn(th, "text-right")}>Bonus</th><th className={cn(th, "text-right")}>Saldo</th><th className={th}>Keterangan</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{dmy(r.at.slice(0, 10))} {r.at.slice(11)}</td>
                    <td className="px-3 py-2"><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", r.jenis === "Top-up" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{r.jenis}</span></td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{rp(r.amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.bonus ? rp(r.bonus) : "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.balance_after == null ? "-" : rp(r.balance_after)}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-slate-500" title={r.notes}>{r.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DepositMember() {
  const [month, setMonth] = useState(currentCutoffKey());
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
    document.title = "Deposit Member | HO Finance";
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
      const [y, m] = month.split("-");
      const qs = new URLSearchParams({ year: String(Number(y)), month: String(Number(m)), page: String(page), limit: "25" });
      if (outlet) qs.set("outlet", outlet);
      if (q) qs.set("search", q);
      if (dormant) qs.set("dormant", "1");
      setData(await api(`/finance-ho/customers/deposit?${qs}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [month, outlet, q, dormant, page]);

  useEffect(() => {
    load();
  }, [load]);

  const k = data?.kpis;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {memberId && <Mutations id={memberId} onClose={() => setMemberId(null)} />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">Pelanggan</p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="rounded-xl bg-rose-50 p-2 text-rose-700"><HiOutlineUsers className="h-5 w-5" /></div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Deposit member</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">Saldo deposit di POS harus sama dengan akun Deposit di jurnal (kewajiban kepada pelanggan).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Cabang:
            <select value={outlet} onChange={(e) => { setOutlet(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">Semua</option>
              {(data?.outlets || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Periode:
            <select value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} className={selectCls} title={cutoffRangeLabel(month)}>
              {recentCutoffKeys(18).map((x) => <option key={x} value={x}>{cutoffMonthLabel(x)}</option>)}
            </select>
          </label>
          <button type="button" onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
            <HiOutlineArrowPath className={cn("h-4 w-4", loading && "animate-spin")} /> Muat ulang
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

      {k && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Saldo member di POS" value={`Rp ${rp(k.pos_balance)}`} hint={`${rp(k.members_with_balance)} member punya saldo · posisi saat ini`} />
            <Kpi label={`Akun ${k.account || "Deposit"}`} value={`Rp ${rp(k.account_balance)}`} hint="Saldo kewajiban di jurnal" />
            <Kpi label="Selisih" value={k.matched ? "0" : `${k.diff > 0 ? "+" : ""}${rp(k.diff)}`} tone={k.matched ? "text-emerald-700" : "text-rose-600"} hint={k.matched ? "Cocok" : "Belum cocok"} />
            <Kpi label="Member aktif" value={rp(k.active_members)} hint="Bersaldo dan bertransaksi ≤ 12 bulan" />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Top-up periode" value={`Rp ${rp(k.topup_period)}`} hint={k.bonus_period ? `termasuk bonus Rp ${rp(k.bonus_period)}` : undefined} />
            <Kpi label="Saldo dipakai periode" value={`Rp ${rp(k.used_period)}`} hint="Pembayaran 'Potong Saldo Member'" />
            <Kpi label="Tanpa transaksi > 12 bulan" value={`${rp(k.dormant_count)} member`} hint={`Saldo Rp ${rp(k.dormant_amount)}`} tone={k.dormant_count ? "text-amber-600" : undefined} />
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-[11px] leading-relaxed text-slate-500">
              {k.matched ? (
                <span className="flex items-start gap-1.5 text-emerald-700"><HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> Saldo POS sama dengan akun.</span>
              ) : (
                <span className="flex items-start gap-1.5 text-amber-700"><HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Top-up deposit belum dicatat ke jurnal (POS tidak menyimpan metode bayar top-up), sehingga akun belum menggambarkan saldo POS.</span>
              )}
            </div>
          </div>
        </>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 sm:p-4">
          <div className="relative min-w-[200px] flex-1">
            <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau telepon member" className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
          </div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <input type="checkbox" checked={dormant} onChange={(e) => { setDormant(e.target.checked); setPage(1); }} /> Hanya tanpa transaksi &gt; 12 bulan
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr><th className={th}>Member</th><th className={th}>Cabang</th><th className={cn(th, "text-right")}>Top-up</th><th className={cn(th, "text-right")}>Dipakai</th><th className={cn(th, "text-right")}>Saldo terakhir</th><th className={th}>Transaksi terakhir</th><th className={th} /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">Memuat...</td></tr>
              ) : (data?.rows || []).length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">Tidak ada member yang sesuai.</td></tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-bold text-slate-800">{r.name}{r.dormant && <span className="ml-1.5 rounded bg-amber-50 px-1.5 text-[9px] font-bold text-amber-700">&gt; 12 bln</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.outlet_name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.topup ? rp(r.topup) : "-"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.used ? rp(r.used) : "-"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rp(r.balance)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{dmy(r.last_tx)}</td>
                    <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => setMemberId(r.id)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">Lihat mutasi</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
            <span>{rp(data.pagination.total)} member</span>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><HiOutlineChevronLeft className="h-4 w-4" /></button>
              <span className="px-1 font-bold text-slate-700">{page} / {data.pagination.totalPages}</span>
              <button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><HiOutlineChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">Proses kedaluwarsa saldo belum tersedia, menunggu kebijakan masa berlaku deposit dari finance.</p>
    </div>
  );
}
