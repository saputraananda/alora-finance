import { useState, useEffect, useCallback } from "react";
import {
  HiOutlineBookOpen,
  HiOutlinePlus,
  HiOutlineMagnifyingGlass,
  HiOutlineCheckCircle,
  HiOutlineArrowPath,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import {
  currentCutoffKey,
  cutoffRangeForKey,
  cutoffMonthLabel,
  cutoffRangeLabel,
  recentCutoffKeys,
} from "../../lib/cutoff";
import PeriodFilter, { periodRange, periodText } from "../../components/ui/PeriodFilter";
import FormJurnalManual from "./FormJurnalManual";
import DetailJurnalModal, { JOURNAL_STATUS } from "../../components/DetailJurnalModal";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: JURNAL > DAFTAR JURNAL
// Mengikuti mockup "Referensi Tampilan Aplikasi" (Menu · Jurnal > Daftar jurnal)
// ════════════════════════════════════════════════════════════════════════════
const SOURCE_BADGE = {
  POS: { label: "POS", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  MANUAL: { label: "Manual", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  REKONSILIASI: { label: "Rekonsiliasi", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  SETTLEMENT: { label: "Settlement", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  KAS_KECIL: { label: "Kas kecil", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  REKON_BANK: { label: "Bank", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  ALOKASI: { label: "Alokasi", cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
};

const STATUS_BADGE = JOURNAL_STATUS;

function shortDate(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = String(dateStr).slice(0, 10).split("-");
  return `${d}/${m}`;
}

// Periode mengikuti cutoff Waschen (26 bulan lalu – 25 bulan berjalan)
const currentMonthKey = currentCutoffKey;
const monthRange = cutoffRangeForKey;
const monthLabel = cutoffMonthLabel;

const selectCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

export default function JurnalUmum() {
  const [journals, setJournals] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });

  // Filter (sesuai mockup: Cabang · Periode · Sumber · Status · Cari)
  // Periode: bulan cutoff atau tanggal kustom (StrukturCode §12)
  const [period, setPeriod] = useState({ custom: false, month: currentMonthKey(), from: "", to: "" });
  const month = period.month;
  const [outletFilter, setOutletFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [exporting, setExporting] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback(
    (page, limit) => {
      const { from, to } = periodRange(period);
      const qs = new URLSearchParams({ page: String(page), limit: String(limit), from, to });
      if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
      if (statusFilter) qs.set("status", statusFilter);
      if (sourceFilter) qs.set("source", sourceFilter);
      if (outletFilter) qs.set("outlet", outletFilter);
      return qs;
    },
    [period, debouncedSearch, statusFilter, sourceFilter, outletFilter]
  );

  const fetchJournals = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const res = await api(`/finance-ho/journals?${buildQuery(page, 25).toString()}`);
        setJournals(res.data || []);
        if (res.outlets?.length) setOutlets(res.outlets);
        if (res.pagination) setPagination(res.pagination);
      } catch (err) {
        console.error("Gagal load jurnal:", err);
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    fetchJournals(1);
  }, [fetchJournals]);

  // Unduh Excel (CSV berpemisah titik koma + BOM, langsung terbuka rapi di Excel)
  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await api(`/finance-ho/journals?${buildQuery(page, 100).toString()}`);
        rows.push(...(res.data || []));
        totalPages = res.pagination?.totalPages || 1;
        page += 1;
      } while (page <= totalPages && page <= 50);

      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const head = ["No. Jurnal", "Tanggal", "Sumber", "Cabang", "Keterangan", "Total", "Status"];
      const body = rows.map((j) =>
        [
          j.entry_no,
          j.entry_date,
          (SOURCE_BADGE[j.source_type] || { label: j.source_type }).label,
          j.outlet_name,
          j.description,
          Number(j.total_amount) || 0,
          (STATUS_BADGE[j.status] || { label: j.status }).label,
        ]
          .map(esc)
          .join(";")
      );
      const csv = "﻿" + [head.map(esc).join(";"), ...body].join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `daftar-jurnal-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.message || "Gagal mengunduh data.");
    } finally {
      setExporting(false);
    }
  };

  const shownFrom = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const shownTo = (pagination.page - 1) * pagination.limit + journals.length;

  return (
    <>
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[10000] flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl animate-[fadeIn_0.2s_ease-out]">
          <HiOutlineCheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <FormJurnalManual
        open={formOpen}
        editId={editId}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        onSuccess={(result) => {
          showToast(`${result.message} (${result.entry_no})`);
          fetchJournals(1);
        }}
      />

      <DetailJurnalModal
        open={Boolean(detailId)}
        journalId={detailId}
        onClose={() => setDetailId(null)}
        onReversed={() => fetchJournals(pagination.page)}
        onChanged={(msg) => {
          showToast(msg);
          fetchJournals(pagination.page);
        }}
        onEdit={(id) => {
          setDetailId(null);
          setEditId(id);
          setFormOpen(true);
        }}
      />

      <main className="min-h-screen bg-slate-50 py-6 sm:py-8">
        <div className="mx-auto max-w-screen-2xl space-y-4 px-4 sm:px-6 lg:px-8">
          {/* Judul + filter global (Cabang · Periode) */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-slate-400">Jurnal</p>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="rounded-xl bg-teal-50 p-2 text-teal-700">
                  <HiOutlineBookOpen className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Daftar jurnal</h1>
              </div>
              <p className="mt-1 text-xs text-slate-500">Semua jurnal, otomatis maupun manual, di satu daftar.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                Cabang:
                <select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} className={selectCls}>
                  <option value="">Semua</option>
                  <option value="PUSAT">Pusat</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
              <PeriodFilter value={period} onChange={setPeriod} />
            </div>
          </div>

          {/* Kartu daftar */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Bar filter */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 sm:p-4">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                Sumber:
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={selectCls}>
                  <option value="">Semua</option>
                  <option value="POS">POS</option>
                  <option value="REKONSILIASI">Rekonsiliasi</option>
                  <option value="REKON_BANK">Bank (biaya admin)</option>
                  <option value="ALOKASI">Alokasi biaya pusat</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                Status:
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
                  <option value="">Semua</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING">Menunggu approval</option>
                  <option value="POSTED">Diposting</option>
                  <option value="REVERSED">Dibalik</option>
                </select>
              </label>
              <div className="relative min-w-[200px] flex-1">
                <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari no. jurnal atau keterangan"
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setFormOpen(true);
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700"
              >
                <HiOutlinePlus className="h-4 w-4 stroke-[2.5]" />
                Jurnal manual
              </button>
            </div>

            {/* Tabel */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">No. jurnal</th>
                    <th className="px-3 py-3">Tgl</th>
                    <th className="px-3 py-3">Sumber</th>
                    <th className="px-3 py-3">Cabang</th>
                    <th className="min-w-[220px] px-3 py-3">Keterangan</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <HiOutlineArrowPath className="h-6 w-6 animate-spin text-emerald-600" />
                          <span>Memuat daftar jurnal...</span>
                        </div>
                      </td>
                    </tr>
                  ) : journals.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <HiOutlineBookOpen className="h-8 w-8 text-slate-300" />
                          <span className="font-semibold text-slate-600">Tidak ada jurnal pada {periodText(period)}</span>
                          <span className="text-[11px] text-slate-400">
                            Ubah filter, posting dari Integrasi POS, atau buat jurnal manual.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    journals.map((j) => {
                      const src = SOURCE_BADGE[j.source_type] || SOURCE_BADGE.MANUAL;
                      const st = STATUS_BADGE[j.status] || STATUS_BADGE.POSTED;
                      return (
                        <tr
                          key={j.id}
                          onClick={() => setDetailId(j.id)}
                          className="cursor-pointer transition hover:bg-emerald-50/40"
                          title="Klik untuk melihat detail"
                        >
                          <td className="px-4 py-3 font-mono font-bold text-slate-800">{j.entry_no}</td>
                          <td className="px-3 py-3 tabular-nums text-slate-600">{shortDate(j.entry_date)}</td>
                          <td className="px-3 py-3">
                            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", src.cls)}>
                              {src.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-medium text-slate-700">{j.outlet_name}</td>
                          <td className="px-3 py-3 font-medium text-slate-800">
                            <div>{j.description}</div>
                            {j.reverses_entry_id && (
                              <span className="mt-0.5 inline-block rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                                Pembalik
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-800">
                            {new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(j.total_amount || 0)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold", st.cls)}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer: ringkasan + paginasi + unduh */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs">
              <span className="text-slate-500">
                Menampilkan{" "}
                <strong className="text-slate-700">
                  {shownFrom}-{shownTo}
                </strong>{" "}
                dari <strong className="text-slate-700">{pagination.total}</strong> jurnal {periodText(period)}
              </span>

              <div className="flex items-center gap-2">
                {pagination.totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pagination.page <= 1 || loading}
                      onClick={() => fetchJournals(pagination.page - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <HiOutlineChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-1 font-bold text-slate-700">
                      {pagination.page} / {pagination.totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={pagination.page >= pagination.totalPages || loading}
                      onClick={() => fetchJournals(pagination.page + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <HiOutlineChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting || pagination.total === 0}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40"
                >
                  {exporting ? "Menyiapkan..." : "Unduh Excel"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
