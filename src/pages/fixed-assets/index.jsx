import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  HiOutlineArrowsRightLeft,
  HiOutlineBuildingOffice2,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import { currentCutoffKey, cutoffMonthLabel, cutoffRangeLabel, recentCutoffKeys, todayWib } from "../../lib/cutoff";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";
const STATUS = {
  AKTIF: "border-emerald-200 bg-emerald-50 text-emerald-700",
  DIJUAL: "border-slate-200 bg-slate-50 text-slate-500",
  DIHAPUS: "border-slate-200 bg-slate-50 text-slate-500",
};

function Modal({ title, subtitle, onClose, footer, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]" style={{ maxHeight: "92vh" }}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50"><HiOutlineXMark className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5 text-xs font-semibold text-slate-500">{children}</div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">{footer}</div>
      </div>
    </div>,
    document.body
  );
}

const emptyForm = { code: "", name: "", category: "", outlet_id: "", acquisition_date: "", cost: "", salvage: "0", opening_accum: "0", life_months: "60", notes: "" };

export default function AsetTetap() {
  const [month, setMonth] = useState(currentCutoffKey());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [modal, setModal] = useState(null); // {kind: form|move|dispose, ...}

  useEffect(() => {
    document.title = "Aset Tetap | HO Finance";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [y, m] = month.split("-").map(Number);
      setData(await api(`/finance-ho/assets?year=${y}&month=${m}`));
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      setMsg({ type: "ok", text: res.message });
      setModal(null);
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const f = modal?.form;
  const setF = (patch) => setModal((m) => ({ ...m, form: { ...m.form, ...patch } }));
  const [y, m] = month.split("-").map(Number);
  const dep = data?.depreciation;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">Aset Tetap</p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="rounded-xl bg-violet-50 p-2 text-violet-700"><HiOutlineBuildingOffice2 className="h-5 w-5" /></div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Daftar aset</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">Setiap mesin tercatat per unit dan per cabang. Penyusutan garis lurus per bulan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Periode:
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={cn(inputCls, "w-auto")} title={cutoffRangeLabel(month)}>
              {recentCutoffKeys(18).map((k) => <option key={k} value={k}>{cutoffMonthLabel(k)}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setModal({ kind: "form", form: { ...emptyForm, acquisition_date: todayWib() } })} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
            <HiOutlinePlus className="h-4 w-4" /> Aset baru
          </button>
        </div>
      </div>

      {msg && (
        <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs font-medium", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {msg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">Memuat aset...</div>
      ) : data && (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr><th className={th}>Kode</th><th className={th}>Aset</th><th className={th}>Lokasi</th><th className={th}>Perolehan</th><th className={cn(th, "text-right")}>Harga</th><th className={cn(th, "text-right")}>Nilai buku</th><th className={cn(th, "text-right")}>Susut/bln</th><th className={th}>Status</th><th className={th} /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.assets.length === 0 ? (
                    <tr><td colSpan={9} className="py-10 text-center text-slate-400">Belum ada aset. Tambahkan mesin, peralatan, atau renovasi per cabang.</td></tr>
                  ) : (
                    data.assets.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{a.code}</td>
                        <td className="px-3 py-2.5"><p className="font-semibold text-slate-800">{a.name}</p>{a.category && <p className="text-[10px] text-slate-400">{a.category}</p>}</td>
                        <td className="px-3 py-2.5 text-slate-600">{a.outlet_name}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-500">{dmy(a.acquisition_date)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{rp(a.cost)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rp(a.book_value)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{rp(a.monthly)}</td>
                        <td className="px-3 py-2.5"><span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", STATUS[a.status])}>{a.status === "AKTIF" ? "Aktif" : a.status === "DIJUAL" ? `Dijual ${dmy(a.disposed_at)}` : `Dihapus ${dmy(a.disposed_at)}`}</span></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <button type="button" title="Ubah" onClick={() => setModal({ kind: "form", id: a.id, locked: a.has_depreciation, form: { ...a, outlet_id: a.outlet_id || "", category: a.category || "", notes: a.notes || "" } })} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-emerald-400 hover:text-emerald-700"><HiOutlinePencilSquare className="h-4 w-4" /></button>
                          {a.status === "AKTIF" && (
                            <>
                              <button type="button" title="Pindah lokasi" onClick={() => setModal({ kind: "move", asset: a, form: { to_outlet: "", date: todayWib(), note: "" } })} className="ml-1.5 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-emerald-400 hover:text-emerald-700"><HiOutlineArrowsRightLeft className="h-4 w-4" /></button>
                              <button type="button" onClick={() => setModal({ kind: "dispose", asset: a, form: { type: "DIJUAL", date: todayWib(), note: "" } })} className="ml-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-50">Jual / hapus</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <p className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-extrabold text-slate-700">Penyusutan {cutoffMonthLabel(month)}</p>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {dep.by_outlet.length === 0 && <tr><td className="px-4 py-4 text-slate-400">Tidak ada aset yang disusutkan pada periode ini.</td></tr>}
                  {dep.by_outlet.map((o) => <tr key={o.outlet_id ?? "p"}><td className="px-4 py-2">{o.outlet_name}</td><td className="px-4 py-2 text-right tabular-nums">{rp(o.amount)}</td></tr>)}
                  <tr className="bg-slate-50 font-extrabold"><td className="px-4 py-2">Total</td><td className="px-4 py-2 text-right tabular-nums">{rp(dep.total)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <p>
                Jurnal: <strong>Dr Beban Penyusutan · Cr Akumulasi Penyusutan</strong>, cabang mengikuti lokasi aset, dicatat pada akhir periode cutoff.
                Jurnal perolehan dan pelepasan aset (laba/rugi penjualan) dibuat lewat jurnal manual.
              </p>
              {dep.journal?.status === "POSTED" ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">Sudah diposting: {dep.journal.entry_no}. Untuk mengulang, balik jurnalnya di menu Jurnal.</p>
              ) : (
                <div className="flex justify-end">
                  <button type="button" disabled={!dep.can_run || busy} onClick={() => call(() => api("/finance-ho/assets/depreciation", { method: "POST", body: JSON.stringify({ year: y, month: m }) }))} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
                    {busy ? "Memproses..." : `Jalankan penyusutan ${cutoffMonthLabel(month).split(" ")[0]}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {modal?.kind === "form" && (
        <Modal
          title={modal.id ? `Ubah aset ${f.code}` : "Aset baru"}
          subtitle={modal.locked ? "Nilai keuangan terkunci karena aset sudah pernah disusutkan." : "Penyusutan garis lurus: (harga − nilai sisa − akumulasi awal) habis dalam sisa umur."}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="button" disabled={busy} onClick={() => call(() => api(modal.id ? `/finance-ho/assets/${modal.id}` : "/finance-ho/assets", { method: modal.id ? "PUT" : "POST", body: JSON.stringify(f) }))} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan"}</button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">Kode<input className={inputCls} value={f.code} onChange={(e) => setF({ code: e.target.value })} placeholder="MC-A-01" /></label>
            <label className="space-y-1">Kategori<input className={inputCls} value={f.category} onChange={(e) => setF({ category: e.target.value })} placeholder="Mesin / Renovasi" /></label>
          </div>
          <label className="block space-y-1">Nama aset<input className={inputCls} value={f.name} onChange={(e) => setF({ name: e.target.value })} placeholder="Mesin cuci 20 kg" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">Lokasi
              <select disabled={modal.locked} className={inputCls} value={f.outlet_id} onChange={(e) => setF({ outlet_id: e.target.value })}>
                <option value="">Pusat</option>
                {data.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label className="space-y-1">Tanggal perolehan<input disabled={modal.locked} type="date" className={inputCls} value={f.acquisition_date} onChange={(e) => setF({ acquisition_date: e.target.value })} /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">Harga perolehan (Rp)<input disabled={modal.locked} type="number" className={cn(inputCls, "text-right")} value={f.cost} onChange={(e) => setF({ cost: e.target.value })} /></label>
            <label className="space-y-1">Umur (bulan)<input disabled={modal.locked} type="number" className={cn(inputCls, "text-right")} value={f.life_months} onChange={(e) => setF({ life_months: e.target.value })} /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">Nilai sisa (Rp)<input disabled={modal.locked} type="number" className={cn(inputCls, "text-right")} value={f.salvage} onChange={(e) => setF({ salvage: e.target.value })} /></label>
            <label className="space-y-1">Akumulasi awal (Rp)<input disabled={modal.locked} type="number" className={cn(inputCls, "text-right")} value={f.opening_accum} onChange={(e) => setF({ opening_accum: e.target.value })} /></label>
          </div>
          <p className="text-[10px] font-normal text-slate-400">Akumulasi awal = penyusutan yang sudah terjadi sebelum alfi dipakai (untuk aset lama). Samakan dengan saldo awal akun Akumulasi Penyusutan.</p>
          <label className="block space-y-1">Catatan<input className={inputCls} value={f.notes} onChange={(e) => setF({ notes: e.target.value })} /></label>
        </Modal>
      )}

      {modal?.kind === "move" && (
        <Modal
          title={`Pindah lokasi ${modal.asset.code}`}
          subtitle={`Sekarang di ${modal.asset.outlet_name}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="button" disabled={busy} onClick={() => call(() => api(`/finance-ho/assets/${modal.asset.id}/move`, { method: "POST", body: JSON.stringify(f) }))} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Pindahkan</button>
            </>
          }
        >
          <label className="block space-y-1">Lokasi tujuan
            <select className={inputCls} value={f.to_outlet} onChange={(e) => setF({ to_outlet: e.target.value })}>
              <option value="">Pusat</option>
              {data.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="block space-y-1">Tanggal pindah<input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ date: e.target.value })} /></label>
          <label className="block space-y-1">Catatan<input className={inputCls} value={f.note} onChange={(e) => setF({ note: e.target.value })} /></label>
        </Modal>
      )}

      {modal?.kind === "dispose" && (
        <Modal
          title={`Lepas aset ${modal.asset.code}`}
          subtitle={`Nilai buku Rp ${rp(modal.asset.book_value)}. Penyusutan berhenti; jurnal laba/rugi pelepasan dibuat lewat jurnal manual.`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="button" disabled={busy} onClick={() => call(() => api(`/finance-ho/assets/${modal.asset.id}/dispose`, { method: "POST", body: JSON.stringify(f) }))} className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50">Lepas aset</button>
            </>
          }
        >
          <label className="block space-y-1">Jenis
            <select className={inputCls} value={f.type} onChange={(e) => setF({ type: e.target.value })}>
              <option value="DIJUAL">Dijual</option>
              <option value="DIHAPUS">Dihapus / rusak</option>
            </select>
          </label>
          <label className="block space-y-1">Tanggal<input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ date: e.target.value })} /></label>
          <label className="block space-y-1">Catatan<input className={inputCls} value={f.note} onChange={(e) => setF({ note: e.target.value })} /></label>
        </Modal>
      )}
    </div>
  );
}
