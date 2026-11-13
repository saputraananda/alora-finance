import { HiOutlineExclamationTriangle } from "react-icons/hi2";

export const cn = (...c) => c.filter(Boolean).join(" ");

export const rupiah = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);

// 342,6 jt · 1,2 M · selain itu angka penuh
export function jt(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1).replace(".", ",")} jt`;
  return rupiah(v);
}

// Sumbu grafik: angka dalam juta tanpa satuan ("juta Rp" ditulis di judul)
export const juta = (n) => {
  const v = (Number(n) || 0) / 1e6;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
};

const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const dMon = (d) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;
export const rangeLabel = (from, to) => (from === to ? `${dMon(from)} ${to.slice(0, 4)}` : `${dMon(from)} – ${dMon(to)} ${to.slice(0, 4)}`);

// Label porsi unit pada widget yang angkanya dialokasikan ("Porsi Cleanox 2,7%"); kosong bila tanpa filter unit
export const unitNote = (d) => (d?.unit ? `Porsi ${d.unit.key === "cleanox" ? "Cleanox" : "Waschen"} ${String(d.unit.share).replace(".", ",")}%` : undefined);

// Kerangka kartu widget
export function Card({ title, subtitle, right, note, children, className }) {
  return (
    <section className={cn("flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {note && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{note}</span>}
          {right}
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

// Isi kartu saat memuat / gagal / kosong
export function State({ entry, empty, children }) {
  if (!entry || (entry.loading && !entry.data)) {
    return <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" /></div>;
  }
  if (entry.error && !entry.data) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
        <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{entry.error}</span>
      </div>
    );
  }
  if (empty) return <div className="flex h-32 items-center justify-center text-center text-xs text-slate-400">{empty}</div>;
  return <div className={cn(entry.loading && "opacity-60 transition")}>{children}</div>;
}

// Kotak angka kecil (dipakai Rekonsiliasi & Kas, Biaya & Pembayaran, Laba/Rugi)
export function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className={cn("mt-0.5 text-base font-extrabold tabular-nums text-slate-800", tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}
