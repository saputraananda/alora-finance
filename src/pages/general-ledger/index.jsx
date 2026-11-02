import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HiOutlineDocumentText,
  HiOutlineCalendarDays,
  HiOutlinePrinter,
  HiOutlineArrowPath,
  HiOutlineEye,
  HiOutlineExclamationTriangle,
  HiOutlineBuildingLibrary,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineScale,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import DetailJurnalModal from "../../components/DetailJurnalModal";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

function getDefaultDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).toISOString().split("T")[0];
  const lastDay = new Date(year, month + 1, 0).toISOString().split("T")[0];
  return { firstDay, lastDay };
}

const TYPE_CONFIG = {
  ASET: { label: "Aset", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  KEWAJIBAN: { label: "Kewajiban", color: "bg-rose-50 text-rose-700 border-rose-200" },
  EKUITAS: { label: "Ekuitas", color: "bg-purple-50 text-purple-700 border-purple-200" },
  PENDAPATAN: { label: "Pendapatan", color: "bg-blue-50 text-blue-700 border-blue-200" },
  BEBAN: { label: "Beban", color: "bg-amber-50 text-amber-700 border-amber-200" },
};

export default function BukuBesar() {
  const [searchParams] = useSearchParams();
  const qAccId = searchParams.get("account_id");
  const { firstDay, lastDay } = getDefaultDateRange();

  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(qAccId || "");
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);

  const [ledgerData, setLedgerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [detailModalId, setDetailModalId] = useState(null);

  // 1. Load daftar akun untuk filter dropdown
  useEffect(() => {
    let mounted = true;
    api("/finance-ho/accounts/select")
      .then((res) => {
        if (mounted) {
          const accs = res.data || [];
          setAccounts(accs);
          if (qAccId && accs.some((a) => String(a.id) === String(qAccId))) {
            setSelectedAccountId(String(qAccId));
          } else if (accs.length > 0 && !selectedAccountId) {
            setSelectedAccountId(String(accs[0].id));
          }
        }
      })
      .catch((err) => {
        console.error("Gagal load akun:", err);
      });

    return () => {
      mounted = false;
    };
  }, [qAccId]);

  // 2. Fetch Buku Besar
  const fetchLedger = useCallback(async () => {
    if (!selectedAccountId) return;

    setLoading(true);
    setError("");

    try {
      const qs = new URLSearchParams({
        account_id: String(selectedAccountId),
        from: fromDate,
        to: toDate,
      });

      const res = await api(`/finance-ho/general-ledger?${qs.toString()}`);
      setLedgerData(res.data);
    } catch (err) {
      console.error("Gagal load buku besar:", err);
      setError(err.message || "Gagal memuat data buku besar.");
      setLedgerData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, fromDate, toDate]);

  // Otomatis fetch saat akun pertama kali dipilih
  useEffect(() => {
    if (selectedAccountId) {
      fetchLedger();
    }
  }, [selectedAccountId, fetchLedger]);

  // Akun yang sedang aktif terpilih
  const currentAccount = useMemo(() => {
    return accounts.find((a) => String(a.id) === String(selectedAccountId)) || ledgerData?.account;
  }, [accounts, selectedAccountId, ledgerData]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Modal Detail Jurnal jika diklik dari baris */}
      <DetailJurnalModal
        open={Boolean(detailModalId)}
        journalId={detailModalId}
        onClose={() => setDetailModalId(null)}
        onReversed={() => {
          fetchLedger();
        }}
      />

      <main className="min-h-screen bg-slate-50 py-6 sm:py-8 print:bg-white print:py-0">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 space-y-6 print:px-0">
          {/* Header Banner */}
          <section className="relative overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-r from-[#059669] to-[#6EE7B7] p-6 shadow-sm print:hidden">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl pointer-events-none" />
            <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-teal-200/25 blur-3xl pointer-events-none" />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 border border-white/30 text-white shadow-inner backdrop-blur-xs">
                  <HiOutlineDocumentText className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white sm:text-2xl drop-shadow-xs">
                    General Ledger
                  </h1>
                  <p className="text-xs sm:text-sm text-emerald-50 mt-0.5 font-medium drop-shadow-xs">
                    Histori mutasi debit, kredit, dan saldo kumulatif per akun finansial
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={!ledgerData || loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 px-4 py-2.5 text-xs font-bold transition shadow-md shadow-emerald-950/10 disabled:opacity-50 shrink-0"
                >
                  <HiOutlinePrinter className="h-4 w-4" />
                  Cetak / Print
                </button>
              </div>
            </div>
          </section>

          {/* Filter Card */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4 print:hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Dropdown Akun */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Pilih Akun Finansial <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">-- Pilih Akun Finansial --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name} ({acc.type} • Normal {acc.normal_balance})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tanggal Dari */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Dari Tanggal
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Tanggal Sampai */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                {currentAccount && (
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
                        TYPE_CONFIG[currentAccount.type]?.color || "bg-slate-100 text-slate-700"
                      )}
                    >
                      {currentAccount.type}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      Saldo Normal: <strong>{currentAccount.normal_balance}</strong>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFromDate(firstDay);
                    setToDate(lastDay);
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition"
                >
                  Bulan Berjalan
                </button>
                <button
                  type="button"
                  onClick={fetchLedger}
                  disabled={loading || !selectedAccountId}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
                >
                  {loading && <HiOutlineArrowPath className="h-3.5 w-3.5 animate-spin" />}
                  Terapkan
                </button>
              </div>
            </div>
          </section>

          {/* Error Message */}
          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center gap-2.5">
              <HiOutlineExclamationTriangle className="h-5 w-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Info Header saat Print */}
          {ledgerData && (
            <div className="hidden print:block mb-4 border-b pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                BUKU BESAR: {ledgerData.account.code} - {ledgerData.account.name}
              </h2>
              <p className="text-xs text-slate-600">
                Periode: {formatDate(ledgerData.period.from)} s/d {formatDate(ledgerData.period.to)} | Kategori: {ledgerData.account.type} | Saldo Normal: {ledgerData.account.normal_balance}
              </p>
            </div>
          )}

          {/* KPI Summary Cards */}
          {ledgerData && !loading && (
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Saldo Awal */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Saldo Awal
                  </span>
                  <HiOutlineScale className="h-4 w-4 text-slate-400" />
                </div>
                <div className="font-mono text-base sm:text-lg font-bold text-slate-800">
                  {formatRupiah(ledgerData.summary.beginning_balance)}
                </div>
                <div className="text-[11px] text-slate-400">
                  Sebelum {formatDate(ledgerData.period.from)}
                </div>
              </div>

              {/* Total Mutasi Debit */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Total Debit
                  </span>
                  <HiOutlineArrowTrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="font-mono text-base sm:text-lg font-bold text-emerald-700">
                  {formatRupiah(ledgerData.summary.period_debit)}
                </div>
                <div className="text-[11px] text-slate-400">
                  Mutasi debet periode terpilih
                </div>
              </div>

              {/* Total Mutasi Kredit */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    Total Kredit
                  </span>
                  <HiOutlineArrowTrendingDown className="h-4 w-4 text-blue-600" />
                </div>
                <div className="font-mono text-base sm:text-lg font-bold text-blue-700">
                  {formatRupiah(ledgerData.summary.period_credit)}
                </div>
                <div className="text-[11px] text-slate-400">
                  Mutasi kredit periode terpilih
                </div>
              </div>

              {/* Saldo Akhir */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-emerald-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Saldo Akhir
                  </span>
                  <HiOutlineBuildingLibrary className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="font-mono text-base sm:text-lg font-bold text-emerald-800">
                  {formatRupiah(ledgerData.summary.ending_balance)}
                </div>
                <div className="text-[11px] text-emerald-700/80">
                  Posisi saldo berjalan per {formatDate(ledgerData.period.to)}
                </div>
              </div>
            </section>
          )}

          {/* Tabel Mutasi Buku Besar */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 w-28">Tanggal</th>
                    <th className="py-3 px-4 w-36">No. Jurnal</th>
                    <th className="py-3 px-4 min-w-[240px]">Keterangan Transaksi</th>
                    <th className="py-3 px-4 min-w-[140px]">Memo</th>
                    <th className="py-3 px-4 w-36 text-right">Debit (Rp)</th>
                    <th className="py-3 px-4 w-36 text-right">Kredit (Rp)</th>
                    <th className="py-3 px-4 w-40 text-right">Saldo Berjalan</th>
                    <th className="py-3 px-3 w-16 text-center print:hidden">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <HiOutlineArrowPath className="h-6 w-6 animate-spin text-emerald-600" />
                          <span>Menghitung buku besar dan saldo kumulatif...</span>
                        </div>
                      </td>
                    </tr>
                  ) : !ledgerData ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400">
                        Pilih akun finansial untuk menampilkan buku besar.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* Baris Saldo Awal */}
                      <tr className="bg-slate-50/80 font-semibold text-slate-800">
                        <td className="py-2.5 px-4 text-center text-slate-400">•</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {formatDate(ledgerData.period.from)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 font-mono">-</td>
                        <td className="py-2.5 px-4 text-slate-800">
                          Saldo Awal Periode
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">-</td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-400">-</td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-400">-</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800">
                          {formatRupiah(ledgerData.summary.beginning_balance)}
                        </td>
                        <td className="py-2.5 px-3 text-center print:hidden"></td>
                      </tr>

                      {/* Baris Mutasi Berjalan */}
                      {ledgerData.mutations.length === 0 ? (
                        <tr>
                          <td colSpan="9" className="py-8 text-center text-slate-400">
                            Tidak ada transaksi mutasi pada rentang tanggal ini.
                          </td>
                        </tr>
                      ) : (
                        ledgerData.mutations.map((m, idx) => (
                          <tr key={m.line_id || idx} className="hover:bg-slate-50/60 transition">
                            <td className="py-2.5 px-4 text-center text-slate-400 font-bold">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 font-mono">
                              {formatDate(m.entry_date)}
                            </td>
                            <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                              <button
                                type="button"
                                onClick={() => setDetailModalId(m.entry_id)}
                                className="text-emerald-700 hover:text-emerald-800 hover:underline transition"
                                title="Lihat detail jurnal"
                              >
                                {m.entry_no}
                              </button>
                            </td>
                            <td className="py-2.5 px-4 text-slate-800 font-medium">
                              {m.journal_description}
                            </td>
                            <td className="py-2.5 px-4 text-slate-500">
                              {m.memo || "-"}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-800">
                              {m.debit > 0 ? formatRupiah(m.debit) : "-"}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-800">
                              {m.credit > 0 ? formatRupiah(m.credit) : "-"}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                              {formatRupiah(m.running_balance)}
                            </td>
                            <td className="py-2.5 px-3 text-center print:hidden">
                              <button
                                type="button"
                                onClick={() => setDetailModalId(m.entry_id)}
                                className="p-1 rounded-md text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition"
                                title="Lihat Detail Jurnal"
                              >
                                <HiOutlineEye className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </>
                  )}
                </tbody>

                {ledgerData && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-800 text-xs">
                    <tr>
                      <td colSpan="5" className="py-3 px-4 text-right">
                        Total Mutasi Periode & Saldo Akhir:
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700">
                        {formatRupiah(ledgerData.summary.period_debit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-blue-700">
                        {formatRupiah(ledgerData.summary.period_credit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-800 text-sm">
                        {formatRupiah(ledgerData.summary.ending_balance)}
                      </td>
                      <td className="print:hidden"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

