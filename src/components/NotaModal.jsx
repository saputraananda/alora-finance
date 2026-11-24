import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineChevronDown, HiOutlineChevronUp, HiOutlineExclamationTriangle, HiOutlinePhoto, HiOutlineReceiptPercent, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../lib/api";

const WINE = "#5f1340";
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const when = (d) => {
  const s = String(d || "");
  if (s.length < 16) return "-";
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1] || ""} ${s.slice(0, 4)}, ${s.slice(11, 13)}.${s.slice(14, 16)}`;
};

const STEP_PCT = { Antrean: 10, Diterima: 10, Pencucian: 25, "Proses Cuci": 25, Penyetrikaan: 50, "Proses Setrika": 50, Pengemasan: 75, "Proses Packing": 75, "Siap Diambil": 90, "Siap Diantar": 90, Delivery: 90, "Sedang Diantar": 95, Selesai: 100, Dibatalkan: 0 };
const pctOf = (v) => {
  if (v == null || v === "") return 10;
  if (/^-?\d+(\.\d+)?$/.test(String(v).trim())) return Number(v);
  return STEP_PCT[v] ?? 10;
};
const pctTone = (p) => (p <= 0 ? "border-rose-200 bg-rose-50 text-rose-700" : p < 50 ? "border-slate-200 bg-slate-100 text-slate-700" : p < 90 ? "border-sky-200 bg-sky-50 text-sky-800" : p < 100 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800");
const STATUS_TONE = {
  Antrean: "border-slate-200 bg-slate-100 text-slate-600", Diterima: "border-slate-200 bg-slate-100 text-slate-600",
  Pencucian: "border-sky-200 bg-sky-50 text-sky-700", Penyetrikaan: "border-indigo-200 bg-indigo-50 text-indigo-700",
  Pengemasan: "border-purple-200 bg-purple-50 text-purple-700", "Siap Diambil": "border-amber-200 bg-amber-50 text-amber-700",
  "Siap Diantar": "border-blue-200 bg-blue-50 text-blue-700", "Sedang Diantar": "border-cyan-200 bg-cyan-50 text-cyan-700",
  Selesai: "border-emerald-200 bg-emerald-50 text-emerald-700", Dibatalkan: "border-rose-200 bg-rose-50 text-rose-700",
};
const tone = (s) => STATUS_TONE[s] || STATUS_TONE.Antrean;

const Label = ({ children }) => <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{children}</p>;
const Card = ({ className = "", children }) => <div className={`min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 ${className}`}>{children}</div>;

function Proof({ p, onOpen }) {
  const [bad, setBad] = useState(false);
  const isPdf = /\.pdf($|\?)/i.test(p.path || p.url || "");
  const showImg = p.url && !bad && !isPdf;
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {showImg ? (
        <button type="button" onClick={() => onOpen(p.url)} className="block w-full"><img src={p.url} alt={p.label} onError={() => setBad(true)} className="h-32 w-full object-cover" loading="lazy" /></button>
      ) : p.url && isPdf ? (
        <a href={p.url} target="_blank" rel="noreferrer" className="flex h-32 flex-col items-center justify-center gap-1 bg-slate-50 p-2 text-center text-[11px] font-bold underline" style={{ color: WINE }}>Lihat PDF bukti bayar</a>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-1 bg-slate-50 p-2 text-center text-[10px] text-slate-400">
          <HiOutlinePhoto className="h-6 w-6" />
          <span className="font-semibold">Foto tidak dapat dimuat</span>
          {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="max-w-full break-all underline">{p.path}</a> : <span className="max-w-full break-all font-mono">{p.path || "-"}</span>}
        </div>
      )}
      <figcaption className="truncate px-2 py-1.5 text-[10px] text-slate-500" title={p.label}>{p.label}</figcaption>
    </figure>
  );
}

// Rincian nota seperti "Rincian Nota" di my-waschen (read-only) + foto bukti pembayaran.
// Buka dengan transactionId (id transaksi POS) atau orderNo.
export default function NotaModal({ transactionId, orderNo, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [big, setBig] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    setD(null);
    setErr("");
    setOpen(null);
    const path = transactionId ? `/finance-ho/pos/nota/${transactionId}` : `/finance-ho/pos/nota?order_no=${encodeURIComponent(orderNo || "")}`;
    api(path).then(setD).catch((e) => setErr(e.message || "Gagal memuat nota."));
  }, [transactionId, orderNo]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (big) setBig(null);
      else onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big, onClose]);

  const n = d?.nota;
  const items = d?.items || [];
  const payments = d?.payments || [];
  const proofs = d?.proofs || [];
  const pct = n ? pctOf(n.work_status) : 10;
  const status = n?.payment_status === "Belum Lunas" ? "Outstanding" : n?.payment_status || "Outstanding";
  const remaining = n ? Math.max(0, Number(n.grand_total) - Number(n.paid_amount)) : 0;
  const statusColor = status === "Lunas" ? "text-emerald-600" : status === "DP" ? "text-amber-700" : "text-rose-600";
  const method = n?.payment_method && n.payment_method !== "-" ? n.payment_method : "";
  const settleLogs = payments.filter((p) => /lunas|pelunasan|settle|update/i.test(p.log_type || ""));

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <HiOutlineReceiptPercent className="h-5 w-5 shrink-0" style={{ color: WINE }} />
              <h3 className="text-base font-black text-slate-800 sm:text-lg">Rincian Nota {n?.order_no || orderNo || "..."}</h3>
              {n && <span title={String(n.work_status ?? "")} className={`inline-flex min-w-[48px] items-center justify-center rounded-full border px-2.5 py-0.5 text-[10px] font-black ${pctTone(pct)}`}>{Math.round(pct)}%</span>}
              {n?.access_code && <span className="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-black tracking-wider" style={{ background: "#5f134012", color: WINE, border: "1px solid #5f134033" }}>PIN {n.access_code}</span>}
            </div>
            {n && <p className="mt-1 text-xs text-slate-400">{when(n.order_date)} · {n.outlet_full_name || n.outlet_name}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>

        <div className="overflow-auto p-4 text-xs sm:p-5">
          {err ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">{err}</p>
          ) : !d ? (
            <p className="py-10 text-center text-slate-400">Memuat...</p>
          ) : (
            <div className="space-y-4">
              {n.is_void && <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 p-3 font-bold text-rose-700"><HiOutlineExclamationTriangle className="h-4 w-4" /> Nota ini diajukan hapus (void) di POS.</p>}

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-8">
                  <Card className="p-4 sm:col-span-3">
                    <Label>Pelanggan</Label>
                    <p className="mt-1 break-words text-base font-black text-slate-800 sm:text-lg">{n.customer_name}</p>
                    {n.customer_phone && <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700">{n.customer_phone}</p>}
                    {n.customer_address && <p className="mt-1.5 break-words text-slate-500">{n.customer_address}</p>}
                  </Card>

                  <Card>
                    <Label>Layanan</Label>
                    <p className="mt-0.5 text-sm font-black text-slate-800">{[n.order_category, n.speed_name].filter(Boolean).join(" - ") || "-"}</p>
                    {n.parfume_name && <p className="text-[11px] font-bold text-pink-700">Aroma: {n.parfume_name}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${n.is_delivery ? "border-orange-200 bg-orange-50 text-orange-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>{n.is_delivery ? "Diantar" : "Ambil di outlet"}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{n.total_weight_kg} kg / {n.total_pcs} pcs</span>
                    </div>
                  </Card>

                  <Card>
                    <Label>Tagihan</Label>
                    <p className="mt-0.5 text-sm font-black" style={{ color: WINE }}>Rp {rp(n.grand_total)}</p>
                    <p className={`text-[11px] font-extrabold ${statusColor}`}>{status}{method ? ` (${method})` : ""}</p>
                    {status !== "Lunas" && <p className="text-[10px] text-slate-500">Dibayar: Rp {rp(n.paid_amount)} · Sisa: Rp {rp(remaining)}</p>}
                    {(n.speed_surcharge > 0 || n.discount_amount > 0) && (
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {n.speed_surcharge > 0 && <>Biaya kecepatan Rp {rp(n.speed_surcharge)}</>}
                        {n.speed_surcharge > 0 && n.discount_amount > 0 && " · "}
                        {n.discount_amount > 0 && <>Diskon -Rp {rp(n.discount_amount)}{n.discount_notes ? ` (${n.discount_notes})` : ""}</>}
                      </p>
                    )}
                  </Card>

                  <Card>
                    <Label>Kasir / Pelunasan</Label>
                    <p className="mt-0.5 text-sm font-black text-slate-800">Dibuat: {n.cashier || "-"}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {n.settled_by ? `Dilunasi: ${n.settled_by}${n.settled_at ? ` · ${when(n.settled_at)}` : ""}` : settleLogs.length === 0 ? "Belum ada data pelunasan" : null}
                    </p>
                    {settleLogs.map((p) => (
                      <p key={p.id} className="text-[10px] text-slate-500">{p.at} · Rp {rp(p.amount)} · {p.payment_method || "-"}{p.cashier ? ` · ${p.cashier}` : ""}</p>
                    ))}
                    <p className="text-[10px] text-slate-500">Catatan: {n.special_notes || "-"}</p>
                  </Card>
                </div>

                <div className="lg:col-span-4">
                  <Card className="h-full p-4" >
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg p-1.5" style={{ background: "#5f13401a", color: WINE }}><HiOutlineReceiptPercent className="h-3.5 w-3.5" /></span>
                      <div>
                        <p className="text-xs font-black text-slate-800">QR Tracking</p>
                        <p className="text-[10px] text-slate-400">{n.tracking_url ? "Tautan lacak status nota" : "QR tidak tersedia di alfi"}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
                      <Label>No. Nota</Label>
                      <p className="break-all font-mono text-[11px] font-black text-slate-800">{n.order_no}</p>
                    </div>
                    <div className="mt-2 space-y-0.5 text-[10px] text-slate-500">
                      <p>Status: <span className={`font-extrabold ${statusColor}`}>{status}{method ? ` · ${method}` : ""}</span></p>
                      <p>Progress: <span className="font-extrabold" style={{ color: WINE }}>{Math.round(pct)}%</span></p>
                    </div>
                    {n.tracking_url && <a href={n.tracking_url} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-[10px] font-bold underline" style={{ color: WINE }}>Buka halaman tracking</a>}
                  </Card>
                </div>
              </div>

              <Card className="p-4">
                <Label>Bukti Pembayaran</Label>
                {proofs.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-slate-400">Tidak ada foto bukti pembayaran pada nota ini.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {proofs.map((p, k) => <Proof key={k} p={p} onOpen={(u) => window.open(u, "_blank", "noopener")} />)}
                  </div>
                )}
              </Card>

              <div className="rounded-2xl border border-slate-200 p-4">
                <h4 className="text-base font-black text-slate-800">Item Transaksi</h4>
                <p className="mb-3 mt-0.5 text-[11px] text-slate-400">{items.length} item · klik baris untuk lihat rincian</p>
                <div className="space-y-2.5">
                  {items.map((i, k) => {
                    const isOpen = open === k;
                    const st = i.item_work_status || null;
                    const note = i.condition_notes && i.condition_notes !== "-" ? i.condition_notes : "";
                    const specs = [["Merk / Brand", i.brand], ["Warna", i.color], ["Material", i.material], ["Ukuran", i.size], ["Pengambilan", i.pickup]].filter(([, v]) => v && v !== "-");
                    return (
                      <div key={k} className={`overflow-hidden rounded-2xl border transition-all ${isOpen ? "border-[#5f1340]/25 shadow-sm" : "border-slate-200"}`}>
                        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:p-3.5">
                          <button type="button" onClick={() => setOpen(isOpen ? null : k)} className="group flex min-w-0 flex-1 items-start gap-3 text-left sm:items-center">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: WINE }}>{k + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-black text-slate-800">{i.service_name}</span>
                                {isOpen ? <HiOutlineChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <HiOutlineChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {i.service_code && <span className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-extrabold" style={{ color: WINE, borderColor: "#5f134033", background: "#5f13400f" }}>{i.service_code}</span>}
                                {st && <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold ${tone(st)}`}>{st}</span>}
                                {i.is_cleanox && <span className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-extrabold text-sky-800">Cleanox</span>}
                                <span className="text-[11px] font-bold text-slate-500">{i.qty} {i.unit} · Rp {rp(i.subtotal)}</span>
                              </div>
                            </div>
                          </button>
                          {st && <span className={`self-start rounded-full border px-3 py-1 text-[11px] font-black sm:self-center ${tone(st)}`}>{st}</span>}
                        </div>
                        {isOpen && (
                          <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/60 p-3 sm:p-3.5">
                            {specs.length > 0 && (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {specs.map(([a, b]) => (
                                  <div key={a} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2"><Label>{a}</Label><p className="mt-0.5 truncate font-bold text-slate-800">{b}</p></div>
                                ))}
                              </div>
                            )}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2"><Label>Qty</Label><p className="text-sm font-black text-slate-800">{i.qty} {i.unit}</p></div>
                              <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2"><Label>Harga Satuan</Label><p className="text-sm font-black text-slate-800">Rp {rp(i.unit_price)}</p></div>
                              <div className="rounded-xl border px-2.5 py-2" style={{ background: "#5f13400f", borderColor: "#5f134033" }}><Label>Subtotal</Label><p className="text-sm font-black" style={{ color: WINE }}>Rp {rp(i.subtotal)}</p></div>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-amber-800/70">Kondisi / Catatan</p>
                              <p className="mt-0.5 text-[11px] font-bold text-amber-950">{note || "Tidak ada catatan kondisi"}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {items.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center font-bold text-slate-400">Tidak ada item pada nota ini</p>}
                </div>
              </div>

              {payments.length > 0 && (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <Label>Riwayat pembayaran</Label>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-slate-600">{p.at} · {p.payment_method || "-"}{p.log_type ? ` · ${p.log_type}` : ""}{p.cashier ? ` · ${p.cashier}` : ""}</span>
                        <span className="font-semibold tabular-nums text-slate-800">Rp {rp(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
