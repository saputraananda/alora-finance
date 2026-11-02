import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  HiOutlineCalculator,
  HiOutlineArrowTrendingDown,
  HiOutlineScale,
  HiOutlineCalendarDays,
  HiOutlineArrowPath,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlineDocumentDuplicate,
  HiOutlineExclamationTriangle,
  HiOutlineCheckCircle,
  HiOutlineXMark,
  HiOutlinePrinter,
  HiOutlineChartBar,
  HiOutlineBookOpen,
} from "react-icons/hi2";
import { api } from "../../lib/api";

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

export default function AnggaranBeban() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [budgetData, setBudgetData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filter & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, OVERBUDGET, WARNING, AMAN, BELUM_DIATUR

  // Modal State
  const [editModalAccount, setEditModalAccount] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  // Copy Modal State
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  // Fetch Budget Data
  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api(
        `/finance-ho/budgets?year=${selectedYear}&month=${selectedMonth}`
      );
      setBudgetData(res.data);
    } catch (err) {
      console.error("[AnggaranBeban] Error loading:", err);
      setError(err.message || "Gagal memuat data anggaran beban.");
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  // Open Edit Modal
  const handleOpenEdit = (item) => {
    setEditModalAccount(item);
    setEditAmount(item.budget_amount ? String(item.budget_amount) : "");
  };

  // Save Single Budget
  const handleSaveBudget = async (e) => {
    e.preventDefault();
    if (!editModalAccount) return;

    setSavingBudget(true);
    setError("");
    try {
      const numeric = parseFloat(editAmount.replace(/[^0-9.]/g, "")) || 0;
      await api("/finance-ho/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: editModalAccount.account_id,
          year: selectedYear,
          month: selectedMonth,
          amount: numeric,
        }),
      });

      setSuccessMsg(
        `Anggaran untuk ${editModalAccount.account_code} - ${editModalAccount.account_name} berhasil diperbarui.`
      );
      setEditModalAccount(null);
      fetchBudgets();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setError(err.message || "Gagal menyimpan anggaran.");
    } finally {
      setSavingBudget(false);
    }
  };

  // Copy From Previous Month
  const handleCopyPrevious = async () => {
    setCopying(true);
    setError("");
    try {
      const res = await api("/finance-ho/budgets/copy-previous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
        }),
      });
      setSuccessMsg(res.message || "Berhasil menyalin anggaran bulan sebelumnya.");
      setCopyModalOpen(false);
      fetchBudgets();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setError(err.message || "Gagal menyalin anggaran bulan sebelumnya.");
    } finally {
      setCopying(false);
    }
  };

  const summary = budgetData?.summary || {
    total_budget: 0,
    total_actual: 0,
    total_variance: 0,
    total_usage_percent: 0,
    overbudget_count: 0,
    total_accounts: 0,
  };

  const allItems = budgetData?.items || [];

  // Filter Items
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Filter status
      if (statusFilter === "OVERBUDGET" && !item.is_overbudget) return false;
      if (statusFilter === "WARNING" && item.status !== "WARNING") return false;
      if (statusFilter === "AMAN" && item.status !== "AMAN") return false;
      if (statusFilter === "BELUM_DIATUR" && item.status !== "BELUM_DIATUR")
        return false;

      // Filter search
      if (search.trim()) {
        const q = search.toLowerCase();
        const code = (item.account_code || "").toLowerCase();
        const name = (item.account_name || "").toLowerCase();
        return code.includes(q) || name.includes(q);
      }

      return true;
    });
  }, [allItems, statusFilter, search]);

  const isTotalOverbudget = summary.total_usage_percent > 100;
  const prevMonthIndex = selectedMonth === 1 ? 11 : selectedMonth - 2;
  const prevMonthName = MONTH_NAMES[prevMonthIndex];
  const prevMonthYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      {/* ── Top Header Banner & Controls ─────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-r from-[#059669] to-[#6EE7B7] p-6 shadow-sm mb-6 print:hidden">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-teal-200/25 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 border border-white/30 text-white shadow-inner backdrop-blur-xs">
              <HiOutlineCalculator className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white sm:text-2xl drop-shadow-xs">
                Anggaran Beban Operasional
              </h1>
              <p className="text-xs sm:text-sm text-emerald-50 mt-0.5 font-medium drop-shadow-xs">
                Pengendalian dan pemantauan realisasi anggaran pengeluaran per akun beban
              </p>
            </div>
          </div>

          {/* Action Controls & Periode Selector */}
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
              onClick={fetchBudgets}
              disabled={loading}
              title="Refresh data"
              className="flex items-center justify-center rounded-xl border border-white/40 bg-white/95 p-2 text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-50"
            >
              <HiOutlineArrowPath
                className={cn("h-4 w-4", loading && "animate-spin text-emerald-600")}
              />
            </button>

            {/* Salin dari Bulan Lalu */}
            <button
              type="button"
              onClick={() => setCopyModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-emerald-800 shadow-md shadow-emerald-950/10 transition hover:bg-emerald-50"
            >
              <HiOutlineDocumentDuplicate className="h-4 w-4 text-emerald-700" />
              <span>Salin Bulan Lalu</span>
            </button>

            {/* Tombol Cetak */}
            <button
              type="button"
              onClick={() => window.print()}
              title="Cetak Ringkasan Anggaran"
              className="flex items-center justify-center rounded-xl border border-white/40 bg-white/95 p-2 text-slate-700 shadow-sm transition hover:bg-white"
            >
              <HiOutlinePrinter className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Success Notification */}
      {successMsg && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            <HiOutlineCheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg("")}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-rose-800">
          <HiOutlineExclamationTriangle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Terjadi Kendala</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchBudgets}
            className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 transition"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* ── 1. Summary Cards (PRD Specification) ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* Card 1: Total Anggaran */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Anggaran
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <HiOutlineCalculator className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {loading ? (
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
              ) : (
                formatRupiah(summary.total_budget)
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Target plafon beban {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </p>
          </div>
        </div>

        {/* Card 2: Total Realisasi Pengeluaran */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Realisasi
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
                formatRupiah(summary.total_actual)
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Total pengeluaran jurnal posted
            </p>
          </div>
        </div>

        {/* Card 3: Selisih Anggaran */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Selisih Anggaran
            </span>
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl",
                summary.total_variance >= 0
                  ? "bg-emerald-50 text-emerald-600"
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
                summary.total_variance >= 0 ? "text-emerald-700" : "text-rose-600"
              )}
            >
              {loading ? (
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
              ) : (
                <>
                  {summary.total_variance >= 0 ? "+" : "-"}
                  {formatRupiah(Math.abs(summary.total_variance))}
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {summary.total_variance >= 0
                ? "Sisa anggaran tersedia"
                : "Defisit melebihi anggaran"}
            </p>
          </div>
        </div>

        {/* Card 4: Realisasi vs Budget (Persen, Bar, dan Teks Realisasi dari Budget) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pemakaian Anggaran
            </span>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold border uppercase tracking-wider",
                isTotalOverbudget
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : summary.total_usage_percent >= 80
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              )}
            >
              {isTotalOverbudget
                ? "Melebihi budget"
                : summary.total_usage_percent >= 80
                ? "Mendekati Limit"
                : "Aman"}
            </span>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {loading ? (
                <div className="h-8 w-24 animate-pulse rounded bg-slate-200" />
              ) : (
                `${summary.total_usage_percent}%`
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-2.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    isTotalOverbudget
                      ? "bg-rose-500"
                      : summary.total_usage_percent >= 80
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  )}
                  style={{
                    width: `${Math.min(summary.total_usage_percent, 100)}%`,
                  }}
                />
              </div>
              {/* Teks Spesifikasi PRD: "Rp realisasi dari Rp budget" */}
              <p className="mt-1.5 truncate text-[11px] text-slate-500">
                {formatRupiah(summary.total_actual)} dari{" "}
                {formatRupiah(summary.total_budget)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Filter & Search Bar ───────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode atau nama akun beban..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-1.5 text-xs text-slate-700 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Filter Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: "ALL", label: `Semua (${allItems.length})` },
            {
              id: "OVERBUDGET",
              label: `Melebihi Budget (${summary.overbudget_count})`,
              color: "text-rose-700 bg-rose-50 border-rose-200",
            },
            { id: "WARNING", label: "Mendekati Limit (≥80%)" },
            { id: "AMAN", label: "Aman" },
            { id: "BELUM_DIATUR", label: "Belum Diatur" },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setStatusFilter(pill.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition border",
                statusFilter === pill.id
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3. Tabel Anggaran vs Realisasi (PRD Specification) ────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Kode & Nama Akun</th>
                <th className="py-3 px-4 text-right">Anggaran (Budget)</th>
                <th className="py-3 px-4 text-right">Realisasi</th>
                <th className="py-3 px-4 text-right">Selisih</th>
                <th className="py-3 px-4 text-center w-36">Pemakaian</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center print:hidden">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <HiOutlineArrowPath className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
                    <span>Memuat data anggaran beban...</span>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <HiOutlineCalculator className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">
                      Tidak ada akun beban yang sesuai kriteria
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Coba ubah kata kunci pencarian atau filter status
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isOver = item.is_overbudget;
                  const isWarn = item.status === "WARNING";
                  const isPositiveVariance = item.variance >= 0;

                  return (
                    <tr
                      key={item.account_id}
                      className={cn(
                        "transition hover:bg-slate-50/70",
                        isOver && "bg-rose-50/30"
                      )}
                    >
                      {/* Akun */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            {item.account_code}
                          </span>
                          <span className="font-bold text-slate-800">
                            {item.account_name}
                          </span>
                        </div>
                      </td>

                      {/* Anggaran */}
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-800">
                        {item.budget_amount > 0 ? (
                          formatRupiah(item.budget_amount)
                        ) : (
                          <span className="text-slate-400 font-normal italic">
                            Belum diatur
                          </span>
                        )}
                      </td>

                      {/* Realisasi */}
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatRupiah(item.actual_amount)}
                      </td>

                      {/* Selisih (PRD: Diawali + bila di bawah budget dan - bila melebihi) */}
                      <td
                        className={cn(
                          "py-3.5 px-4 text-right font-semibold",
                          isPositiveVariance ? "text-emerald-700" : "text-rose-600 font-bold"
                        )}
                      >
                        {isPositiveVariance ? "+" : "-"}
                        {formatRupiah(Math.abs(item.variance))}
                      </td>

                      {/* Pemakaian (Bar dan Persen) */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={cn(
                              "font-bold text-xs",
                              isOver
                                ? "text-rose-600"
                                : isWarn
                                ? "text-amber-600"
                                : "text-slate-700"
                            )}
                          >
                            {item.usage_percent}%
                          </span>
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-300",
                                isOver
                                  ? "bg-rose-500"
                                  : isWarn
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              )}
                              style={{
                                width: `${Math.min(item.usage_percent, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status (PRD: Akun di atas 100% diberi label teks 'Melebihi budget') */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isOver ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                            <HiOutlineExclamationTriangle className="h-3 w-3 text-rose-500" />
                            <span>Melebihi budget</span>
                          </span>
                        ) : isWarn ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            <span>Mendekati Limit</span>
                          </span>
                        ) : item.status === "AMAN" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                            <HiOutlineCheckCircle className="h-3 w-3 text-emerald-500" />
                            <span>Aman</span>
                          </span>
                        ) : item.status === "TANPA_ANGGARAN" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-[10px] font-semibold text-orange-700 border border-orange-200">
                            <span>Tanpa Anggaran</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-500">
                            Belum Diatur
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 text-center print:hidden">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-xs transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <HiOutlinePencilSquare className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-600" />
                          <span>Atur</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* ── Baris Total (PRD Specification: Ada baris total) ─────────── */}
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100/80 font-bold text-slate-900 text-xs">
                  <td className="py-4 px-4 text-slate-800 uppercase tracking-wider">
                    Total Anggaran Beban ({filteredItems.length} Akun)
                  </td>
                  <td className="py-4 px-4 text-right font-extrabold text-slate-900">
                    {formatRupiah(summary.total_budget)}
                  </td>
                  <td className="py-4 px-4 text-right font-extrabold text-slate-900">
                    {formatRupiah(summary.total_actual)}
                  </td>
                  <td
                    className={cn(
                      "py-4 px-4 text-right font-extrabold",
                      summary.total_variance >= 0
                        ? "text-emerald-700"
                        : "text-rose-600"
                    )}
                  >
                    {summary.total_variance >= 0 ? "+" : "-"}
                    {formatRupiah(Math.abs(summary.total_variance))}
                  </td>
                  <td className="py-4 px-4 text-center font-extrabold">
                    <span
                      className={cn(
                        isTotalOverbudget ? "text-rose-600" : "text-slate-900"
                      )}
                    >
                      {summary.total_usage_percent}%
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[10px] font-bold border uppercase tracking-wider",
                        isTotalOverbudget
                          ? "bg-rose-100 text-rose-800 border-rose-300"
                          : "bg-emerald-100 text-emerald-800 border-emerald-300"
                      )}
                    >
                      {isTotalOverbudget ? "Melebihi budget" : "Aman"}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center print:hidden"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Modal Input / Edit Anggaran ─────────────────────────────────── */}
      {editModalAccount && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setEditModalAccount(null)}
          />
          <div
            className="relative w-full max-w-md overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl animate-[fadeIn_0.2s_ease-out]"
            style={{ maxHeight: "92vh" }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <HiOutlinePencilSquare className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Atur Anggaran Akun
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditModalAccount(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <HiOutlineXMark className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="mt-4 space-y-4">
              {/* Info Akun */}
              <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Akun:</span>
                  <span className="font-semibold text-slate-800">
                    {editModalAccount.account_code} - {editModalAccount.account_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Periode:</span>
                  <span className="font-semibold text-slate-800">
                    {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Realisasi Saat Ini:</span>
                  <span className="font-bold text-slate-900">
                    {formatRupiah(editModalAccount.actual_amount)}
                  </span>
                </div>
              </div>

              {/* Input Nominal Anggaran */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nominal Anggaran (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Masukkan target batas maksimal pengeluaran bulan ini.
                </p>
              </div>

              {/* Presets Cepat */}
              <div>
                <span className="text-[11px] font-medium text-slate-500 block mb-1.5">
                  Pilihan Cepat:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[1000000, 2500000, 5000000, 10000000, 25000000].map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setEditAmount(String(preset))}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition"
                      >
                        {formatRupiah(preset)}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalAccount(null)}
                  disabled={savingBudget}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingBudget}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {savingBudget ? "Menyimpan..." : "Simpan Anggaran"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal Konfirmasi Salin dari Bulan Lalu ──────────────────────── */}
      {copyModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => !copying && setCopyModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <HiOutlineDocumentDuplicate className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Salin Anggaran Bulan Lalu
                </h3>
                <p className="text-xs text-slate-500">
                  Duplikasi alokasi anggaran beban dari periode sebelumnya
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-800 space-y-1.5">
              <p className="font-semibold">Konfirmasi Duplikasi Anggaran:</p>
              <p>
                Sistem akan menyalin semua pos anggaran dari bulan{" "}
                <span className="font-bold underline">
                  {prevMonthName} {prevMonthYear}
                </span>{" "}
                ke bulan{" "}
                <span className="font-bold underline">
                  {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                </span>
                .
              </p>
              <p className="text-[11px] text-amber-700">
                * Anggaran yang telah Anda atur untuk bulan ini akan ditimpa dengan nilai dari bulan sebelumnya jika akunnya sama.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCopyModalOpen(false)}
                disabled={copying}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCopyPrevious}
                disabled={copying}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {copying ? "Menyalin..." : "Ya, Salin Anggaran"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

