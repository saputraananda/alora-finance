import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineExclamationTriangle, HiOutlinePhoto, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../lib/api";

const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const when = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)} ${String(d).slice(11, 16)}` : "-");

// Rincian nota seperti di my-waschen (read-only) + foto bukti pembayaran.
// Buka dengan transactionId (id transaksi POS) atau orderNo.
export default function NotaModal({ transactionId, orderNo, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [big, setBig] = useState(null);

  useEffect(() => {
    setD(null);
    setErr("");
    const path = transactionId ? `/finance-ho/pos/nota/${transactionId}` : `/finance-ho/pos/nota?order_no=${encodeURIComponent(orderNo || "")}`;
    api(path).then(setD).catch((e) => setErr(e.message || "Gagal memuat nota."));
  }, [transactionId, orderNo]);

  const n = d?.nota;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <p className="text-[11px] font-semibold text-slate-400">Rincian nota</p>
            <h3 className="font-mono text-base font-bold text-slate-800">{n?.order_no || orderNo || "..."}</h3>
            {n && <p className="text-xs text-slate-500">{n.outlet_name} · {when(n.order_date)}{n.cashier ? ` · Kasir ${n.cashier}` : ""}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-slate-600"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>

        <div className="overflow-auto p-5 text-xs">
          {err ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">{err}</p>
          ) : !d ? (
            <p className="py-10 text-center text-slate-400">Memuat...</p>
          ) : (
            <div className="space-y-5">
              {n.is_void && <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 p-3 font-bold text-rose-700"><HiOutlineExclamationTriangle className="h-4 w-4" /> Nota ini diajukan hapus (void) di POS.</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["Pelanggan", n.customer_name + (n.customer_phone ? ` · ${n.customer_phone}` : "")],
                  ["Kategori", n.order_category || "-"],
                  ["Kecepatan", n.speed_name || "-"],
                  ["Berat / Pcs", `${n.total_weight_kg} kg / ${n.total_pcs} pcs`],
                  ["Status bayar", n.payment_status || "-"],
                  ["Metode", n.payment_method || "-"],
                ].map(([k, v]) => (
                  <div key={k}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p><p className="mt-0.5 font-semibold text-slate-800">{v}</p></div>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                    <tr><th className="px-3 py-2">Layanan</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Harga</th><th className="px-3 py-2 text-right">Subtotal</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.items.map((i, k) => (
                      <tr key={k}>
                        <td className="px-3 py-2 font-semibold text-slate-700">{i.service_name}{i.is_cleanox && <span className="ml-1.5 rounded bg-sky-50 px-1.5 text-[9px] font-bold text-sky-700">Cleanox</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.qty} {i.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rp(i.unit_price)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{rp(i.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50/60 text-slate-600">
                    <tr><td colSpan={3} className="px-3 py-1.5 text-right">Subtotal</td><td className="px-3 py-1.5 text-right tabular-nums">{rp(n.subtotal)}</td></tr>
                    {n.speed_surcharge > 0 && <tr><td colSpan={3} className="px-3 py-1.5 text-right">Biaya kecepatan</td><td className="px-3 py-1.5 text-right tabular-nums">{rp(n.speed_surcharge)}</td></tr>}
                    {n.discount_amount > 0 && <tr><td colSpan={3} className="px-3 py-1.5 text-right">Diskon{n.discount_notes ? ` (${n.discount_notes})` : ""}</td><td className="px-3 py-1.5 text-right tabular-nums">-{rp(n.discount_amount)}</td></tr>}
                    <tr className="font-bold text-slate-800"><td colSpan={3} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right tabular-nums">Rp {rp(n.grand_total)}</td></tr>
                    <tr><td colSpan={3} className="px-3 py-1.5 text-right">Dibayar</td><td className="px-3 py-1.5 text-right tabular-nums">Rp {rp(n.paid_amount)}</td></tr>
                  </tfoot>
                </table>
              </div>

              {d.payments.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Riwayat pembayaran</p>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {d.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-slate-600">{p.at} · {p.payment_method || "-"}{p.log_type ? ` · ${p.log_type}` : ""}{p.cashier ? ` · ${p.cashier}` : ""}</span>
                        <span className="font-semibold tabular-nums text-slate-800">Rp {rp(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Bukti pembayaran</p>
                {d.proofs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-slate-400">Tidak ada foto bukti pembayaran pada nota ini.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {d.proofs.map((p, k) => (
                      <figure key={k} className="overflow-hidden rounded-xl border border-slate-200">
                        {p.url ? (
                          <button type="button" onClick={() => setBig(p.url)} className="block w-full"><img src={p.url} alt={p.label} className="h-36 w-full object-cover" loading="lazy" /></button>
                        ) : (
                          <div className="flex h-36 flex-col items-center justify-center gap-1 bg-slate-50 p-2 text-center text-[10px] text-slate-400"><HiOutlinePhoto className="h-6 w-6" />Foto belum bisa ditampilkan (alamat server foto POS belum diatur)</div>
                        )}
                        <figcaption className="truncate px-2 py-1.5 text-[10px] text-slate-500" title={p.label}>{p.label}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {big && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4" onClick={() => setBig(null)}>
          <img src={big} alt="Bukti pembayaran" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>,
    document.body
  );
}
