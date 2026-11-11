import { useCallback, useEffect, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineTag } from "react-icons/hi2";
import { api } from "../../lib/api";
import FinanceOnly from "./components/FinanceOnly";
import { cn, rp, selectCls, thCls } from "./utils/format";

export default function Klasifikasi() {
  const [rows, setRows] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  useEffect(() => {
    document.title = "Klasifikasi | HO Finance";
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api("/finance-ho/purchasing/classifications");
      setRows(r.data);
      setAccounts(r.accounts);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (id, accountId) => {
    setSavingId(id);
    setError("");
    try {
      await api(`/finance-ho/purchasing/classifications/${id}/account`, {
        method: "PUT",
        body: JSON.stringify({ account_id: accountId || null }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const active = (rows || []).filter((r) => r.is_active);
  const mapped = active.filter((r) => r.account_id).length;
  const shown = (rows || []).filter((r) => !onlyEmpty || (r.is_active && !r.account_id));

  return (
    <FinanceOnly>
      <div className="space-y-5 p-4 sm:p-6">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">Pembelian</p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="rounded-xl bg-slate-100 p-2 text-slate-700"><HiOutlineTag className="h-5 w-5" /></div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Klasifikasi pengajuan</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Kategori biaya yang diisi Finance saat membayar. Tiap klasifikasi dipetakan ke akun supaya pembayaran bisa dijurnal otomatis.
            Pilih akun beban, atau akun aset bila yang dibeli berupa barang yang disusutkan. Pemetaan disimpan di alfi, tidak mengubah SuperApp.
          </p>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

        {rows && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <HiOutlineCheckCircle className={cn("h-5 w-5", mapped === active.length ? "text-emerald-600" : "text-slate-300")} />
              {mapped} dari {active.length} klasifikasi aktif sudah dipetakan
            </p>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} /> Hanya yang belum dipetakan
            </label>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className={thCls}>Klasifikasi</th>
                <th className={cn(thCls, "text-right")}>Dipakai</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Akun di jurnal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rows ? (
                <tr><td colSpan={4} className="py-10 text-center text-slate-400">Memuat...</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-slate-400">Tidak ada klasifikasi.</td></tr>
              ) : (
                shown.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-semibold text-slate-700">{r.classification_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{rp(r.usage_count)}×</td>
                    <td className="px-3 py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", r.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {r.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.account_id || ""}
                        disabled={savingId === r.id}
                        onChange={(e) => save(r.id, e.target.value)}
                        className={cn(selectCls, "w-full max-w-[320px]", !r.account_id && "border-amber-300 bg-amber-50/40")}
                      >
                        <option value="">Belum dipetakan</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </FinanceOnly>
  );
}
