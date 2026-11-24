import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlinePencilSquare, HiOutlinePlus, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../../../lib/api";
import { HeaderActions, PrimaryButton, RefreshButton } from "../../../components/ui/PageHeader";

const cn = (...c) => c.filter(Boolean).join(" ");
const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const DIR = { IN: ["Uang masuk", "bg-emerald-50 text-emerald-700"], OUT: ["Uang keluar", "bg-rose-50 text-rose-700"], BOTH: ["Masuk & keluar", "bg-slate-100 text-slate-600"] };
const EMPTY = { label: "", direction: "IN", note: "" };

function FormModal({ item, onClose, onSaved }) {
  const [f, setF] = useState(item.id ? { label: item.label, direction: item.direction, note: item.note || "" } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const locked = item.id && item.used > 0; // sudah dipakai pencocokan: jenis tidak bisa diubah
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      if (item.id) await api(`/finance-ho/settings/payment-categories/${item.id}`, { method: "PUT", body: JSON.stringify(f) });
      else await api("/finance-ho/settings/payment-categories", { method: "POST", body: JSON.stringify(f) });
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-800">{item.id ? "Ubah kategori" : "Tambah kategori"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-6 text-xs">
          <label className="block font-semibold text-slate-600">Nama kategori <span className="text-rose-500">*</span>
            <input autoFocus value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Mis. Penerimaan penjualan harian" className={cn(inputCls, "mt-1")} />
          </label>
          <label className="block font-semibold text-slate-600">Dipakai untuk
            <select value={f.direction} disabled={locked} onChange={(e) => setF({ ...f, direction: e.target.value })} className={cn(inputCls, "mt-1 disabled:bg-slate-50")}>
              <option value="IN">Uang masuk (kredit di rekening koran)</option>
              <option value="OUT">Uang keluar (debit di rekening koran)</option>
              <option value="BOTH">Masuk dan keluar</option>
            </select>
            {locked && <span className="mt-1 block text-[11px] font-normal text-slate-400">Sudah dipakai pada pencocokan, jenisnya tidak bisa diubah. Nonaktifkan lalu buat kategori baru bila perlu.</span>}
          </label>
          <label className="block font-semibold text-slate-600">Keterangan (opsional)
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Penjelasan singkat kapan kategori ini dipakai" className={cn(inputCls, "mt-1")} />
          </label>
          {err && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
          <button type="button" disabled={busy || !f.label.trim()} onClick={save} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{busy ? "Menyimpan..." : "Simpan"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Pengaturan > Kategori payment: daftar alokasi yang dipilih Finance saat mencocokkan mutasi bank.
// Dikelola sendiri oleh Finance; kategori tidak dihapus, hanya dinonaktifkan.
export default function KategoriPayment() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState(null);
  const [showOff, setShowOff] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api("/finance-ho/settings/payment-categories")).data);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);
  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  useEffect(() => { load(); }, [load]);

  const toggle = async (r) => {
    setMsg("");
    try {
      await api(`/finance-ho/settings/payment-categories/${r.id}`, { method: "PUT", body: JSON.stringify({ is_active: !r.is_active }) });
      setMsg(r.is_active ? `“${r.label}” dinonaktifkan. Pencocokan lama tetap menampilkan namanya.` : `“${r.label}” diaktifkan kembali.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const list = (rows || []).filter((r) => showOff || r.is_active);
  const offCount = (rows || []).filter((r) => !r.is_active).length;

  return (
    <div className="space-y-4">
      <HeaderActions>
        <PrimaryButton icon={HiOutlinePlus} onClick={() => setModal(EMPTY)}>Tambah kategori</PrimaryButton>
        <RefreshButton onClick={refresh} spinning={refreshing} />
      </HeaderActions>
      <p className="max-w-2xl text-xs text-slate-500">
        Daftar ini muncul di dialog <b>Konfirmasi Matching & Alokasi</b> saat Finance mencocokkan mutasi bank. Tambah, ganti nama, atau nonaktifkan sesuai kebutuhan. Setiap kategori ditandai untuk uang masuk, uang keluar, atau keduanya.
      </p>
      {msg && <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><HiOutlineCheckCircle className="h-4 w-4" /> {msg}</p>}
      {error && <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><HiOutlineExclamationTriangle className="h-4 w-4" /> {error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-2.5">Nama kategori</th><th className="px-3 py-2.5">Dipakai untuk</th><th className="px-3 py-2.5">Keterangan</th><th className="px-3 py-2.5 text-right">Dipakai</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!rows ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-400">Memuat...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center">
                <p className="text-sm font-bold text-slate-700">Belum ada kategori</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">Tambahkan kategori untuk uang masuk dan uang keluar. Tanpa kategori, mutasi bank belum bisa dicocokkan.</p>
                <button type="button" onClick={() => setModal(EMPTY)} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">+ Tambah kategori pertama</button>
              </td></tr>
            ) : list.map((r) => (
              <tr key={r.id} className={cn(!r.is_active && "bg-slate-50/60 text-slate-400")}>
                <td className="px-4 py-3 font-semibold text-slate-800">{r.label}<span className="ml-2 font-mono text-[10px] font-normal text-slate-400">{r.code}</span></td>
                <td className="px-3 py-3"><span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold", DIR[r.direction][1])}>{DIR[r.direction][0]}</span></td>
                <td className="max-w-[260px] truncate px-3 py-3 text-slate-500" title={r.note || ""}>{r.note || "-"}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-500">{r.used}×</td>
                <td className="px-3 py-3"><span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold", r.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500")}>{r.is_active ? "Aktif" : "Nonaktif"}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <button type="button" onClick={() => setModal(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Ubah"><HiOutlinePencilSquare className="h-4 w-4" /></button>
                  <button type="button" onClick={() => toggle(r)} className="ml-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50">{r.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {offCount > 0 && (
        <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} className="accent-emerald-600" /> Tampilkan {offCount} kategori nonaktif</label>
      )}
      {modal && <FormModal item={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg("Kategori disimpan."); load(); }} />}
    </div>
  );
}
