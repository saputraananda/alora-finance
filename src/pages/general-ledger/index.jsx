import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HiOutlineDocumentText,
  HiOutlineCalendarDays,
  HiOutlinePrinter,
  HiOutlineArrowPath,
  HiOutlineExclamationTriangle,
  HiOutlineBuildingLibrary,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineScale,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import { currentCutoffKey, cutoffRangeForKey } from "../../lib/cutoff";
import DetailJurnalModal from "../../components/DetailJurnalModal";
import PageHeader, { FieldDateRange, FieldSelect, PrimaryButton, RefreshButton } from "../../components/ui/PageHeader";

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

// Rentang bawaan = periode cutoff berjalan (26 bulan lalu – 25 bulan ini)
function getDefaultDateRange() {
  const { from, to } = cutoffRangeForKey(currentCutoffKey());
  return { firstDay: from, lastDay: to };
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
  const [outlets, setOutlets] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(qAccId || "");
  // from / to / outlet bisa datang dari tautan Laporan keuangan (penelusuran)
  const [fromDate, setFromDate] = useState(searchParams.get("from") || firstDay);
  const [toDate, setToDate] = useState(searchParams.get("to") || lastDay);
  const [outletFilter, setOutletFilter] = useState(searchParams.get("outlet") || "");

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
      if (outletFilter) qs.set("outlet", outletFilter);

      const res = await api(`/finance-ho/general-ledger?${qs.toString()}`);
      setLedgerData(res.data);
    } catch (err) {
      console.error("Gagal load buku besar:", err);
      setError(err.message || "Gagal memuat data buku besar.");
      setLedgerData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, fromDate, toDate, outletFilter]);

  // Daftar cabang untuk filter
  useEffect(() => {
    api("/finance-ho/journals/meta")
      .then((res) => setOutlets(res.outlets || []))
      .catch(() => {});
  }, []);

  // Otomatis fetch saat akun pertama kali dipilih
  useEffect(() => {
    if (selectedAccountId) {
      fetchLedger();
    }
  }, [selectedAccountId, fetchLedger]);

  // Akun yang sedang aktif terpilih
  const currentAccount = useMemo(() => {
    if (selectedAccountId === "ALL") return null;
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

      <main className="min-h-screen bg-slate-50 py-4 sm:py-6 print:bg-white print:py-0">
        <div className="px-4 sm:px-6 space-y-5 print:px-0">
          <PageHeader crumb="General Ledger" icon={HiOutlineDocumentText} tone="bg-teal-50 text-teal-700" title="Buku Besar" subtitle="Histori mutasi debit, kredit, dan saldo kumulatif per akun finansial">
            <FieldSelect label="Cabang" value={outletFilter} onChange={setOutletFilter}>
              <option value="">Semua</option>
              <option value="PUSAT">Pusat</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </FieldSelect>
            <FieldSelect label="Akun" value={selectedAccountId} onChange={setSelectedAccountId} selectClassName="max-w-[280px]">
              <option value="">-- Pilih akun --</option>
              <option value="ALL">Semua akun</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.code} - {acc.name} ({acc.type})</option>
              ))}
            </FieldSelect>
            <FieldDateRange from={fromDate} to={toDate} onChange={(f, t) => { setFromDate(f); setToDate(t); }} />
            <PrimaryButton onClick={handlePrint} disabled={!ledgerData || loading} icon={HiOutlinePrinter}>Cetak</PrimaryButton>
            <RefreshButton onClick={fetchLedger} spinning={loading} />
          </PageHeader>

          {(currentAccount || ledgerData?.all) && (
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {currentAccount && (
                <>
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold", TYPE_CONFIG[currentAccount.type]?.color || "bg-slate-100 text-slate-700")}>{currentAccount.type}</span>
                  <span className="text-xs font-semibold text-slate-500">Saldo normal: <strong>{currentAccount.normal_balance}</strong></span>
                </>
              )}
              <button type="button" onClick={() => { setFromDate(firstDay); setToDate(lastDay); }} className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">Periode cutoff berjalan</button>
            </div>
          )}

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
                BUKU BESAR: {ledgerData.all ? "Semua akun" : `${ledgerData.account.code} - ${ledgerData.account.name}`}
              </h2>
              <p className="text-xs text-slate-600">
                Periode: {formatDate(ledgerData.period.from)} s/d {formatDate(ledgerData.period.to)}{!ledgerData.all && ` | Kategori: ${ledgerData.account.type} | Saldo Normal: ${ledgerData.account.normal_balance}`}
              </p>
            </div>
          )}

          {/* KPI Summary Cards */}
          {ledgerData?.truncated && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 print:hidden">
              Hanya 2.000 baris pertama yang ditampilkan. Persempit tanggal atau pilih cabang agar semua mutasi terlihat.
            </div>
          )}
          {ledgerData && !loading && !ledgerData.all && (
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
                    {ledgerData?.all && <th className="py-3 px-4 min-w-[180px]">Akun</th>}
                    <th className="py-3 px-4 min-w-[240px]">Keterangan Transaksi</th>
                    <th className="py-3 px-4 min-w-[140px]">Memo</th>
                    <th className="py-3 px-4 w-36 text-right">Debit (Rp)</th>
                    <th className="py-3 px-4 w-36 text-right">Kredit (Rp)</th>
                    <th className="py-3 px-4 w-40 text-right">Saldo Berjalan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={ledgerData?.all ? 9 : 8} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <HiOutlineArrowPath className="h-6 w-6 animate-spin text-emerald-600" />
                          <span>Menghitung buku besar dan saldo kumulatif...</span>
                        </div>
                      </td>
                    </tr>
                  ) : !ledgerData ? (
                    <tr>
                      <td colSpan={ledgerData?.all ? 9 : 8} className="py-12 text-center text-slate-400">
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
                        {ledgerData.all && <td />}
                        <td className="py-2.5 px-4 text-slate-800">
                          Saldo Awal Periode
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">-</td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-400">-</td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-400">-</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800">
                          {ledgerData.all ? "-" : formatRupiah(ledgerData.summary.beginning_balance)}
                        </td>
                      </tr>

                      {/* Baris Mutasi Berjalan */}
                      {ledgerData.mutations.length === 0 ? (
                        <tr>
                          <td colSpan={ledgerData?.all ? 9 : 8} className="py-8 text-center text-slate-400">
                            Tidak ada transaksi mutasi pada rentang tanggal ini.
                          </td>
                        </tr>
                      ) : (
                        ledgerData.mutations.map((m, idx) => (
                          <tr key={m.line_id || idx} onClick={() => setDetailModalId(m.entry_id)} title="Klik untuk melihat detail jurnal" className="cursor-pointer hover:bg-emerald-50/50 transition">
                            <td className="py-2.5 px-4 text-center text-slate-400 font-bold">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 font-mono">
                              {formatDate(m.entry_date)}
                            </td>
                            <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                              <span className="text-emerald-700">{m.entry_no}</span>
                            </td>
                            {ledgerData.all && <td className="py-2.5 px-4 text-slate-700"><span className="font-mono font-bold">{m.account_code}</span> {m.account_name}</td>}
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
                              {m.running_balance == null ? "-" : formatRupiah(m.running_balance)}
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
                      <td colSpan={ledgerData.all ? 6 : 5} className="py-3 px-4 text-right">
                        {ledgerData.all ? "Total Mutasi Periode:" : "Total Mutasi Periode & Saldo Akhir:"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700">
                        {formatRupiah(ledgerData.summary.period_debit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-blue-700">
                        {formatRupiah(ledgerData.summary.period_credit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-800 text-sm">
                        {ledgerData.all ? "-" : formatRupiah(ledgerData.summary.ending_balance)}
                      </td>
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

