import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineArrowDown, HiOutlineArrowUp, HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlinePencilSquare, HiOutlinePlus, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../../../lib/api";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import { HeaderActions, PrimaryButton, RefreshButton } from "../../../components/ui/PageHeader";

const cn = (...c) => c.filter(Boolean).join(" ");
const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const BASE = "/finance-ho/assets/categories";

function FormModal({ item, onClose, onSaved }) {
  const [name, setName] = useState(item.id ? item.name : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      if (item.id) await api(`${BASE}/${item.id}`, { method: "PUT", body: JSON.stringify({ name: name.trim() }) });
      else await api(BASE, { method: "POST", body: JSON.stringify({ name: name.trim() }) });
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
          <h3 className="text-base font-bold text-slate-800">{item.id ? "Ubah kategori aset" : "Tambah kategori aset"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-6 text-xs">
          <label className="block font-semibold text-slate-600">Nama kategori <span className="text-rose-500">*</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && !busy && save()} placeholder="Mis. Mesin cuci" className={cn(inputCls, "mt-1")} />
          </label>
          {err && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
          <button type="button" disabled={busy || !name.trim()} onClick={save} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{busy ? "Menyimpan..." : "Simpan"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Pengaturan > Kategori Aset: daftar kategori Aset Tetap yang dikelola Finance.
export default function KategoriAset() {
  const [rows, setRows] = useState(null);
  const [uncategorized, setUncategorized] = useState(0);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api(BASE);
      setRows(res.data || []);
      setUncategorized(Number(res.uncategorized) || 0);
      setError("");
    } catch (e) {
      setError(e.message);
      setRows((r) => r || []);
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
      await api(`${BASE}/${r.id}`, { method: "PUT", body: JSON.stringify({ is_active: !r.is_active }) });
      setMsg(r.is_active ? `“${r.name}” dinonaktifkan.` : `“${r.name}” diaktifkan kembali.`);
      setError("");
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  // Tukar urutan dengan tetangga. Bila sort_order sama, pakai posisi di daftar agar tetap berubah.
  const move = async (i, dir) => {
    const a = rows[i];
    const b = rows[i + dir];
    if (!a || !b || busy) return;
    setBusy(true);
    setMsg("");
    try {
      let sa = Number(a.sort_order) || 0;
      let sb = Number(b.sort_order) || 0;
      if (sa === sb) { sa = i; sb = i + dir; }
      await api(`${BASE}/${a.id}`, { method: "PUT", body: JSON.stringify({ sort_order: sb }) });
      await api(`${BASE}/${b.id}`, { method: "PUT", body: JSON.stringify({ sort_order: sa }) });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      load();
    }
  };

  const doDelete = async () => {
    const r = confirm;
    setBusy(true);
    try {
      const res = await api(`${BASE}/${r.id}`, { method: "DELETE" });
      setMsg(res?.message || `“${r.name}” dihapus.`);
      setError("");
      setConfirm(null);
      load();
    } catch (e) {
      setError(e.message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const arrowCls = "rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="space-y-4">
      <HeaderActions>
        <PrimaryButton icon={HiOutlinePlus} onClick={() => setModal({})}>Tambah kategori</PrimaryButton>
        <RefreshButton onClick={refresh} spinning={refreshing} />
      </HeaderActions>
      <p className="max-w-2xl rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <b className="tabular-nums">{uncategorized}</b> aset belum punya kategori
      </p>
      {msg && <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><HiOutlineCheckCircle className="h-4 w-4" /> {msg}</p>}
      {error && <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><HiOutlineExclamationTriangle className="h-4 w-4" /> {error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-2.5">Urutan</th><th className="px-3 py-2.5">Nama kategori</th><th className="px-3 py-2.5 text-right">Jumlah aset</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!rows ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-400">Memuat...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center">
                <p className="text-sm font-bold text-slate-700">Belum ada kategori aset</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">Tambahkan kategori agar aset tetap bisa dikelompokkan.</p>
                <button type="button" onClick={() => setModal({})} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">+ Tambah kategori pertama</button>
              </td></tr>
            ) : rows.map((r, i) => {
              const used = Number(r.asset_count) > 0;
              return (
                <tr key={r.id} className={cn(!r.is_active && "bg-slate-50/60 text-slate-400")}>
                  <td className="whitespace-nowrap px-4 py-2">
                    <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className={arrowCls} title="Naikkan" aria-label="Naikkan"><HiOutlineArrowUp className="h-4 w-4" /></button>
                    <button type="button" disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)} className={arrowCls} title="Turunkan" aria-label="Turunkan"><HiOutlineArrowDown className="h-4 w-4" /></button>
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-800">{r.name}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-500">{r.asset_count}</td>
                  <td className="px-3 py-3"><span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold", r.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500")}>{r.is_active ? "Aktif" : "Nonaktif"}</span></td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <button type="button" onClick={() => setModal(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Ubah"><HiOutlinePencilSquare className="h-4 w-4" /></button>
                    <button type="button" onClick={() => toggle(r)} className="ml-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50">{r.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                    <button
                      type="button"
                      disabled={used}
                      onClick={() => setConfirm(r)}
                      title={used ? `Masih dipakai ${r.asset_count} aset, nonaktifkan saja` : "Hapus"}
                      className="ml-1 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
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

      {modal && <FormModal item={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg("Kategori disimpan."); load(); }} />}
      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="Hapus kategori aset?"
        desc={confirm ? `Kategori “${confirm.name}” akan dihapus permanen.` : ""}
        loading={busy}
        onConfirm={doDelete}
      />
    </div>
  );
}
