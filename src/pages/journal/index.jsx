import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  HiOutlineBookOpen,
  HiOutlinePlus,
  HiOutlineMagnifyingGlass,
  HiOutlineEye,
  HiOutlineCheckCircle,
  HiOutlineArrowPath,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineCalendarDays,
  HiOutlineXMark,
  HiOutlineTrash,
  HiOutlineExclamationTriangle,
  HiOutlineClock,
  HiOutlineSparkles,
  HiOutlineDocumentText,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import ModalFormAkun from "../../components/ModalFormAkun";
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

function formatNumber(num) {
  if (num === "" || num === null || num === undefined) return "";
  const n = String(num).replace(/\D/g, "");
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseNumber(str) {
  if (!str) return 0;
  const clean = String(str).replace(/\./g, "").replace(/,/g, ".");
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function getDefaultDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).toISOString().split("T")[0];
  const lastDay = new Date(year, month + 1, 0).toISOString().split("T")[0];
  return { firstDay, lastDay };
}

function createEmptyLine() {
  return {
    account_id: "",
    account_code: "",
    account_name: "",
    debit: "",
    credit: "",
    memo: "",
  };
}
// ════════════════════════════════════════════════════════════════════════════
// MODAL FORM INPUT JURNAL UMUM (DOUBLE ENTRY)
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// MODAL FORM INPUT JURNAL UMUM (DOUBLE ENTRY)
// ════════════════════════════════════════════════════════════════════════════
export function FormJurnalModal({ open, onClose, onSuccess }) {
  const [entryDate, setEntryDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([
    createEmptyLine(),
    createEmptyLine(),
    createEmptyLine(),
    createEmptyLine(),
  ]);

  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [newAccountModalOpen, setNewAccountModalOpen] = useState(false);
  const [activeRowIndexForNewAccount, setActiveRowIndexForNewAccount] = useState(null);
  const [seedingAccounts, setSeedingAccounts] = useState(false);

  const fetchAccounts = useCallback(() => {
    setLoadingAccounts(true);
    setErrorMessage("");
    return api("/finance-ho/accounts/select")
      .then((res) => {
        setAccounts(res.data || []);
      })
      .catch((err) => {
        console.error("Gagal load akun:", err);
        setErrorMessage("Gagal memuat daftar akun. Silakan refresh kembali.");
      })
      .finally(() => {
        setLoadingAccounts(false);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAccounts();
  }, [open, fetchAccounts]);

  const handleOpenNewAccount = (rowIndex = null) => {
    setActiveRowIndexForNewAccount(rowIndex);
    setNewAccountModalOpen(true);
  };

  const handleAccountCreated = (newAcc) => {
    if (newAcc && newAcc.id) {
      setAccounts((prev) => {
        const list = [...prev, newAcc];
        return list.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
      });

      if (activeRowIndexForNewAccount !== null && activeRowIndexForNewAccount >= 0) {
        handleAccountChange(activeRowIndexForNewAccount, newAcc.id);
      }
    } else {
      fetchAccounts();
    }
    setNewAccountModalOpen(false);
  };

  const handleSeedDefaultAccounts = async () => {
    setSeedingAccounts(true);
    try {
      await api("/finance-ho/accounts/seed-default", { method: "POST" });
      await fetchAccounts();
    } catch (err) {
      console.error("Gagal muat akun standar:", err);
      setErrorMessage(err.message || "Gagal memuat akun standar.");
    } finally {
      setSeedingAccounts(false);
    }
  };

  const resetForm = useCallback(() => {
    setEntryDate(new Date().toISOString().split("T")[0]);
    setDescription("");
    setLines([
      createEmptyLine(),
      createEmptyLine(),
      createEmptyLine(),
      createEmptyLine(),
    ]);
    setErrorMessage("");
  }, []);

  const handleAccountChange = (index, accountId) => {
    const selected = accounts.find((a) => String(a.id) === String(accountId));
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        account_id: accountId ? Number(accountId) : "",
        account_code: selected ? selected.code : "",
        account_name: selected ? selected.name : "",
      };
      return updated;
    });
  };

  const handleDebitChange = (index, value) => {
    const formatted = formatNumber(value);
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        debit: formatted,
        credit: formatted ? "" : updated[index].credit,
      };
      return updated;
    });
  };

  const handleCreditChange = (index, value) => {
    const formatted = formatNumber(value);
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        credit: formatted,
        debit: formatted ? "" : updated[index].debit,
      };
      return updated;
    });
  };

  const handleMemoChange = (index, value) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        memo: value,
      };
      return updated;
    });
  };

  const handleAddLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const handleRemoveLine = (index) => {
    if (lines.length <= 2) {
      setLines((prev) => {
        const updated = [...prev];
        updated[index] = createEmptyLine();
        return updated;
      });
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const { totalDebit, totalCredit, diff, isBalanced, validRowsCount } = useMemo(() => {
    let dSum = 0;
    let cSum = 0;
    let validCount = 0;

    lines.forEach((line) => {
      const d = parseNumber(line.debit);
      const c = parseNumber(line.credit);
      if (d > 0 || c > 0) {
        dSum += d;
        cSum += c;
        if (line.account_id) {
          validCount += 1;
        }
      }
    });

    const difference = Math.abs(dSum - cSum);
    const balanced = difference === 0 && dSum > 0 && validCount >= 2;

    return {
      totalDebit: dSum,
      totalCredit: cSum,
      diff: difference,
      isBalanced: balanced,
      validRowsCount: validCount,
    };
  }, [lines]);

  const previewEntryNo = useMemo(() => {
    if (!entryDate) return "JU-YYYY-MM-XXXX";
    const d = new Date(entryDate);
    const y = d.getFullYear() || "YYYY";
    const m = String((d.getMonth() || 0) + 1).padStart(2, "0");
    return `JU-${y}-${m}-XXXX (Otomatis)`;
  }, [entryDate]);

  const handleSubmit = async (andNew = false) => {
    setErrorMessage("");

    if (!description.trim()) {
      setErrorMessage("Deskripsi jurnal wajib diisi.");
      return;
    }

    if (!isBalanced) {
      setErrorMessage("Jurnal belum seimbang atau belum memenuhi syarat minimal 2 baris bernominal.");
      return;
    }

    const payloadLines = lines
      .filter((l) => parseNumber(l.debit) > 0 || parseNumber(l.credit) > 0)
      .map((l) => ({
        account_id: Number(l.account_id),
        debit: parseNumber(l.debit),
        credit: parseNumber(l.credit),
        memo: l.memo ? l.memo.trim() : null,
      }));

    if (payloadLines.length < 2) {
      setErrorMessage("Jurnal minimal harus memiliki 2 baris transaksi bernominal.");
      return;
    }

    const payload = {
      entry_date: entryDate,
      description: description.trim(),
      lines: payloadLines,
    };

    setSubmitting(true);

    try {
      const res = await api("/finance-ho/journals", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (onSuccess) {
        onSuccess(res);
      }

      if (andNew) {
        resetForm();
      } else {
        onClose();
      }
    } catch (err) {
      setErrorMessage(err.message || "Gagal menyimpan jurnal. Periksa kembali input Anda.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={handleCancel}
      />

      <div
        className="relative w-full max-w-5xl rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden flex flex-col animate-[fadeIn_0.2s_ease-out]"
        style={{ maxHeight: "94vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 shadow-sm">
              <HiOutlineBookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 tracking-tight">
                Tambah Jurnal Umum Baru
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Pencatatan mutasi debit dan kredit berstatus langsung posted
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMessage && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center gap-2.5">
              <HiOutlineExclamationTriangle className="h-5 w-5 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Header Form Input */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Nomor Jurnal
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-mono font-bold text-slate-600">
                <HiOutlineSparkles className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{previewEntryNo}</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Tanggal Jurnal <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Deskripsi / Keterangan <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Misal: Pembayaran sewa kantor, modal awal..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Banner jika belum ada akun di database */}
          {accounts.length === 0 && !loadingAccounts && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl bg-amber-50/80 border border-amber-200 p-3.5 text-xs text-amber-900 shadow-sm">
              <div className="flex items-center gap-2">
                <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <span>
                  Belum ada akun di database <strong>mst_coa</strong>. Tambahkan akun baru atau muat akun standar:
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSeedDefaultAccounts}
                  disabled={seedingAccounts}
                  className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 border border-amber-300 hover:bg-amber-100 shadow-sm transition"
                >
                  <HiOutlineSparkles className="h-3.5 w-3.5 text-amber-600" />
                  {seedingAccounts ? "Memuat..." : "Muat 21 Akun Standar"}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenNewAccount(0)}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition"
                >
                  <HiOutlinePlus className="h-3.5 w-3.5" />
                  + Buat Akun Baru
                </button>
              </div>
            </div>
          )}

          {/* Lines Table */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[260px]">
                      <div className="flex items-center justify-between">
                        <span>Akun (Kode - Nama)</span>
                        <button
                          type="button"
                          onClick={() => handleOpenNewAccount(null)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200 transition"
                          title="Buat Akun Baru ke Database"
                        >
                          <HiOutlinePlus className="h-3 w-3" />
                          <span>+ Buat Akun</span>
                        </button>
                      </div>
                    </th>
                    <th className="py-2.5 px-3 w-40 text-right">Debit (Rp)</th>
                    <th className="py-2.5 px-3 w-40 text-right">Kredit (Rp)</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Memo Baris</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {lines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="py-2 px-3 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={line.account_id}
                          onChange={(e) => {
                            if (e.target.value === "__NEW__") {
                              handleOpenNewAccount(idx);
                            } else {
                              handleAccountChange(idx, e.target.value);
                            }
                          }}
                          disabled={loadingAccounts}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">-- Pilih Akun --</option>
                          <option value="__NEW__" className="font-bold text-emerald-700 bg-emerald-50">
                            ➕ + Buat Akun Baru...
                          </option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name} ({acc.type})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          placeholder="0"
                          value={line.debit}
                          onChange={(e) => handleDebitChange(idx, e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-right font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          placeholder="0"
                          value={line.credit}
                          onChange={(e) => handleCreditChange(idx, e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-right font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          placeholder="Memo opsional"
                          value={line.memo}
                          onChange={(e) => handleMemoChange(idx, e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          title="Hapus baris"
                          className="p-1 text-slate-400 hover:text-rose-500 transition rounded-md hover:bg-rose-50"
                        >
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tombol Tambah Baris */}
            <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
              >
                <HiOutlinePlus className="h-4 w-4 text-emerald-600" />
                Tambah Baris
              </button>
              <span className="text-[11px] text-slate-400">
                Minimal 2 baris transaksi bernominal
              </span>
            </div>
          </div>

          {/* Status Keseimbangan (Balance Status Bar) */}
          <div
            className={cn(
              "rounded-2xl border p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4",
              isBalanced
                ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                : "bg-amber-50/80 border-amber-200 text-amber-950"
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-sm",
                  isBalanced
                    ? "bg-emerald-500 text-white"
                    : "bg-amber-500 text-white"
                )}
              >
                {isBalanced ? (
                  <HiOutlineCheckCircle className="h-6 w-6 stroke-[2.2]" />
                ) : (
                  <HiOutlineExclamationTriangle className="h-6 w-6 stroke-[2.2]" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Status:
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold",
                      isBalanced
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    )}
                  >
                    {isBalanced ? "SEIMBANG (BALANCED)" : "BELUM SEIMBANG"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {isBalanced
                    ? "Total debit dan kredit sama besar. Jurnal siap disimpan."
                    : diff > 0
                      ? `Terdapat selisih sebesar ${formatRupiah(diff)} (${totalDebit < totalCredit ? "Debit kurang" : "Kredit kurang"
                      }).`
                      : "Isi minimal 2 baris transaksi akun bernominal untuk menyimpan."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <span className="text-[10px] uppercase text-slate-500 block">Total Debit:</span>
                <span className="font-mono text-xs font-bold text-slate-800">
                  {formatRupiah(totalDebit)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 block">Total Kredit:</span>
                <span className="font-mono text-xs font-bold text-slate-800">
                  {formatRupiah(totalCredit)}
                </span>
              </div>
              <div className="border-l border-slate-300 pl-4">
                <span className="text-[10px] uppercase text-slate-500 block">Selisih:</span>
                <span
                  className={cn(
                    "font-mono text-sm font-bold",
                    diff === 0 ? "text-emerald-700" : "text-rose-600"
                  )}
                >
                  {formatRupiah(diff)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/50 shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Batal
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={submitting || !isBalanced}
              className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-40 disabled:pointer-events-none"
            >
              Simpan & Baru
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={submitting || !isBalanced}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-40 disabled:pointer-events-none shadow-sm shadow-emerald-600/20"
            >
              {submitting && <HiOutlineClock className="h-4 w-4 animate-spin" />}
              {submitting ? "Menyimpan..." : "Simpan Jurnal"}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Buat Akun Baru (Dinamis ke Database mst_coa) */}
      {newAccountModalOpen && (
        <ModalFormAkun
          onClose={() => setNewAccountModalOpen(false)}
          onSuccess={handleAccountCreated}
        />
      )}
    </div>,
    document.body
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: JURNAL UMUM (Daftar, Filter, Modal Form, Modal Detail)
// ════════════════════════════════════════════════════════════════════════════
export default function JurnalUmum() {
  const { firstDay, lastDay } = getDefaultDateRange();

  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });

  // Filters
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [statusFilter, setStatusFilter] = useState("");

  // Modals state
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  // Fetch data jurnal dari server
  const fetchJournals = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          page: String(page),
          limit: String(pagination.limit),
        });

        if (search.trim()) qs.set("q", search.trim());
        if (fromDate) qs.set("from", fromDate);
        if (toDate) qs.set("to", toDate);
        if (statusFilter) qs.set("status", statusFilter);

        const res = await api(`/finance-ho/journals?${qs.toString()}`);
        setJournals(res.data || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      } catch (err) {
        console.error("Gagal load jurnal:", err);
      } finally {
        setLoading(false);
      }
    },
    [search, fromDate, toDate, statusFilter, pagination.limit]
  );

  useEffect(() => {
    fetchJournals(1);
  }, [fetchJournals]);

  // Reset filter
  const handleResetFilter = () => {
    setSearch("");
    setFromDate(firstDay);
    setToDate(lastDay);
    setStatusFilter("");
  };

  return (
    <>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[10000] flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl animate-[fadeIn_0.2s_ease-out]">
          <HiOutlineCheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modal Form Jurnal Baru */}
      <FormJurnalModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={(result) => {
          showToast(`Jurnal ${result.entry_no} berhasil dibuat dan di-posting.`);
          fetchJournals(1);
        }}
      />

      {/* Modal Detail Jurnal & Jurnal Pembalik */}
      <DetailJurnalModal
        open={Boolean(detailId)}
        journalId={detailId}
        onClose={() => setDetailId(null)}
        onReversed={() => {
          showToast("Jurnal berhasil dibalik.");
          fetchJournals(pagination.page);
        }}
      />

      <main className="min-h-screen bg-slate-50 py-6 sm:py-8">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Header Banner */}
          <section className="relative overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-r from-[#059669] to-[#6EE7B7] p-6 shadow-sm">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl pointer-events-none" />
            <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-teal-200/25 blur-3xl pointer-events-none" />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 border border-white/30 text-white shadow-inner backdrop-blur-xs">
                  <HiOutlineBookOpen className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white sm:text-2xl drop-shadow-xs">
                    Jurnal Umum
                  </h1>
                  <p className="text-xs sm:text-sm text-emerald-50 mt-0.5 font-medium drop-shadow-xs">
                    Pencatatan transaksi pembukuan double-entry secara otomatis berstatus posted.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition shadow-md shadow-emerald-950/10 shrink-0"
              >
                <HiOutlinePlus className="h-4 w-4 stroke-[2.5]" />
                Jurnal Baru
              </button>
            </div>
          </section>

          {/* Filter Card */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Cari Jurnal
                </label>
                <div className="relative">
                  <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="No. Jurnal atau Deskripsi..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Tanggal Dari */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
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
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Status Jurnal
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Semua Status</option>
                  <option value="POSTED">POSTED</option>
                  <option value="REVERSED">DIBALIK (REVERSED)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                Ditemukan <strong>{pagination.total}</strong> jurnal transaksi
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetFilter}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition"
                >
                  Reset Filter
                </button>
                <button
                  type="button"
                  onClick={() => fetchJournals(1)}
                  className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </section>

          {/* Table Data Card */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 w-40">No. Jurnal</th>
                    <th className="py-3 px-4 w-28">Tanggal</th>
                    <th className="py-3 px-4 min-w-[240px]">Keterangan</th>
                    <th className="py-3 px-4 w-32">Status</th>
                    <th className="py-3 px-4 w-40 text-right">Total Nominal</th>
                    <th className="py-3 px-4 w-36">Dibuat Oleh</th>
                    <th className="py-3 px-4 w-20 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <HiOutlineArrowPath className="h-6 w-6 animate-spin text-emerald-600" />
                          <span>Memuat daftar jurnal umum...</span>
                        </div>
                      </td>
                    </tr>
                  ) : journals.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <HiOutlineBookOpen className="h-8 w-8 text-slate-300" />
                          <span className="font-semibold text-slate-600">
                            Tidak ada jurnal yang sesuai kriteria
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Coba sesuaikan filter pencarian atau buat jurnal baru.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    journals.map((j, idx) => (
                      <tr key={j.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 text-center text-slate-400 font-bold">
                          {(pagination.page - 1) * pagination.limit + idx + 1}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {j.entry_no}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {formatDate(j.entry_date)}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          <div>{j.description}</div>
                          {j.reverses_entry_id && (
                            <span className="inline-block mt-0.5 text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              Pembalik
                            </span>
                          )}
                          {j.reversed_by_entry_id && (
                            <span className="inline-block mt-0.5 text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Sudah Dibalik
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                              j.status === "POSTED"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            )}
                          >
                            {j.status === "POSTED" ? "POSTED" : "DIBALIK"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                          {formatRupiah(j.total_amount)}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {j.creator_name || "-"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setDetailId(j.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition shadow-sm"
                            title="Lihat Detail & Pembalik"
                          >
                            <HiOutlineEye className="h-3.5 w-3.5" />
                            <span>Detail</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginasi Footer */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 p-4 bg-slate-50/50 text-xs">
                <span className="text-slate-500">
                  Halaman <strong>{pagination.page}</strong> dari{" "}
                  <strong>{pagination.totalPages}</strong> (Total {pagination.total} data)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pagination.page <= 1 || loading}
                    onClick={() => fetchJournals(pagination.page - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <HiOutlineChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-2 font-bold text-slate-700">
                    {pagination.page}
                  </span>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages || loading}
                    onClick={() => fetchJournals(pagination.page + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <HiOutlineChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
