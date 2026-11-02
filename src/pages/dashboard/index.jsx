import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  HiOutlineChartBar,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineScale,
  HiOutlineCalculator,
  HiOutlineBuildingLibrary,
  HiOutlineCalendarDays,
  HiOutlineArrowPath,
  HiOutlineArrowRight,
  HiOutlineEye,
  HiOutlineExclamationTriangle,
  HiOutlineCheckCircle,
  HiOutlineSparkles,
  HiOutlineBookOpen,
  HiOutlineNumberedList,
  HiOutlineDocumentText,
  HiOutlineWallet,
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

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export default function DashboardFinance() {
  const navigate = useNavigate();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailModalId, setDetailModalId] = useState(null);

  // Fetch Dashboard Data
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api(
        `/finance-ho/dashboard?year=${selectedYear}&month=${selectedMonth}`
      );
      setDashboardData(res.data);
    } catch (err) {
      console.error("[DashboardFinance] Error loading:", err);
      setError(
        err.message || "Gagal memuat data dashboard keuangan. Silakan periksa koneksi."
      );
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const kpis = dashboardData?.kpis || {
    revenue: 0,
    expense: 0,
    net_profit: 0,
    net_margin: 0,
    total_budget: 0,
    budget_used_percent: 0,
    budget_remaining: 0,
    cash_and_bank: 0,
  };

  const monthlyTrends = dashboardData?.monthly_trends || [];
  const topExpenses = dashboardData?.top_expenses || [];
  const recentJournals = dashboardData?.recent_journals || [];

  // Hitung max value untuk skala Bar Chart Tren 6 Bulan
  const maxTrendVal = useMemo(() => {
    let max = 1;
    monthlyTrends.forEach((m) => {
      if (m.revenue > max) max = m.revenue;
      if (m.expense > max) max = m.expense;
      if (Math.abs(m.net_profit) > max) max = Math.abs(m.net_profit);
    });
    return max;
  }, [monthlyTrends]);

  const isNetProfitPositive = kpis.net_profit >= 0;

  // Realisasi Budget Styling
  const budgetPercent = kpis.budget_used_percent || 0;
  let budgetColor = "bg-emerald-500";
  let budgetBadgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
  let budgetStatusText = "Aman";

  if (kpis.total_budget > 0) {
    if (budgetPercent > 100) {
      budgetColor = "bg-rose-500";
      budgetBadgeColor = "bg-rose-50 text-rose-700 border-rose-200";
      budgetStatusText = "Overbudget";
    } else if (budgetPercent >= 80) {
      budgetColor = "bg-amber-500";
      budgetBadgeColor = "bg-amber-50 text-amber-700 border-amber-200";
      budgetStatusText = "Mendekati Limit";
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      {/* ── Top Header Banner & Periode Controls ─────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-r from-[#059669] to-[#6EE7B7] p-6 shadow-sm mb-6">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-teal-200/25 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 border border-white/30 text-white shadow-inner backdrop-blur-xs">
              <HiOutlineChartBar className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white sm:text-2xl drop-shadow-xs">
                Dashboard Keuangan HO
              </h1>
              <p className="text-xs sm:text-sm text-emerald-50 mt-0.5 font-medium drop-shadow-xs">
                Ringkasan eksekutif pendapatan, beban operasional, dan realisasi anggaran
              </p>
            </div>
          </div>

          {/* Periode Selector & Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Bulan */}
            <div className="flex items-center gap-1.5 rounded-xl border border-white/40 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur-xs">
              <HiOutlineCalendarDays className="h-4 w-4 text-emerald-700 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-xs sm:text-sm font-bold text-slate-800 outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((mName, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {mName}
                  </option>
                ))}
              </select>
            </div>

            {/* Tahun */}
            <div className="rounded-xl border border-white/40 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur-xs">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-xs sm:text-sm font-bold text-slate-800 outline-none cursor-pointer"
              >
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(
                  (yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Tombol Refresh */}
            <button
              type="button"
              onClick={fetchDashboard}
              disabled={loading}
              title="Refresh data"
              className="flex items-center justify-center rounded-xl border border-white/40 bg-white/95 p-2 text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-50"
            >
              <HiOutlineArrowPath
                className={cn("h-4 w-4", loading && "animate-spin text-emerald-600")}
              />
            </button>

            {/* Quick Catat Jurnal Button */}
            <Link
              to="/finance-ho/jurnal-umum"
              className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-emerald-800 shadow-md shadow-emerald-950/10 transition hover:bg-emerald-50"
            >
              <HiOutlineBookOpen className="h-4 w-4" />
              <span>Jurnal Umum</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-rose-800">
          <HiOutlineExclamationTriangle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Terjadi Kendala</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchDashboard}
            className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 transition"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* ── 1. Top Executive KPI Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* Card 1: Total Pendapatan */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Pendapatan
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <HiOutlineArrowTrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {loading ? (
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
              ) : (
                formatRupiah(kpis.revenue)
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Periode {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Beban Operasional */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Beban
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <HiOutlineArrowTrendingDown className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {loading ? (
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
              ) : (
                formatRupiah(kpis.expense)
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
              <span>Akumulasi beban operasional</span>
            </div>
          </div>
        </div>

        {/* Card 3: Laba / Rugi Bersih */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Laba Bersih
            </span>
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl",
                isNetProfitPositive
                  ? "bg-teal-50 text-teal-600"
                  : "bg-rose-50 text-rose-600"
              )}
            >
              <HiOutlineScale className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div
              className={cn(
                "text-2xl font-bold tracking-tight",
                isNetProfitPositive ? "text-emerald-700" : "text-rose-600"
              )}
            >
              {loading ? (
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
              ) : (
                <>
                  {isNetProfitPositive ? "+" : "-"}
                  {formatRupiah(Math.abs(kpis.net_profit))}
                </>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold border",
                  isNetProfitPositive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                )}
              >
                {isNetProfitPositive ? "Laba" : "Rugi"} ({kpis.net_margin}%)
              </span>
              <span className="text-xs text-slate-400">Margin laba</span>
            </div>
          </div>
        </div>

        {/* Card 4: Realisasi Anggaran Beban */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Penyerapan Anggaran
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <HiOutlineCalculator className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {loading ? (
                  <div className="h-8 w-24 animate-pulse rounded bg-slate-200" />
                ) : kpis.total_budget > 0 ? (
                  `${budgetPercent}%`
                ) : (
                  <span className="text-base font-medium text-slate-400">
                    Belum Diatur
                  </span>
                )}
              </div>
              {kpis.total_budget > 0 && (
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-bold border uppercase tracking-wider",
                    budgetBadgeColor
                  )}
                >
                  {budgetStatusText}
                </span>
              )}
            </div>

            {/* Progress bar */}
            {kpis.total_budget > 0 ? (
              <div className="mt-2.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn("h-full transition-all duration-500", budgetColor)}
                    style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
                  <span>Realisasi: {formatRupiah(kpis.expense)}</span>
                  <span>Budget: {formatRupiah(kpis.total_budget)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                Tidak ada data anggaran beban untuk bulan ini
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Summary Pill: Saldo Kas & Bank */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
            <HiOutlineWallet className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Posisi Kas & Bank Perusahaan
            </div>
            <div className="text-lg font-bold text-slate-900">
              {loading ? (
                <span className="text-sm font-normal text-slate-400">Memuat saldo...</span>
              ) : (
                formatRupiah(kpis.cash_and_bank)
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/finance-ho/anggaran-beban"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <HiOutlineCalculator className="h-3.5 w-3.5 text-slate-500" />
            <span>Anggaran Beban</span>
          </Link>
          <Link
            to="/finance-ho/buku-besar"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <HiOutlineDocumentText className="h-3.5 w-3.5 text-slate-500" />
            <span>General Ledger</span>
          </Link>
          <Link
            to="/finance-ho/coa"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <HiOutlineNumberedList className="h-3.5 w-3.5 text-slate-500" />
            <span>Master COA</span>
          </Link>
        </div>
      </div>

      {/* ── 2. Middle Section: Tren 6 Bulan & Top Beban ──────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 mb-6">
        {/* Kolom Kiri: Tren 6 Bulan (7 Kolom Desktop) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Tren Performa Keuangan (6 Bulan)
                </h2>
                <p className="text-xs text-slate-500">
                  Komparasi bulanan antara pendapatan dan beban operasional
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                  <span className="text-slate-600">Pendapatan</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" />
                  <span className="text-slate-600">Beban</span>
                </div>
              </div>
            </div>

            {/* Visual Bar Comparison Chart */}
            <div className="mt-6 pt-2">
              {loading ? (
                <div className="flex h-56 items-center justify-center text-xs text-slate-400">
                  Memuat visualisasi tren...
                </div>
              ) : monthlyTrends.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-xs text-slate-400">
                  Belum ada data transaksi jurnal dalam 6 bulan terakhir.
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-56 pt-8 pb-2 border-b border-slate-100">
                  {monthlyTrends.map((item, idx) => {
                    const revHeight = maxTrendVal > 0 ? (item.revenue / maxTrendVal) * 100 : 0;
                    const expHeight = maxTrendVal > 0 ? (item.expense / maxTrendVal) * 100 : 0;
                    const isSelected = item.ym === `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "group relative flex flex-col items-center justify-end h-full rounded-xl p-1 transition",
                          isSelected && "bg-emerald-50/60 ring-1 ring-emerald-200"
                        )}
                      >
                        {/* Tooltip on hover */}
                        <div className="pointer-events-none absolute -top-12 z-20 hidden flex-col items-center rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white shadow-lg group-hover:flex whitespace-nowrap">
                          <span>Rev: {formatRupiah(item.revenue)}</span>
                          <span>Beban: {formatRupiah(item.expense)}</span>
                          <span
                            className={cn(
                              "font-bold",
                              item.net_profit >= 0 ? "text-emerald-300" : "text-rose-300"
                            )}
                          >
                            Laba: {formatRupiah(item.net_profit)}
                          </span>
                        </div>

                        {/* Bars container */}
                        <div className="flex items-end gap-1 sm:gap-2 w-full justify-center h-full">
                          {/* Pendapatan bar */}
                          <div
                            className="w-3 sm:w-4 bg-emerald-500 rounded-t-md transition-all duration-300 group-hover:bg-emerald-600"
                            style={{ height: `${Math.max(revHeight, 4)}%` }}
                            title={`Pendapatan: ${formatRupiah(item.revenue)}`}
                          />
                          {/* Beban bar */}
                          <div
                            className="w-3 sm:w-4 bg-rose-400 rounded-t-md transition-all duration-300 group-hover:bg-rose-500"
                            style={{ height: `${Math.max(expHeight, 4)}%` }}
                            title={`Beban: ${formatRupiah(item.expense)}`}
                          />
                        </div>

                        {/* Month Label */}
                        <span
                          className={cn(
                            "mt-2 text-[10px] sm:text-xs font-semibold text-center truncate w-full",
                            isSelected ? "text-emerald-700" : "text-slate-500"
                          )}
                        >
                          {item.label.split(" ")[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-50">
            <span>* Diambil dari total transaksi jurnal berstatus POSTED.</span>
            <span className="font-medium text-emerald-600">
              Periode Aktif: {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </span>
          </div>
        </div>

        {/* Kolom Kanan: Komposisi Beban Terbesar (5 Kolom Desktop) */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
          <div>
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900">
                Komposisi Beban Terbesar
              </h2>
              <p className="text-xs text-slate-500">
                Top akun beban operasional pada bulan {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </p>
            </div>

            {/* List Akun Beban */}
            <div className="mt-4 space-y-3.5">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Memuat data rincian beban...
                </div>
              ) : topExpenses.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Belum ada pengeluaran beban tercatat pada bulan ini.
                </div>
              ) : (
                topExpenses.map((exp, idx) => (
                  <div key={exp.account_id || idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <span className="font-mono text-[11px] text-slate-400 shrink-0">
                          {exp.account_code}
                        </span>
                        <span className="font-semibold text-slate-800 truncate" title={exp.account_name}>
                          {exp.account_name}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-slate-900">
                          {formatRupiah(exp.actual_amount)}
                        </span>
                        <span className="ml-1.5 text-[11px] font-medium text-slate-400">
                          ({exp.percent_of_total}%)
                        </span>
                      </div>
                    </div>

                    {/* Bar Proporsi */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          idx === 0
                            ? "bg-rose-500"
                            : idx === 1
                            ? "bg-amber-500"
                            : "bg-slate-400"
                        )}
                        style={{ width: `${Math.min(exp.percent_of_total, 100)}%` }}
                      />
                    </div>

                    {/* Info Anggaran jika ada */}
                    {exp.budget_amount > 0 && (
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Budget: {formatRupiah(exp.budget_amount)}</span>
                        <span
                          className={cn(
                            "font-semibold",
                            exp.percent_of_budget > 100 ? "text-rose-600" : "text-emerald-600"
                          )}
                        >
                          {exp.percent_of_budget}% dari budget
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <Link
              to="/finance-ho/buku-besar"
              className="flex items-center justify-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
            >
              <span>Periksa Rincian Mutasi di Buku Besar</span>
              <HiOutlineArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── 3. Bottom Section: Transaksi Jurnal Terkini ──────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Transaksi Jurnal Terkini
            </h2>
            <p className="text-xs text-slate-500">
              5 catatan jurnal umum terakhir yang telah dibukukan (POSTED)
            </p>
          </div>

          <Link
            to="/finance-ho/jurnal-umum"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
          >
            <span>Buka Semua Jurnal Umum</span>
            <HiOutlineArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Tabel Jurnal */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-3">No. Jurnal</th>
                <th className="py-2.5 px-3">Tanggal</th>
                <th className="py-2.5 px-3">Keterangan</th>
                <th className="py-2.5 px-3 text-center">Baris</th>
                <th className="py-2.5 px-3 text-right">Total Transaksi</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Memuat daftar jurnal...
                  </td>
                </tr>
              ) : recentJournals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Belum ada jurnal transaksi yang tercatat.
                  </td>
                </tr>
              ) : (
                recentJournals.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-3 font-mono font-semibold text-slate-800">
                      {j.entry_no}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {formatDate(j.entry_date)}
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate text-slate-700" title={j.description}>
                      {j.description}
                    </td>
                    <td className="py-3 px-3 text-center font-medium text-slate-500">
                      {j.total_lines}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">
                      {formatRupiah(j.total_amount)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                        <HiOutlineCheckCircle className="h-3 w-3" />
                        <span>POSTED</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setDetailModalId(j.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-xs hover:bg-slate-100 hover:text-slate-900 transition"
                      >
                        <HiOutlineEye className="h-3.5 w-3.5 text-slate-400" />
                        <span>Detail</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Detail Jurnal ────────────────────────────────────────── */}
      {detailModalId && (
        <DetailJurnalModal
          open={Boolean(detailModalId)}
          journalId={detailModalId}
          onClose={() => setDetailModalId(null)}
          onReversed={() => {
            setDetailModalId(null);
            fetchDashboard();
          }}
        />
      )}
    </div>
  );
}
