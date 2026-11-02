import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  HiOutlineArrowPath,
  HiOutlineClock,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api } from "../lib/api";

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



// ════════════════════════════════════════════════════════════════════════════
// MODAL DETAIL JURNAL & REVERSAL
// ════════════════════════════════════════════════════════════════════════════
export function DetailJurnalModal({ open, journalId, onClose, onReversed }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showReverseConfirm, setShowReverseConfirm] = useState(false);
  const [reverseDate, setReverseDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState("");

  useEffect(() => {
    if (!open || !journalId) return;

    let mounted = true;
    setLoading(true);
    setError("");
    setShowReverseConfirm(false);
    setReverseError("");

    api(`/finance-ho/journals/${journalId}`)
      .then((res) => {
        if (mounted) setData(res.data);
      })
      .catch((err) => {
        if (mounted) setError(err.message || "Gagal memuat detail jurnal.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, journalId]);

  const handleReverse = async () => {
    if (!reverseDate) {
      setReverseError("Tanggal pembalik wajib diisi.");
      return;
    }

    setReversing(true);
    setReverseError("");

    try {
      const res = await api(`/finance-ho/journals/${journalId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ entry_date: reverseDate }),
      });

      alert(res.message || "Jurnal pembalik berhasil dibuat!");
      setShowReverseConfirm(false);
      if (onReversed) onReversed();
      onClose();
    } catch (err) {
      setReverseError(err.message || "Gagal membuat jurnal pembalik.");
    } finally {
      setReversing(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-4xl rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden flex flex-col animate-[fadeIn_0.2s_ease-out]"
        style={{ maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <HiOutlineDocumentText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800 tracking-tight">
                  Detail Jurnal Umum
                </h3>
                {data && (
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
                      data.status === "POSTED"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    )}
                  >
                    {data.status === "POSTED" ? "POSTED" : "DIBALIK (REVERSED)"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {data?.entry_no || "Memuat informasi..."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <HiOutlineArrowPath className="h-8 w-8 animate-spin text-emerald-600 mb-2" />
              <p className="text-xs">Memuat rincian transaksi jurnal...</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center gap-2">
              <HiOutlineExclamationTriangle className="h-5 w-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {data && !loading && (
            <>
              {/* Header Meta Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Nomor Jurnal
                  </span>
                  <span className="font-mono font-bold text-slate-800 text-sm">
                    {data.entry_no}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Tanggal Transaksi
                  </span>
                  <span className="font-semibold text-slate-800">
                    {formatDate(data.entry_date)}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Dibuat Oleh
                  </span>
                  <span className="font-semibold text-slate-800">
                    {data.creator_name || "-"}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Total Nominal
                  </span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {formatRupiah(data.total_amount)}
                  </span>
                </div>
              </div>

              {/* Deskripsi */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Keterangan / Deskripsi
                </label>
                <div className="rounded-xl border border-slate-100 bg-white p-3 text-xs text-slate-700 font-medium">
                  {data.description}
                </div>
              </div>

              {/* Informasi Relasi Pembalik Jika Ada */}
              {data.reverses_entry_no && (
                <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                  <HiOutlineArrowPath className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    Jurnal ini merupakan pembalik dari jurnal:{" "}
                    <strong>{data.reverses_entry_no}</strong>
                  </span>
                </div>
              )}

              {data.reversed_by_entry_no && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                  <HiOutlineExclamationTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    Jurnal ini telah dibalik oleh jurnal:{" "}
                    <strong>{data.reversed_by_entry_no}</strong>
                  </span>
                </div>
              )}

              {/* Tabel Baris Transaksi */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Rincian Baris Transaksi (Debit & Kredit)
                </span>
                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3 w-32">Kode Akun</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Nama Akun</th>
                        <th className="py-2.5 px-3 w-36 text-right">Debit (Rp)</th>
                        <th className="py-2.5 px-3 w-36 text-right">Kredit (Rp)</th>
                        <th className="py-2.5 px-3 min-w-[150px]">Memo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {data.lines?.map((line, idx) => (
                        <tr key={line.id || idx} className="hover:bg-slate-50/50 transition">
                          <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                            {line.account_code || "-"}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {line.account_name}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                            {Number(line.debit) > 0 ? formatRupiah(line.debit) : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                            {Number(line.credit) > 0 ? formatRupiah(line.credit) : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">{line.memo || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800 text-xs">
                      <tr>
                        <td colSpan="3" className="py-2.5 px-3 text-right">
                          Total:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                          {formatRupiah(data.total_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                          {formatRupiah(data.total_amount)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Panel Konfirmasi Jurnal Pembalik */}
              {showReverseConfirm && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3 animate-[fadeIn_0.15s_ease-out]">
                  <div className="flex items-start gap-2.5">
                    <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">
                        Konfirmasi Jurnal Pembalik (Reversal)
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Sistem akan membuat nomor jurnal baru yang membalik seluruh posisi Debit dan Kredit dari jurnal ini secara atomik, dan menandai jurnal asal sebagai REVERSED.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-700 shrink-0">
                        Tanggal Pembalik:
                      </label>
                      <input
                        type="date"
                        value={reverseDate}
                        onChange={(e) => setReverseDate(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => setShowReverseConfirm(false)}
                        disabled={reversing}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleReverse}
                        disabled={reversing}
                        className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-sm shadow-amber-600/20"
                      >
                        {reversing && <HiOutlineClock className="h-4 w-4 animate-spin" />}
                        {reversing ? "Memproses..." : "Ya, Buat Jurnal Pembalik"}
                      </button>
                    </div>
                  </div>

                  {reverseError && (
                    <p className="text-xs font-semibold text-rose-600">{reverseError}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/50 shrink-0">
          <div>
            {data && data.status === "POSTED" && !data.reversed_by_entry_id && (
              <button
                type="button"
                onClick={() => setShowReverseConfirm(true)}
                disabled={showReverseConfirm}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 transition shadow-sm disabled:opacity-50"
              >
                <HiOutlineArrowPath className="h-4 w-4 text-rose-600" />
                Balikkan Jurnal (Reversal)
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-sm"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL FORM INPUT JURNAL UMUM (DOUBLE ENTRY)
// ════════════════════════════════════════════════════════════════════════════

export default DetailJurnalModal;
