import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineMagnifyingGlass, HiOutlinePhoto, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../../lib/api";
import NotaModal from "../../components/NotaModal";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.abs(Number(n) || 0));
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}` : "-");
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

// Riwayat deposit reguler satu customer. Klik baris "Keluar" (pakai saldo) → rincian nota + foto bukti;
// klik baris "Masuk" (top-up) → foto bukti top-up bila ada.
export default function DepositHistoryDialog({ id, onClose }) {
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const [tipe, setTipe] = useState("");
  const [nota, setNota] = useState(null);
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    api(`/finance-ho/customers/deposit/${id}`).then(setD).catch(() => setD({ rows: [], member: { name: "-", balance: 0 } }));
  }, [id]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (d?.rows || []).filter((r) => (!tipe || r.tipe === tipe) && (!s || `${r.keterangan} ${r.kategori} ${r.sumber}`.toLowerCase().includes(s)));
  }, [d, q, tipe]);

  const open = (r) => {
    if (r.transaction_id) setNota(r.transaction_id);
    else if (r.proof) setPhoto(r.proof);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h3 className="text-base font-bold text-slate-800">Riwayat deposit {d?.member?.name}</h3>
            <p className="text-xs text-slate-500">Saldo saat ini Rp {rp(d?.member?.balance)}{d?.member?.phone ? ` · ${d.member.phone}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-slate-600"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative min-w-[200px] flex-1">
            <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari keterangan, kategori, sumber" className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs outline-none focus:border-emerald-500" />
          </div>
          {[["", "Semua Tipe"], ["Masuk", "Masuk"], ["Keluar", "Keluar"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setTipe(v)} className={cn("rounded-full px-3 py-1 text-[11px] font-bold transition", tipe === v ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{l}</button>
          ))}
        </div>

        <div className="overflow-auto">
          {!d ? (
            <p className="p-10 text-center text-xs text-slate-400">Memuat...</p>
          ) : rows.length === 0 ? (
            <p className="p-10 text-center text-xs text-slate-400">Belum ada riwayat deposit reguler.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr><th className={th}>Tipe &amp; waktu</th><th className={th}>Kategori</th><th className={th}>Sumber</th><th className={th}>Cabang</th><th className={th}>Keterangan</th><th className={th}>Bukti</th><th className={cn(th, "text-right")}>Nominal</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.key} onClick={() => open(r)} className={cn("hover:bg-emerald-50/40", (r.transaction_id || r.proof) && "cursor-pointer")}>
                    <td className="px-3 py-2.5">
                      <p className={cn("font-bold", r.tipe === "Masuk" ? "text-emerald-600" : "text-rose-600")}>{r.tipe}</p>
                      <p className="text-[10px] text-slate-400">{dmy(r.at)}</p>
                    </td>
                    <td className="px-3 py-2.5"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{r.kategori}</span></td>
                    <td className="px-3 py-2.5 text-slate-600">{r.sumber}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.outlet_name}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 font-semibold text-slate-700" title={r.keterangan}>{r.keterangan}</td>
                    <td className="px-3 py-2.5 text-slate-400">{r.has_proof ? <HiOutlinePhoto className="h-4 w-4 text-emerald-600" title="Ada foto bukti" /> : "-"}</td>
                    <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", r.nominal >= 0 ? "text-emerald-600" : "text-rose-600")}>{r.nominal >= 0 ? "+" : "-"} Rp {rp(r.nominal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {nota && <NotaModal transactionId={nota} onClose={() => setNota(null)} />}
      {photo && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4" onClick={() => setPhoto(null)}>
          <img src={photo} alt="Bukti top-up" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>,
    document.body
  );
}
