import { useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineXMark } from "react-icons/hi2";
import { api } from "../lib/api";

// Modal Form Akun (Bisa Tambah Baru atau Edit)
export function ModalFormAkun({ account, accounts = [], onClose, onSuccess }) {
  const isEdit = Boolean(account && account.id);

  const [code, setCode] = useState(account?.code || "");
  const [name, setName] = useState(account?.name || "");
  const [type, setType] = useState(account?.type || "ASET");
  const [normalBalance, setNormalBalance] = useState(
    account?.normal_balance || "DEBIT"
  );
  const [parentId, setParentId] = useState(account?.parent_id ? String(account.parent_id) : "");
  const [isHeader, setIsHeader] = useState(Boolean(account?.is_header));
  const [memo, setMemo] = useState(account?.memo || "");
  const [isActive, setIsActive] = useState(account?.is_active ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Otomatis ubah normalBalance saat type berubah (jika tambah baru)
  const handleTypeChange = (newType) => {
    setType(newType);
    if (!isEdit) {
      if (["ASET", "BEBAN"].includes(newType)) {
        setNormalBalance("DEBIT");
      } else {
        setNormalBalance("KREDIT");
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!code.trim()) {
      setError("Kode akun wajib diisi.");
      return;
    }
    if (!name.trim()) {
      setError("Nama akun wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        type,
        normal_balance: normalBalance,
        parent_id: parentId ? Number(parentId) : null,
        is_header: isHeader ? 1 : 0,
        is_active: isActive ? 1 : 0,
        memo: memo.trim(),
      };

      if (isEdit) {
        await api(`/finance-ho/accounts/${account.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        const res = await api("/finance-ho/accounts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (onSuccess) onSuccess(res.data);
        return;
      }

      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || "Gagal menyimpan akun.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]"
        style={{ maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/50">
          <h2 className="text-base font-bold text-slate-800">
            {isEdit ? "Edit Akun" : "Tambah Akun Baru"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* Kategori Akun */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Kategori Akun <span className="text-rose-500">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ASET">Aset (Harta)</option>
              <option value="KEWAJIBAN">Kewajiban (Utang)</option>
              <option value="EKUITAS">Ekuitas (Modal)</option>
              <option value="PENDAPATAN">Pendapatan</option>
              <option value="BEBAN">Beban (Biaya)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Kode Akun */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Kode Akun <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Misal: 1-1200"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Saldo Normal */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Saldo Normal <span className="text-rose-500">*</span>
              </label>
              <select
                value={normalBalance}
                onChange={(e) => setNormalBalance(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="DEBIT">DEBIT</option>
                <option value="KREDIT">KREDIT</option>
              </select>
            </div>
          </div>

          {/* Nama Akun */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Nama Akun <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Misal: Bank BCA Operasional, Kas Kecil..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Parent Akun */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Akun Induk / Parent (Opsional)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">-- Tanpa Induk (Akun Utama) --</option>
              {accounts
                .filter((a) => !account || a.id !== account.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Keterangan */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Keterangan / Memo (Opsional)
            </label>
            <textarea
              rows="2"
              placeholder="Catatan tambahan tentang akun ini..."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Checkboxes: Header & Status Aktif */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_header"
                checked={isHeader}
                onChange={(e) => setIsHeader(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
              />
              <label htmlFor="is_header" className="text-xs font-medium text-slate-700 cursor-pointer">
                Jadikan Akun Header / Kategori (tidak menampung transaksi langsung)
              </label>
            </div>

            {isEdit && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={Boolean(isActive)}
                  onChange={(e) => setIsActive(e.target.checked ? 1 : 0)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <label htmlFor="is_active" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Akun Aktif (bisa digunakan dalam jurnal)
                </label>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-md shadow-emerald-600/20 active:scale-95"
            >
              {saving ? "Menyimpan..." : isEdit ? "Perbarui Akun" : "Simpan Akun"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default ModalFormAkun;
