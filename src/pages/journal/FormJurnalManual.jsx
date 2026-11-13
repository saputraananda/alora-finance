import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineArrowLeft,
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
import DetailAkunDialog from "./DetailAkunDialog";

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


const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

// ── Pilihan akun yang bisa dicari dengan kode atau nama ─────────────────
// Daftar dirender lewat portal (position: fixed) supaya tidak terpotong oleh overflow tabel/modal,
// dan mengikuti posisi kolom saat halaman di-scroll. Bila ruang di bawah kurang, daftar naik ke atas.
function AccountPicker({ value, accounts, onChange, placeholder = "Cari kode atau nama akun" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const listRef = useRef(null);
  const selected = accounts.find((a) => String(a.id) === String(value));

  useEffect(() => {
    const close = (e) => {
      if (ref.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Hitung posisi daftar dari kotak input; perbarui saat scroll/resize
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const maxH = 224; // 14rem
      const below = window.innerHeight - r.bottom - 12;
      const up = below < Math.min(maxH, 160) && r.top > below;
      setPos({
        left: r.left,
        width: r.width,
        maxHeight: Math.max(120, Math.min(maxH, up ? r.top - 12 : below)),
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? accounts.filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(t)) : accounts).slice(0, 60);
  }, [q, accounts]);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={open ? q : selected ? `${selected.code} ${selected.name}` : ""}
        placeholder={placeholder}
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
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            className="z-[10001] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          >
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
          </div>,
          document.body
        )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HALAMAN JURNAL MANUAL (Jurnal > Jurnal manual)
//   /finance-ho/jurnal-umum/baru        → jurnal baru
//   /finance-ho/jurnal-umum/:id/ubah    → ubah draft yang sudah ada
// Halaman penuh (bukan modal); satu-satunya dialog adalah "Detail Akun" saat mengisi baris.
// ════════════════════════════════════════════════════════════════════════════
const LIST_PATH = "/finance-ho/jurnal-umum";

export default function FormJurnalManual() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const [entryDate, setEntryDate] = useState(todayLocal());
  const [description, setDescription] = useState("");
  const [outletId, setOutletId] = useState("");
  const [lines, setLines] = useState([]);
  const [dialog, setDialog] = useState(null); // {index: number | null (baris baru), account_id}
  const [attachment, setAttachment] = useState(null); // {url, name}
  const [uploading, setUploading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [restricted, setRestricted] = useState([]);
  const [entryNo, setEntryNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(null); // 'post' (simpan langsung diposting)
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);

  const reset = useCallback(() => {
    setEntryDate(todayLocal());
    setDescription("");
    setOutletId("");
    setLines([]);
    setDialog(null);
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
  }, [editId, loadRefs, reset]);

  // Akun kas/piutang/deposit tidak boleh dipakai di jurnal manual
  const selectable = useMemo(() => accounts.filter((a) => !restricted.includes(Number(a.id))), [accounts, restricted]);

  const previewNo = useMemo(() => {
    if (entryNo) return entryNo;
    const [y, m, d] = (entryDate || todayLocal()).split("-");
    return `JM-${y.slice(2)}${m}${d}-NN (otomatis)`;
  }, [entryNo, entryDate]);

  const accountOf = (id) => accounts.find((a) => String(a.id) === String(id));

  // Nilai awal dialog. Baris yang diubah: isi baris itu. Baris baru: bila jurnal belum seimbang,
  // sisi diisi lawan dari sisi yang lebih besar dan nominal diisi selisihnya (seperti Accurate).
  const dialogInitial = () => {
    const l = dialog?.index != null ? lines[dialog.index] : null;
    if (!l) {
      const diff = totals.d - totals.c;
      const gap = Math.abs(diff) >= 0.005;
      return { side: gap && diff > 0 ? "credit" : "debit", amount: gap ? formatNumber(Math.round(Math.abs(diff))) : "", memo: "" };
    }
    return { side: parseNumber(l.credit) > 0 ? "credit" : "debit", amount: l.credit || l.debit, memo: l.memo };
  };

  // "Lanjut" di dialog: simpan baris baru atau perbarui baris yang diubah
  const saveDialog = (v) => {
    const line = {
      account_id: dialog.account_id,
      debit: v.side === "debit" ? v.amount : "",
      credit: v.side === "credit" ? v.amount : "",
      memo: v.memo,
    };
    setLines((p) => (dialog.index != null ? p.map((l, i) => (i === dialog.index ? line : l)) : [...p, line]));
    setDialog(null);
  };

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
    if (action !== "draft" && !totals.balanced) {
      return setError("Jurnal belum seimbang atau belum punya minimal 2 baris bernominal.");
    }
    const payloadLines = lines
      .filter((l) => parseNumber(l.debit) > 0 || parseNumber(l.credit) > 0 || l.account_id)
      .map((l) => ({
        account_id: l.account_id ? Number(l.account_id) : null,
        outlet_id: outletId ? Number(outletId) : null, // semua baris mengikuti Cabang di header
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
      navigate(LIST_PATH, { state: { toast: `${res.message} (${res.entry_no})` } });
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

  const cancel = () => navigate(LIST_PATH);

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8">
      <div className="mx-auto max-w-screen-xl space-y-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={cancel}
            title="Kembali ke daftar jurnal"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <HiOutlineArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700">
              <HiOutlineBookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400">Jurnal</p>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800">
                {editId ? "Ubah jurnal manual (draft)" : "Jurnal manual"}
              </h1>
            </div>
          </div>
        </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-5 p-6">
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
                    <th className="w-28 px-3 py-2.5">Kode #</th>
                    <th className="min-w-[220px] px-3 py-2.5">Nama Perkiraan</th>
                    <th className="w-36 px-3 py-2.5 text-right">Debit</th>
                    <th className="w-36 px-3 py-2.5 text-right">Kredit</th>
                    <th className="w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-400">
                        Belum ada baris. Pilih akun di bawah untuk menambahkan.
                      </td>
                    </tr>
                  )}
                  {lines.map((l, i) => {
                    const acc = accountOf(l.account_id);
                    return (
                      <tr
                        key={i}
                        title="Klik untuk mengubah baris"
                        onClick={() => setDialog({ index: i, account_id: l.account_id })}
                        className="cursor-pointer hover:bg-emerald-50/40"
                      >
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{acc?.code}</td>
                        <td className="px-3 py-2.5 text-slate-600">{acc?.name || `Akun #${l.account_id}`}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800">{rupiah(parseNumber(l.debit))}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800">{rupiah(parseNumber(l.credit))}</td>
                        <td className="px-2 py-2.5 text-center">
                          <button
                            type="button"
                            title="Hapus baris"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLines((p) => p.filter((_, idx) => idx !== i));
                            }}
                            className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                          >
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 sm:w-96">
                <HiOutlinePlus className="h-4 w-4 shrink-0 text-emerald-600" />
                <div className="flex-1">
                  <AccountPicker
                    value=""
                    accounts={selectable}
                    placeholder="Pilih akun untuk menambah baris"
                    onChange={(id) => setDialog({ index: null, account_id: id })}
                  />
                </div>
              </div>
              <span className="text-[11px] text-slate-400">
                Akun kas cabang, piutang QRIS/EDC, piutang usaha, dan deposit tidak tersedia di jurnal manual
              </span>
            </div>
          </div>

          {/* Ringkasan total */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Debit</p>
              <p className="mt-0.5 text-base font-extrabold tabular-nums text-slate-800">Rp {rupiah(totals.d)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Credit</p>
              <p className="mt-0.5 text-base font-extrabold tabular-nums text-slate-800">Rp {rupiah(totals.c)}</p>
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

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button
            type="button"
            onClick={cancel}
            disabled={Boolean(submitting)}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => handleSave("post")}
            disabled={Boolean(submitting) || loading || !totals.balanced}
            title={totals.balanced ? "" : "Jurnal harus seimbang dulu"}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {submitting === "post" && <HiOutlineClock className="h-4 w-4 animate-spin" />}
            {submitting === "post" ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
      </div>
      {dialog && accountOf(dialog.account_id) && (
        <DetailAkunDialog
          key={`${dialog.index}-${dialog.account_id}`}
          account={accountOf(dialog.account_id)}
          initial={dialogInitial()}
          onSave={saveDialog}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
