import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlinePencilSquare, HiOutlineXMark } from "react-icons/hi2";

const cn = (...c) => c.filter(Boolean).join(" ");
const formatNumber = (v) => String(v ?? "").replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const fieldCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

function Row({ label, required, children }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-start gap-3">
      <label className="pt-2 text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      <div>{children}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DIALOG DETAIL AKUN (Jurnal manual) — muncul setelah user memilih akun, alur seperti Accurate.
// Isi: nilai debit/kredit, nominal, memo. Cabang tidak diisi di sini: semua baris mengikuti Cabang di header form.
// Props: account {code, name} · initial {side, amount, memo} · onSave(values) · onClose
// Untuk baris baru, `initial` sudah berisi sisi lawan & nominal selisih (diisi pemanggil).
// ════════════════════════════════════════════════════════════════════════════
export default function DetailAkunDialog({ account, initial, onSave, onClose }) {
  const [side, setSide] = useState(initial.side || "debit");
  const [amount, setAmount] = useState(initial.amount || "");
  const [memo, setMemo] = useState(initial.memo || "");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const n = Number(String(amount).replace(/\./g, ""));
    if (!(n > 0)) {
      return setError("Nominal harus lebih dari 0.");
    }
    onSave({ side, amount, memo: memo.trim() });
  };

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl" style={{ minHeight: 380 }}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700">
              <HiOutlinePencilSquare className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold tracking-tight text-slate-800">Detail Akun</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup">
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 px-6 py-5">
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

              <Row label="Kode #">
                <p className="pt-2 font-mono text-sm font-bold text-emerald-700">{account.code}</p>
              </Row>
              <Row label="Nama Perkiraan">
                <input readOnly value={account.name} className={cn(fieldCls, "cursor-default bg-slate-50 text-slate-600")} />
              </Row>
              <Row label="Nilai" required>
                <div className="flex items-center gap-6 pt-2 text-sm text-slate-700">
                  {[
                    { key: "debit", label: "Debit" },
                    { key: "credit", label: "Kredit" },
                  ].map((o) => (
                    <label key={o.key} className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name="side" checked={side === o.key} onChange={() => setSide(o.key)} className="h-4 w-4 accent-emerald-600" />
                      {o.label}
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex w-56 overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10">
                  <span className="flex items-center bg-slate-50 px-3 text-[11px] font-semibold text-slate-500">Rp</span>
                  <input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => {
                      setAmount(formatNumber(e.target.value));
                      setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    className="w-full px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-800 outline-none"
                  />
                </div>
              </Row>
              <Row label="Memo">
                <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} placeholder="Opsional" className={cn(fieldCls, "resize-none")} />
              </Row>
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={submit} className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700">
            Lanjut
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
