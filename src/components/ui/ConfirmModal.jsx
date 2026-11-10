import { createPortal } from "react-dom";
import { HiOutlineExclamationTriangle, HiOutlineTrash } from "react-icons/hi2";

function cn(...c) {
  return c.filter(Boolean).join(" ");
}

// Dialog konfirmasi standar (StrukturCode §13.4) — dirender lewat portal ke document.body.
// tone: "danger" (hapus) | "warning" (aksi berisiko)
export default function ConfirmModal({ open, onClose, onConfirm, title, desc, confirmLabel = "Hapus", loading, tone = "danger" }) {
  if (!open) return null;
  const danger = tone === "danger";
  const Icon = danger ? HiOutlineTrash : HiOutlineExclamationTriangle;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-xl shadow-inner", danger ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600")}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {desc && <p className="text-xs leading-relaxed text-slate-400">{desc}</p>}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50 active:scale-95">
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition active:scale-95 disabled:opacity-60",
              danger ? "bg-rose-600 shadow-md shadow-rose-600/20 hover:bg-rose-700" : "bg-amber-600 shadow-md shadow-amber-600/20 hover:bg-amber-700"
            )}
          >
            {loading ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
