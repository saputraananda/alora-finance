import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlineArrowPath,
  HiOutlineClock,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlinePaperClip,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api } from "../lib/api";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const rupiah = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = String(dateStr).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function currentUserId() {
  try {
    return Number(JSON.parse(localStorage.getItem("user") || "{}").id) || null;
  } catch {
    return null;
  }
}

// Warna status sama di semua menu (sesuai "Komponen standar" di referensi)
export const JOURNAL_STATUS = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-600 border-slate-300" },
  PENDING: { label: "Menunggu approval", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  POSTED: { label: "Diposting", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REVERSED: { label: "Dibalik", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const SOURCE_LABEL = { POS: "POS", MANUAL: "Manual", REKONSILIASI: "Rekonsiliasi", REKON_BANK: "Bank (biaya admin)", ALOKASI: "Alokasi biaya pusat", PENGAJUAN: "Pengajuan (Pembelian)" };

// ════════════════════════════════════════════════════════════════════════════
// MODAL DETAIL JURNAL — lihat, ubah draft, ajukan, setujui/tolak, balik
// ════════════════════════════════════════════════════════════════════════════
export function DetailJurnalModal({ open, journalId, onClose, onReversed, onEdit, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [panel, setPanel] = useState(null); // 'reverse' | 'reject' | 'delete'
  const [reverseDate, setReverseDate] = useState(todayLocal());
  const [rejectNote, setRejectNote] = useState("");
  const [actionError, setActionError] = useState("");

  const me = currentUserId();

  const load = useCallback(() => {
    if (!journalId) return Promise.resolve();
    setLoading(true);
    setError("");
    return api(`/finance-ho/journals/${journalId}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || "Gagal memuat detail jurnal."))
      .finally(() => setLoading(false));
  }, [journalId]);

  useEffect(() => {
    if (!open || !journalId) return;
    setPanel(null);
    setActionError("");
    setRejectNote("");
    setData(null);
    load();
  }, [open, journalId, load]);

  const run = async (fn, successMsg, { close = false } = {}) => {
    setBusy(true);
    setActionError("");
    try {
      const res = await fn();
      onChanged?.(res?.message || successMsg);
      if (close) onClose();
      else {
        setPanel(null);
        await load();
      }
    } catch (err) {
      setActionError(err.message || "Aksi gagal.");
    } finally {
      setBusy(false);
    }
  };

  const doSubmit = () => run(() => api(`/finance-ho/journals/${journalId}/submit`, { method: "POST" }), "Jurnal diajukan.");
  const doApprove = () => run(() => api(`/finance-ho/journals/${journalId}/approve`, { method: "POST" }), "Jurnal disetujui.");
  const doReject = () => {
    if (!rejectNote.trim()) return setActionError("Alasan penolakan wajib diisi.");
    return run(
      () => api(`/finance-ho/journals/${journalId}/reject`, { method: "POST", body: JSON.stringify({ note: rejectNote.trim() }) }),
      "Jurnal dikembalikan ke draft."
    );
  };
  const doDelete = () =>
    run(() => api(`/finance-ho/journals/${journalId}`, { method: "DELETE" }), "Draft dihapus.", { close: true });
  const doReverse = async () => {
    if (!reverseDate) return setActionError("Tanggal pembalik wajib diisi.");
    setBusy(true);
    setActionError("");
    try {
      const res = await api(`/finance-ho/journals/${journalId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ entry_date: reverseDate }),
      });
      onChanged?.(res.message);
      onReversed?.();
      onClose();
    } catch (err) {
      setActionError(err.message || "Gagal membuat jurnal pembalik.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const st = data ? JOURNAL_STATUS[data.status] || JOURNAL_STATUS.POSTED : null;
  const isCreator = data && me && Number(data.created_by) === me;
  const isManual = data?.source_type === "MANUAL";
  const hasOutletLines = data?.lines?.some((l) => l.outlet_name);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div
        className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]"
        style={{ maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <HiOutlineDocumentText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-slate-800">Detail Jurnal</h3>
                {st && (
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold", st.cls)}>
                    {st.label}
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-mono text-xs text-slate-400">{data?.entry_no || "Memuat informasi..."}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <HiOutlineArrowPath className="mb-2 h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-xs">Memuat rincian jurnal...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
              <HiOutlineExclamationTriangle className="h-5 w-5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {data && !loading && (
            <>
              <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-xs md:grid-cols-5">
                {[
                  ["Tanggal", formatDate(data.entry_date)],
                  ["Sumber", SOURCE_LABEL[data.source_type] || data.source_type],
                  ["Cabang", data.outlet_name],
                  ["Dibuat oleh", data.creator_name || "-"],
                  ["Total", `Rp ${rupiah(data.total_amount)}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</span>
                    <span className="font-semibold text-slate-800">{v}</span>
                  </div>
                ))}
              </div>

              {(data.source_type === "POS" || data.source_type === "REKONSILIASI") && data.outlet_id && (
                <Link
                  to={`${data.source_type === "POS" ? "/finance-ho/integrasi-pos" : "/finance-ho/rekonsiliasi"}?date=${String(data.entry_date).slice(0, 10)}&outlet=${data.outlet_id}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-sky-100"
                >
                  <HiOutlineArrowTopRightOnSquare className="h-4 w-4" />
                  {data.source_type === "POS" ? "Telusuri ke batch POS dan nota" : "Telusuri ke rekonsiliasi harian"}
                </Link>
              )}

              <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Keterangan</span>
                <div className="rounded-xl border border-slate-100 bg-white p-3 text-xs font-medium text-slate-700">
                  {data.description}
                </div>
              </div>

              {data.reject_note && data.status === "DRAFT" && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    Dikembalikan oleh penyetuju: <strong>{data.reject_note}</strong>
                  </span>
                </div>
              )}

              {data.approved_by && (
                <p className="text-[11px] text-slate-500">
                  Disetujui oleh <strong className="text-slate-700">{data.approver_name || `User #${data.approved_by}`}</strong>
                  {data.approved_at ? ` pada ${formatDate(data.approved_at)}` : ""}
                </p>
              )}

              {data.attachment_url && (
                <a
                  href={data.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
                >
                  <HiOutlinePaperClip className="h-4 w-4" />
                  Lampiran: {data.attachment_name || "lihat file"}
                </a>
              )}

              {data.reverses_entry_no && (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  <HiOutlineArrowPath className="h-4 w-4 shrink-0 text-blue-600" />
                  <span>
                    Jurnal ini merupakan pembalik dari jurnal: <strong>{data.reverses_entry_no}</strong>
                  </span>
                </div>
              )}
              {data.reversed_by_entry_no && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <HiOutlineExclamationTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    Jurnal ini telah dibalik oleh jurnal: <strong>{data.reversed_by_entry_no}</strong>
                  </span>
                </div>
              )}

              {/* Baris jurnal */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Akun</th>
                      {hasOutletLines && <th className="px-3 py-2.5">Cabang</th>}
                      <th className="min-w-[140px] px-3 py-2.5">Keterangan baris</th>
                      <th className="w-32 px-3 py-2.5 text-right">Debit</th>
                      <th className="w-32 px-3 py-2.5 text-right">Kredit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {data.lines?.map((line, idx) => (
                      <tr key={line.id || idx}>
                        <td className={cn("px-3 py-2.5 font-semibold text-slate-800", Number(line.credit) > 0 && "pl-8")}>
                          <span className="font-mono">{line.account_code}</span> {line.account_name}
                        </td>
                        {hasOutletLines && <td className="px-3 py-2.5 text-slate-600">{line.outlet_name || "-"}</td>}
                        <td className="px-3 py-2.5 text-slate-500">{line.memo || "-"}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                          {Number(line.debit) > 0 ? rupiah(line.debit) : ""}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                          {Number(line.credit) > 0 ? rupiah(line.credit) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
                    <tr>
                      <td colSpan={hasOutletLines ? 3 : 2} className="px-3 py-2.5 text-right">Total</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">{rupiah(data.total_amount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">{rupiah(data.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Panel konfirmasi */}
              {panel === "reverse" && (
                <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-start gap-2.5">
                    <HiOutlineExclamationTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">Batalkan dengan jurnal balik</h4>
                      <p className="mt-0.5 text-[11px] text-amber-800">
                        Sistem membuat jurnal baru yang membalik seluruh debit dan kredit jurnal ini. Jurnal asal tidak dihapus
                        dan ditandai Dibalik.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="shrink-0 text-xs font-bold text-slate-700">Tanggal jurnal balik:</label>
                    <input
                      type="date"
                      value={reverseDate}
                      onChange={(e) => setReverseDate(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {panel === "reject" && (
                <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                  <label className="block text-xs font-bold text-rose-900">Alasan dikembalikan ke draft</label>
                  <input
                    type="text"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Misal: cabang di baris 2 salah"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-rose-400"
                  />
                </div>
              )}

              {panel === "delete" && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-xs text-rose-900">
                  Draft <strong>{data.entry_no}</strong> akan dihapus permanen. Lanjutkan?
                </div>
              )}

              {actionError && <p className="text-xs font-semibold text-rose-600">{actionError}</p>}

              {data.status === "PENDING" && isCreator && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Menunggu disetujui. Pembuat jurnal tidak bisa menyetujui jurnalnya sendiri, minta rekan lain (Accounting) untuk menyetujui.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer aksi */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {data && data.status === "DRAFT" && isManual && isCreator && panel !== "delete" && (
              <button
                type="button"
                onClick={() => setPanel("delete")}
                disabled={busy}
                className="rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
              >
                Hapus draft
              </button>
            )}
            {panel === "delete" && (
              <button
                type="button"
                onClick={doDelete}
                disabled={busy}
                className="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-rose-700"
              >
                {busy ? "Menghapus..." : "Ya, hapus"}
              </button>
            )}
            {data && data.status === "POSTED" && !data.reversed_by_entry_id && panel !== "reverse" && (
              <button
                type="button"
                onClick={() => setPanel("reverse")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
              >
                <HiOutlineArrowPath className="h-4 w-4" />
                Batalkan dengan jurnal balik
              </button>
            )}
            {panel === "reverse" && (
              <button
                type="button"
                onClick={doReverse}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
              >
                {busy && <HiOutlineClock className="h-4 w-4 animate-spin" />}
                {busy ? "Memproses..." : "Ya, buat jurnal balik"}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={panel ? () => { setPanel(null); setActionError(""); } : onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
            >
              {panel ? "Batal" : "Tutup"}
            </button>

            {data && data.status === "DRAFT" && isManual && isCreator && !panel && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit?.(data.id)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
                >
                  Ubah
                </button>
                <button
                  type="button"
                  onClick={doSubmit}
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? "Mengajukan..." : "Ajukan approval"}
                </button>
              </>
            )}

            {data && data.status === "PENDING" && !isCreator && panel !== "reject" && (
              <>
                <button
                  type="button"
                  onClick={() => setPanel("reject")}
                  className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                >
                  Kembalikan ke draft
                </button>
                <button
                  type="button"
                  onClick={doApprove}
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? "Memproses..." : "Setujui"}
                </button>
              </>
            )}
            {panel === "reject" && (
              <button
                type="button"
                onClick={doReject}
                disabled={busy}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? "Memproses..." : "Kembalikan"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default DetailJurnalModal;
