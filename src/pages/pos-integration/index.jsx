import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineBookOpen,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineComputerDesktop,
  HiOutlineXMark,
  HiOutlineReceiptRefund,
  HiOutlineTrash,
  HiOutlineArrowsRightLeft,
} from "react-icons/hi2";
import { api, getToken } from "../../lib/api";
import { todayWib } from "../../lib/cutoff";
import NotaModal from "../../components/NotaModal";
import HamburgerNav from "../../components/HamburgerNav";
import PageHeader, { FieldDate, FilterButton, PrimaryButton, RefreshButton, SearchBox } from "../../components/ui/PageHeader";
import FocFilterModal, { METHODS, PAYS, PAYSTATUS, SORTS, STATUSES, activeCount, defaultFilter, filterQuery, periodLabel, rangeOf } from "./FocFilter";
import SetoranKasir from "./SetoranKasir";
import SyncStatus, { defaultSyncDate } from "./SyncStatus";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dt = (d) => {
  if (!d) return "-";
  const s = typeof d === "string" ? d : new Date(d).toISOString();
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
};
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

const VIEWS = [
  { id: "transaksi", label: "Transaksi", icon: HiOutlineArrowsRightLeft, desc: "Riwayat nota dari POS" },
  { id: "refund", label: "Refund", icon: HiOutlineReceiptRefund, desc: "Pengajuan refund nota" },
  { id: "void", label: "Void", icon: HiOutlineTrash, desc: "Nota yang diajukan hapus" },
  { id: "setoran", label: "Jurnal Setoran Kasir", icon: HiOutlineBookOpen, desc: "Jurnal setoran dari closing shift" },
  { id: "sync", label: "Status Sinkron POS", icon: HiOutlineArrowPath, desc: "Penarikan data & jurnal otomatis" },
];

function workTone(p) {
  if (p >= 100) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (p >= 90) return "bg-sky-50 text-sky-700 border-sky-200";
  if (p > 10) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}
const PAY_TONE = { Lunas: "bg-emerald-50 text-emerald-700 border-emerald-200", DP: "bg-amber-50 text-amber-800 border-amber-200", Outstanding: "bg-rose-50 text-rose-700 border-rose-200" };

function Pager({ p, onPage }) {
  if (!p) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
      <span>{rp(p.total)} data</span>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={p.page <= 1} onClick={() => onPage(p.page - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><HiOutlineChevronLeft className="h-4 w-4" /></button>
        <span className="px-1 font-bold text-slate-700">{p.page} / {p.totalPages}</span>
        <button type="button" disabled={p.page >= p.totalPages} onClick={() => onPage(p.page + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><HiOutlineChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-800">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

// Satu hook memuat daftar sesuai tampilan (transaksi / refund / void)
function useList(path, filter, search, page, enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      setData(await api(`${path}?${filterQuery(filter, { search, page })}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path, filter, search, page, enabled]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// Filter yang sedang aktif ditampilkan sebagai chip yang bisa dihapus satu per satu, jadi pengguna selalu tahu data apa yang dilihat
function filterChips(f, meta) {
  const d = defaultFilter();
  const label = (list, v) => (list.find((x) => x[0] === v) || [v, v])[1];
  const chips = [];
  if (f.basis !== d.basis) chips.push({ k: "basis", t: "Berdasarkan tanggal pembayaran", clear: { basis: d.basis } });
  if (f.sort !== d.sort) chips.push({ k: "sort", t: `Urut: ${label(SORTS, f.sort)}`, clear: { sort: d.sort } });
  const many = (key, list, prefix) => f[key].forEach((v) => chips.push({ k: key + v, t: `${prefix}: ${list(v)}`, clear: { [key]: f[key].filter((x) => x !== v) } }));
  many("outlets", (v) => meta?.outlets?.find((o) => String(o.id) === v)?.name || v, "Cabang");
  many("categories", (v) => v, "Jenis");
  many("status", (v) => label(STATUSES, v), "Status");
  many("paystatus", (v) => label(PAYSTATUS, v), "Status bayar");
  many("pay", (v) => label(PAYS, v), "Pembayaran");
  many("methods", (v) => label(METHODS, v), "Metode");
  many("cashiers", (v) => meta?.cashiers?.find((c) => String(c.id) === v)?.name || v, "Pembuat nota");
  return chips;
}

function Empty({ cols, loading, text }) {
  return <tr><td colSpan={cols} className="py-10 text-center text-slate-400">{loading ? "Memuat..." : text}</td></tr>;
}

export default function FrontOfficeCashier() {
  const [params] = useSearchParams(); // ?date=&outlet= dari tautan lama → buka Status Sinkron
  const [view, setView] = useState(params.get("date") || params.get("outlet") ? "sync" : "transaksi");
  const [syncDate, setSyncDate] = useState(() => defaultSyncDate(params));
  const [filter, setFilter] = useState(defaultFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [meta, setMeta] = useState(null);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [nota, setNota] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { document.title = "Front Office Cashier | HO Finance"; }, []);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const r = rangeOf(filter);
    api(`/finance-ho/pos/foc/meta?from=${r.from}&to=${r.to}`).then(setMeta).catch(() => {});
  }, [filter.mode, filter.cutoff, filter.year, filter.month, filter.from, filter.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const path = view === "refund" ? "/finance-ho/pos/refunds" : view === "void" ? "/finance-ho/pos/voids" : "/finance-ho/pos/transactions";
  const listed = view === "transaksi" || view === "refund" || view === "void";
  const [tick, setTick] = useState(0);
  const { data, loading, error, reload } = useList(path, filter, q, page, listed);
  const withTools = listed || view === "setoran"; // tampilan yang memakai Cari + Filter
  const cur = VIEWS.find((v) => v.id === view);
  const n = activeCount(filter);
  

  const exportExcel = async () => {
    setExporting(true);
    setMsg("");
    try {
      const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/finance-ho/pos/transactions/export?${filterQuery(filter, { search: q })}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Gagal membuat file Excel");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      const r = rangeOf(filter);
      a.href = url;
      a.download = `transaksi-pos-${r.from}_${r.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setExporting(false);
    }
  };

  const goView = (id) => { setView(id); setPage(1); };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {nota && <NotaModal transactionId={nota} onClose={() => setNota(null)} />}
      {filterOpen && <FocFilterModal value={filter} meta={meta} onClose={() => setFilterOpen(false)} onApply={(f) => { setFilter(f); setPage(1); setFilterOpen(false); }} />}

      <PageHeader
        title={cur.label}
        subtitle={`${cur.desc}${withTools ? ` · ${periodLabel(filter)}` : ""}`}
        subnav={<HamburgerNav items={VIEWS.map((v) => ({ id: v.id, label: v.label, icon: v.icon, hint: v.desc }))} value={view} onSelect={goView} label="Front Office Cashier" />}
        search={withTools ? <SearchBox value={search} onChange={setSearch} placeholder={view === "setoran" ? "Cari no. jurnal / keterangan" : "Cari nota / nama customer"} /> : null}
      >
        {view === "sync" && <FieldDate label="Tanggal" value={syncDate} max={todayWib()} onChange={setSyncDate} />}
        {withTools && <FilterButton count={n} onClick={() => setFilterOpen(true)} />}
        {view === "transaksi" && <PrimaryButton onClick={exportExcel} disabled={exporting} icon={HiOutlineArrowDownTray}>{exporting ? "Menyiapkan..." : "Export Excel"}</PrimaryButton>}
        <RefreshButton onClick={() => (listed ? reload() : setTick((t) => t + 1))} spinning={loading && listed} />
      </PageHeader>

      {withTools && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">{periodLabel(filter)}</span>
          {filterChips(filter, meta).map((c) => (
            <span key={c.k} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1.5 text-[11px] font-semibold text-slate-700">
              {c.t}
              <button type="button" onClick={() => { setFilter((f) => ({ ...f, ...c.clear })); setPage(1); }} aria-label={`Hapus filter ${c.t}`} className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><HiOutlineXMark className="h-3 w-3" /></button>
            </span>
          ))}
          {n > 0 && <button type="button" onClick={() => { setFilter(defaultFilter()); setPage(1); }} className="px-1 text-[11px] font-bold text-slate-400 hover:text-rose-600">Reset semua</button>}
        </div>
        </div>
      )}

      {(msg || error) && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{msg || error}</p>}

      {view === "setoran" && <SetoranKasir filter={filter} q={q} tick={tick} />}
      {view === "sync" && <SyncStatus date={syncDate} tick={tick} />}

      {listed && data && (
        <div className={cn("grid gap-3", view === "transaksi" ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-3")}>
          <Stat label={view === "transaksi" ? "Jumlah nota" : view === "refund" ? "Jumlah refund" : "Jumlah void"} value={rp(data.summary?.count)} />
          <Stat label={view === "transaksi" ? "Total tagihan" : view === "refund" ? "Total refund" : "Total nilai nota"} value={`Rp ${rp(data.summary?.total)}`} />
          {view === "transaksi" && <Stat label="Total dibayar" value={`Rp ${rp(data.summary?.paid)}`} hint={data.summary?.total - data.summary?.paid > 0 ? `Belum terbayar Rp ${rp(data.summary.total - data.summary.paid)}` : "Semua terbayar"} />}
        </div>
      )}

      {view === "transaksi" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr><th className={th}>Tanggal</th><th className={th}>No. nota</th><th className={th}>Customer</th><th className={th}>Cabang</th><th className={th}>Pembuat nota</th><th className={cn(th, "text-center")}>Pengerjaan</th><th className={cn(th, "text-right")}>Tagihan</th><th className={cn(th, "text-center")}>Status bayar</th><th className={th}>Metode</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!data || data.rows.length === 0 ? <Empty cols={9} loading={loading} text="Tidak ada transaksi pada filter ini." /> : data.rows.map((r) => (
                  <tr key={r.id} onClick={() => setNota(r.id)} className="cursor-pointer hover:bg-emerald-50/40">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-500">{dt(r.order_date)}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">{r.order_no}</td>
                    <td className="px-3 py-2.5"><p className="font-bold text-slate-800">{r.customer_name}</p>{r.customer_phone && <p className="font-mono text-[10px] text-slate-400">{r.customer_phone}</p>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.outlet_name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.cashier || "-"}</td>
                    <td className="px-3 py-2.5 text-center"><span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold", workTone(r.work_status))}>{Math.round(r.work_status)}%</span></td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">{rp(r.grand_total)}</td>
                    <td className="px-3 py-2.5 text-center"><span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold", PAY_TONE[r.payment_status] || "bg-slate-100 text-slate-600 border-slate-200")}>{r.payment_status}</span></td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-slate-500" title={r.methods || ""}>{r.methods || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager p={data?.pagination} onPage={setPage} />
        </div>
      )}

      {view === "refund" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr><th className={th}>Diajukan</th><th className={th}>No. nota</th><th className={th}>Customer</th><th className={th}>Cabang</th><th className={th}>Jenis</th><th className={th}>Alasan</th><th className={th}>Pengaju</th><th className={th}>Status</th><th className={cn(th, "text-right")}>Nominal</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!data || data.rows.length === 0 ? <Empty cols={9} loading={loading} text="Belum ada pengajuan refund pada periode ini." /> : data.rows.map((r) => (
                  <tr key={r.id} onClick={() => setNota(r.transaction_id)} className="cursor-pointer hover:bg-emerald-50/40">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-500">{dt(r.requested_at)}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">{r.order_no}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-800">{r.customer_name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.outlet_name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.refund_type}{r.source ? ` · ${r.source}` : ""}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-600" title={r.reason || ""}>{r.reason || "-"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.requested_by || "-"}</td>
                    <td className="px-3 py-2.5"><span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">{r.status}</span></td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-rose-600">Rp {rp(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager p={data?.pagination} onPage={setPage} />
        </div>
      )}

      {view === "void" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr><th className={th}>Tanggal nota</th><th className={th}>No. nota</th><th className={th}>Customer</th><th className={th}>Cabang</th><th className={th}>Pembuat nota</th><th className={th}>Alasan hapus</th><th className={th}>Persetujuan</th><th className={cn(th, "text-right")}>Nilai nota</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!data || data.rows.length === 0 ? <Empty cols={8} loading={loading} text="Tidak ada nota void pada filter ini." /> : data.rows.map((r) => (
                  <tr key={r.id} onClick={() => setNota(r.id)} className="cursor-pointer hover:bg-emerald-50/40">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-500">{dt(r.order_date)}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">{r.order_no}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-800">{r.customer_name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.outlet_name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.cashier || "-"}</td>
                    <td className="max-w-[240px] truncate px-3 py-2.5 text-slate-600" title={r.reason || ""}>{r.reason || "-"}</td>
                    <td className="px-3 py-2.5"><span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">{r.approval || "Menunggu"}</span></td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">Rp {rp(r.grand_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager p={data?.pagination} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
