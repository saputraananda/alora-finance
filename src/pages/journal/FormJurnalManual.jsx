import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  HiOutlineBookOpen,
  HiOutlinePlus,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineXMark,
  HiOutlineTrash,
  HiOutlineExclamationTriangle,
  HiOutlinePaperClip,
  HiOutlineSparkles,
} from "react-icons/hi2";
import { api, getToken } from "../../lib/api";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const rupiah = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);

const formatNumber = (v) => String(v ?? "").replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const parseNumber = (s) => {
  const n = parseFloat(String(s || "").replace(/\./g, "").replace(/,/g, "."));
  return Number.isNaN(n) ? 0 : n;
};

function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

const emptyLine = () => ({ account_id: "", outlet_id: "", debit: "", credit: "", memo: "" });

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

// ── Pilihan akun yang bisa dicari dengan kode atau nama ─────────────────
function AccountPicker({ value, accounts, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const selected = accounts.find((a) => String(a.id) === String(value));

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? accounts.filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(t)) : accounts).slice(0, 60);
  }, [q, accounts]);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={open ? q : selected ? `${selected.code} ${selected.name}` : ""}
        placeholder="Cari kode atau nama akun"
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        className={inputCls}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {list.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">Akun tidak ditemukan</p>
          ) : (
            list.map((a) => (
              <button
                key={a.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(a.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-emerald-50",
                  String(a.id) === String(value) && "bg-emerald-50"
                )}
              >
                <span className="w-14 shrink-0 font-mono font-bold text-slate-800">{a.code}</span>
                <span className="text-slate-600">{a.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FORM JURNAL MANUAL (Jurnal > Jurnal manual)
// Props: editId → ubah draft yang sudah ada.
// ════════════════════════════════════════════════════════════════════════════
export default function FormJurnalManual({ open, editId, onClose, onSuccess }) {
  const [entryDate, setEntryDate] = useState(todayLocal());
  const [description, setDescription] = useState("");
  const [outletId, setOutletId] = useState("");
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [attachment, setAttachment] = useState(null); // {url, name}
  const [uploading, setUploading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [restricted, setRestricted] = useState([]);
  const [entryNo, setEntryNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(null); // 'draft' | 'submit'
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);

  const reset = useCallback(() => {
    setEntryDate(todayLocal());
    setDescription("");
    setOutletId("");
    setLines([emptyLine(), emptyLine()]);
    setAttachment(null);
    setEntryNo("");
    setError("");
  }, []);

  const loadRefs = useCallback(async () => {
    const [acc, meta] = await Promise.all([api("/finance-ho/accounts/select"), api("/finance-ho/journals/meta")]);
    setAccounts(acc.data || []);
    setOutlets(meta.outlets || []);
    setRestricted((meta.restricted_account_ids || []).map(Number));
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        await loadRefs();
        if (editId) {
          const res = await api(`/finance-ho/journals/${editId}`);
          if (!alive) return;
          const j = res.data;
          setEntryNo(j.entry_no);
          setEntryDate(String(j.entry_date).slice(0, 10));
          setDescription(j.description || "");
          setOutletId(j.outlet_id ? String(j.outlet_id) : "");
          setAttachment(j.attachment_url ? { url: j.attachment_url, name: j.attachment_name } : null);
          setLines(
            (j.lines || []).map((l) => ({
              account_id: l.account_id,
              outlet_id: l.outlet_id ? String(l.outlet_id) : "",
              debit: Number(l.debit) > 0 ? formatNumber(Math.round(l.debit)) : "",
              credit: Number(l.credit) > 0 ? formatNumber(Math.round(l.credit)) : "",
              memo: l.memo || "",
            }))
          );
        } else {
          reset();
        }
      } catch (e) {
        if (alive) setError(e.message || "Gagal memuat data pendukung.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, editId, loadRefs, reset]);

  // Akun kas/piutang/deposit tidak boleh dipakai di jurnal manual
  const selectable = useMemo(() => accounts.filter((a) => !restricted.includes(Number(a.id))), [accounts, restricted]);

  const previewNo = useMemo(() => {
    if (entryNo) return entryNo;
    const [y, m, d] = (entryDate || todayLocal()).split("-");
    return `JM-${y.slice(2)}${m}${d}-NN (otomatis)`;
  }, [entryNo, entryDate]);

  const setLine = (i, patch) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const totals = useMemo(() => {
    let d = 0;
    let c = 0;
    let filled = 0;
    lines.forEach((l) => {
      const dv = parseNumber(l.debit);
      const cv = parseNumber(l.credit);
      if (dv > 0 || cv > 0) {
        d += dv;
        c += cv;
        if (l.account_id) filled += 1;
      }
    });
    const diff = Math.abs(d - c);
    return { d, c, diff, balanced: diff < 0.005 && d > 0 && filled >= 2 };
  }, [lines]);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/finance-ho/journals/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Gagal mengunggah lampiran.");
      setAttachment({ url: data.url, name: data.name });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (action) => {
    setError("");
    if (!description.trim()) return setError("Keterangan jurnal wajib diisi.");
    if (action === "submit" && !totals.balanced) {
      return setError("Jurnal belum seimbang atau belum punya minimal 2 baris bernominal.");
    }
    const payloadLines = lines
      .filter((l) => parseNumber(l.debit) > 0 || parseNumber(l.credit) > 0 || l.account_id)
      .map((l) => ({
        account_id: l.account_id ? Number(l.account_id) : null,
        outlet_id: l.outlet_id ? Number(l.outlet_id) : null,
        debit: parseNumber(l.debit),
        credit: parseNumber(l.credit),
        memo: l.memo?.trim() || null,
      }));

    setSubmitting(action);
    try {
      const body = JSON.stringify({
        action,
        entry_date: entryDate,
        description: description.trim(),
        outlet_id: outletId ? Number(outletId) : null,
        attachment_url: attachment?.url || null,
        attachment_name: attachment?.name || null,
        lines: payloadLines,
      });
      const res = await api(editId ? `/finance-ho/journals/${editId}` : "/finance-ho/journals", {
        method: editId ? "PUT" : "POST",
        body,
      });
      onSuccess?.(res);
      reset();
      onClose();
    } catch (e) {
      setError(e.message || "Gagal menyimpan jurnal.");
    } finally {
      setSubmitting(null);
    }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      await api("/finance-ho/accounts/seed-default", { method: "POST" });
      await loadRefs();
    } catch (e) {
      setError(e.message);
    } finally {
      setSeeding(false);
    }
  };

  const cancel = () => {
    reset();
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={cancel} />

      <div
        className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]"
        style={{ maxHeight: "94vh" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700">
              <HiOutlineBookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400">Jurnal</p>
              <h3 className="text-base font-bold tracking-tight text-slate-800">
                {editId ? "Ubah draft jurnal manual" : "Jurnal manual"}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {error && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800">
              <HiOutlineExclamationTriangle className="h-5 w-5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Header form */}
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">No. jurnal</label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-1.5 font-mono text-xs font-bold text-slate-600">
                <HiOutlineSparkles className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="truncate">{previewNo}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Tanggal <span className="text-rose-500">*</span>
              </label>
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Cabang</label>
              <select value={outletId} onChange={(e) => setOutletId(e.target.value)} className={inputCls}>
                <option value="">Pusat</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Keterangan <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Misal: Koreksi biaya gas salah cabang"
                className={inputCls}
              />
            </div>
          </div>

          {accounts.length === 0 && !loading && (
            <div className="flex flex-col justify-between gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 sm:flex-row sm:items-center">
              <span>Belum ada akun di Master COA.</span>
              <button
                type="button"
                onClick={seed}
                disabled={seeding}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                {seeding ? "Memuat..." : "Muat akun standar"}
              </button>
            </div>
          )}

          {/* Baris jurnal */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="min-w-[260px] px-3 py-2.5">Akun</th>
                    <th className="w-36 px-3 py-2.5">Cabang</th>
                    <th className="min-w-[160px] px-3 py-2.5">Keterangan baris</th>
                    <th className="w-36 px-3 py-2.5 text-right">Debit</th>
                    <th className="w-36 px-3 py-2.5 text-right">Kredit</th>
                    <th className="w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <AccountPicker value={l.account_id} accounts={selectable} onChange={(id) => setLine(i, { account_id: id })} />
                      </td>
                      <td className="px-3 py-2">
                        <select value={l.outlet_id} onChange={(e) => setLine(i, { outlet_id: e.target.value })} className={inputCls}>
                          <option value="">Pusat</option>
                          {outlets.map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={l.memo}
                          onChange={(e) => setLine(i, { memo: e.target.value })}
                          placeholder="Opsional"
                          className={inputCls}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={l.debit}
                          onChange={(e) => {
                            const v = formatNumber(e.target.value);
                            setLine(i, { debit: v, credit: v ? "" : l.credit });
                          }}
                          className={cn(inputCls, "text-right font-semibold tabular-nums")}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={l.credit}
                          onChange={(e) => {
                            const v = formatNumber(e.target.value);
                            setLine(i, { credit: v, debit: v ? "" : l.debit });
                          }}
                          className={cn(inputCls, "text-right font-semibold tabular-nums")}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          title="Hapus baris"
                          onClick={() => setLines((p) => (p.length <= 2 ? p.map((x, idx) => (idx === i ? emptyLine() : x)) : p.filter((_, idx) => idx !== i)))}
                          className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                        >
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
                  <tr>
                    <td colSpan={3} className="px-3 py-2.5 text-right">Total</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{rupiah(totals.d)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{rupiah(totals.c)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 p-3">
              <button
                type="button"
                onClick={() => setLines((p) => [...p, emptyLine()])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                <HiOutlinePlus className="h-4 w-4 text-emerald-600" />
                Tambah baris
              </button>
              <span className="text-[11px] text-slate-400">
                Akun kas cabang, piutang QRIS/EDC, piutang usaha, dan deposit tidak tersedia di jurnal manual
              </span>
            </div>
          </div>

          {/* Status seimbang + lampiran */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold",
                totals.balanced
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              )}
            >
              {totals.balanced ? (
                <HiOutlineCheckCircle className="h-5 w-5 text-emerald-600" />
              ) : (
                <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-600" />
              )}
              {totals.balanced
                ? "Seimbang"
                : totals.diff > 0
                  ? `Belum seimbang, selisih Rp ${rupiah(totals.diff)}`
                  : "Isi minimal 2 baris bernominal"}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-500">Lampiran:</span>
              {attachment ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-700">
                  <HiOutlinePaperClip className="h-4 w-4" />
                  <span className="max-w-[180px] truncate">{attachment.name}</span>
                  <button type="button" onClick={() => setAttachment(null)} className="text-slate-400 hover:text-rose-500">
                    <HiOutlineXMark className="h-4 w-4" />
                  </button>
                </span>
              ) : (
                <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700">
                  {uploading ? "Mengunggah..." : "Pilih file (JPG, PNG, PDF)"}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      handleFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button
            type="button"
            onClick={cancel}
            disabled={Boolean(submitting)}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={Boolean(submitting) || loading}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              {submitting === "draft" ? "Menyimpan..." : "Simpan draft"}
            </button>
            <button
              type="button"
              onClick={() => handleSave("submit")}
              disabled={Boolean(submitting) || loading || !totals.balanced}
              title={totals.balanced ? "" : "Jurnal harus seimbang dulu"}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {submitting === "submit" && <HiOutlineClock className="h-4 w-4 animate-spin" />}
              Ajukan approval
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
