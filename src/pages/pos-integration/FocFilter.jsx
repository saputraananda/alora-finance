import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineChevronDown, HiOutlineXMark } from "react-icons/hi2";
import { cutoffMonthLabel, cutoffRangeForKey, cutoffRangeLabel, currentCutoffKey, recentCutoffKeys, todayWib } from "../../lib/cutoff";

const cn = (...c) => c.filter(Boolean).join(" ");
const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export const SORTS = [
  ["terbaru", "Transaksi terbaru"],
  ["terlama", "Transaksi terlama"],
  ["tertinggi", "Nominal tertinggi"],
  ["terendah", "Nominal terendah"],
];
export const STATUSES = [
  ["belum", "Belum selesai"],
  ["order", "Order"],
  ["proses", "Pengerjaan"],
  ["selesai_belum", "Selesai, belum diambil / diantar"],
  ["selesai_sudah", "Selesai, sudah diambil / diantar"],
];
export const PAYSTATUS = [["Lunas", "Lunas"], ["DP", "DP (sebagian dibayar)"], ["Outstanding", "Belum bayar (Outstanding)"]];
export const PAYS = [["Lunas", "Lunas"], ["DP", "DP"], ["Pelunasan", "Pelunasan"]];
export const METHODS = [["TUNAI", "Tunai"], ["TRANSFER", "Transfer bank"], ["QRIS", "QRIS"], ["EDC", "EDC / Debit"], ["DEPOSIT", "Potong saldo member"]];
export const CATEGORIES = ["Kiloan", "Satuan", "Campuran"];

export function defaultFilter() {
  const today = todayWib();
  return {
    sort: "terbaru",
    basis: "created", // created = tanggal pembuatan nota, paid = tanggal pembayaran
    mode: "cutoff", // cutoff | year | month | date
    cutoff: currentCutoffKey(),
    year: today.slice(0, 4),
    month: today.slice(0, 7),
    from: today,
    to: today,
    outlets: [],
    status: [],
    paystatus: [],
    pay: [],
    methods: [],
    cashiers: [],
    categories: [],
  };
}

// Rentang tanggal dari pilihan periode
export function rangeOf(f) {
  if (f.mode === "cutoff") return cutoffRangeForKey(f.cutoff);
  if (f.mode === "year") return { from: `${f.year}-01-01`, to: `${f.year}-12-31` };
  if (f.mode === "month") {
    const [y, m] = f.month.split("-").map(Number);
    return { from: `${f.month}-01`, to: `${f.month}-${pad(new Date(y, m, 0).getDate())}` };
  }
  return { from: f.from, to: f.to < f.from ? f.from : f.to };
}

export function periodLabel(f) {
  if (f.mode === "cutoff") return `Cutoff ${cutoffRangeLabel(f.cutoff)}`;
  if (f.mode === "year") return `Tahun ${f.year}`;
  if (f.mode === "month") return `${MONTHS[Number(f.month.slice(5, 7)) - 1]} ${f.month.slice(0, 4)}`;
  const r = rangeOf(f);
  return r.from === r.to ? r.from.split("-").reverse().join("/") : `${r.from.split("-").reverse().join("/")} – ${r.to.split("-").reverse().join("/")}`;
}

export function activeCount(f) {
  const d = defaultFilter();
  let n = 0;
  if (f.sort !== d.sort) n++;
  if (f.basis !== d.basis) n++;
  if (f.mode !== d.mode || f.cutoff !== d.cutoff || f.year !== d.year || f.month !== d.month || f.from !== d.from || f.to !== d.to) n++;
  ["outlets", "status", "paystatus", "pay", "methods", "cashiers", "categories"].forEach((k) => { if (f[k].length) n++; });
  return n;
}

// Query string untuk API (tanpa halaman)
export function filterQuery(f, extra = {}) {
  const r = rangeOf(f);
  const qs = new URLSearchParams({ from: r.from, to: r.to, basis: f.basis, sort: f.sort });
  ["outlets", "status", "paystatus", "pay", "methods", "cashiers", "categories"].forEach((k) => { if (f[k].length) qs.set(k, f[k].join(",")); });
  Object.entries(extra).forEach(([k, v]) => v != null && v !== "" && qs.set(k, v));
  return qs;
}

function Section({ title, badge, open, onToggle, children }) {
  return (
    <div className="border-b border-slate-100">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <span className="text-sm font-bold text-slate-800">{title}</span>
        <span className="flex items-center gap-2">
          {badge ? <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-700">{badge}</span> : null}
          <HiOutlineChevronDown className={cn("h-4 w-4 text-slate-300 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function Checks({ options, value, onChange, cols = 1 }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className={cn("grid gap-1.5", cols === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>
      {options.map(([v, l]) => (
        <label key={v} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-xs text-slate-700 hover:bg-slate-50">
          <input type="checkbox" checked={value.includes(v)} onChange={() => toggle(v)} className="h-4 w-4 rounded border-slate-300 accent-emerald-600" />
          {l}
        </label>
      ))}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500";

// Modal "Filter": bagian dibuka satu per satu (akordeon) seperti di my-waschen. Nilai baru dipakai setelah "Terapkan".
export default function FocFilterModal({ value, meta, onApply, onClose }) {
  const [f, setF] = useState(value);
  const [open, setOpen] = useState("periode");
  const [cq, setCq] = useState("");
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const tog = (k) => setOpen(open === k ? "" : k);
  const years = useMemo(() => { const y = Number(todayWib().slice(0, 4)); return [y, y - 1, y - 2, y - 3].map(String); }, []);
  const cashiers = (meta?.cashiers || []).filter((c) => !cq || c.name.toLowerCase().includes(cq.toLowerCase()));

  return createPortal(
    <div className="fixed inset-0 z-[9980] flex justify-end">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-extrabold text-slate-800">Filter</h3>
          <button type="button" onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-slate-700"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="mb-2 text-sm font-bold text-slate-800">Urut berdasarkan</p>
            <div className="space-y-1.5">
              {SORTS.map(([v, l]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-700">
                  <input type="radio" name="sort" checked={f.sort === v} onChange={() => set("sort", v)} className="h-4 w-4 accent-emerald-600" /> {l}
                </label>
              ))}
            </div>
          </div>

          <Section title="Periode" badge="Diterapkan" open={open === "periode"} onToggle={() => tog("periode")}>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Berdasarkan</label>
            <select value={f.basis} onChange={(e) => set("basis", e.target.value)} className={inputCls}>
              <option value="created">Tanggal pembuatan nota</option>
              <option value="paid">Tanggal pembayaran</option>
            </select>
            <p className="mb-1 mt-3 text-[11px] font-semibold text-slate-500">Jenis periode</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[["cutoff", "Cutoff"], ["year", "Tahun"], ["month", "Bulan"], ["date", "Tanggal"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => set("mode", v)} className={cn("rounded-lg border px-2 py-2 text-xs font-bold transition", f.mode === v ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>{l}</button>
              ))}
            </div>
            <div className="mt-3">
              {f.mode === "cutoff" && (
                <>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">Periode cutoff (26 – 25)</label>
                  <select value={f.cutoff} onChange={(e) => set("cutoff", e.target.value)} className={inputCls}>
                    {recentCutoffKeys(24).map((k) => <option key={k} value={k}>{cutoffMonthLabel(k)} · {cutoffRangeLabel(k)}</option>)}
                  </select>
                </>
              )}
              {f.mode === "year" && (
                <select value={f.year} onChange={(e) => set("year", e.target.value)} className={inputCls}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
              )}
              {f.mode === "month" && (
                <>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">Bulan kalender</label>
                  <input type="month" value={f.month} onChange={(e) => e.target.value && set("month", e.target.value)} className={inputCls} />
                </>
              )}
              {f.mode === "date" && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Dari</label><input type="date" value={f.from} max={f.to} onChange={(e) => e.target.value && set("from", e.target.value)} className={inputCls} /></div>
                  <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Sampai</label><input type="date" value={f.to} min={f.from} onChange={(e) => e.target.value && set("to", e.target.value)} className={inputCls} /></div>
                </div>
              )}
            </div>
          </Section>

          <Section title="Jenis transaksi" badge={f.categories.length || null} open={open === "kategori"} onToggle={() => tog("kategori")}>
            <Checks options={CATEGORIES.map((c) => [c, c])} value={f.categories} onChange={(v) => set("categories", v)} />
          </Section>
          <Section title="Status bayar" badge={f.paystatus.length || null} open={open === "paystatus"} onToggle={() => tog("paystatus")}>
            <Checks options={PAYSTATUS} value={f.paystatus} onChange={(v) => set("paystatus", v)} />
            <p className="mt-2 text-[11px] text-slate-400">Posisi pembayaran nota saat ini. Pilih "Belum bayar" untuk melihat nota yang belum ada pembayarannya.</p>
          </Section>
          <Section title="Transaksi dengan pembayaran" badge={f.pay.length || null} open={open === "pay"} onToggle={() => tog("pay")}>
            <Checks options={PAYS} value={f.pay} onChange={(v) => set("pay", v)} />
            <p className="mt-2 text-[11px] text-slate-400">Hanya nota yang punya catatan pembayaran jenis ini. Nota yang belum dibayar sama sekali tidak muncul di sini, gunakan "Status bayar".</p>
          </Section>
          <Section title="Jenis pembayaran" badge={f.methods.length || null} open={open === "methods"} onToggle={() => tog("methods")}>
            <Checks options={METHODS} value={f.methods} onChange={(v) => set("methods", v)} />
          </Section>
          <Section title="Unit / outlet" badge={f.outlets.length || null} open={open === "outlets"} onToggle={() => tog("outlets")}>
            <Checks options={(meta?.outlets || []).map((o) => [String(o.id), o.name])} value={f.outlets} onChange={(v) => set("outlets", v)} cols={2} />
          </Section>
          <Section title="Status transaksi" badge={f.status.length || null} open={open === "status"} onToggle={() => tog("status")}>
            <Checks options={STATUSES} value={f.status} onChange={(v) => set("status", v)} />
          </Section>
          <Section title="Pembuat nota" badge={f.cashiers.length || null} open={open === "cashiers"} onToggle={() => tog("cashiers")}>
            <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Cari nama pembuat nota" className={cn(inputCls, "mb-2")} />
            <div className="max-h-56 overflow-y-auto">
              <Checks options={cashiers.map((c) => [String(c.id), c.name])} value={f.cashiers} onChange={(v) => set("cashiers", v)} />
              {cashiers.length === 0 && <p className="py-3 text-center text-[11px] text-slate-400">Tidak ada nama yang cocok.</p>}
            </div>
          </Section>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-4">
          <button type="button" onClick={() => setF(defaultFilter())} className="rounded-xl border border-slate-300 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Reset</button>
          <button type="button" onClick={() => onApply(f)} className="rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700">Terapkan</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
