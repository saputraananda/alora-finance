import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineArrowPath, HiOutlineChevronDown, HiOutlineFunnel, HiOutlineMagnifyingGlass } from "react-icons/hi2";

const cn = (...c) => c.filter(Boolean).join(" ");

// ── Standar header halaman ──────────────────────────────────────────────────
// Kiri : jejak (grup menu) · ikon · judul · keterangan
// Kanan: URUTAN TETAP di semua halaman (acuan: General Ledger › Buku Besar)
//   Cabang → pilihan lain → Periode (<FieldDateRange>, Dari–Sampai) → [Filter (<MoreFilters>) bila >4 filter] → aksi utama (<PrimaryButton>) → Muat ulang (<RefreshButton>); kolom cari di kiri kartu alat
// Paling banyak 4 filter tampil di header (Periode dihitung satu); sisanya masuk <MoreFilters>.
// Halaman yang memang per bulan (Anggaran, Laporan) tetap memakai pilihan Bulan/Periode.
// Kolom cari (<SearchBox>) di sisi kiri kartu alat (prop search), sejajar dengan filter.
// Sub-tab halaman (mis. General Ledger › Buku Besar | Jurnal): induk menyediakannya lewat SubNavContext,
// PageHeader menaruhnya di sisi kiri kartu alat. Bentuk: tombol segmen.
export const SubNavContext = createContext(null);
export function SegmentedTabs({ tabs, value, onChange, label = "Sub halaman" }) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-xl bg-slate-100 p-1">
      {tabs.map(({ id, label: text, icon: Icon, title }) => {
        const on = value === id;
        return (
          <button key={id} type="button" role="tab" aria-selected={on} title={title} onClick={() => onChange(id)} className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-bold transition", on ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
            {Icon && <Icon className="h-4 w-4" />} {text}
          </button>
        );
      })}
    </div>
  );
}

export default function PageHeader({ title, subtitle, subnav, search, children }) {
  const ctxNav = useContext(SubNavContext);
  const nav = subnav ?? ctxNav;
  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {(children || nav || search) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{nav}{search}</div>
          {children && <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>}
        </div>
      )}
    </div>
  );
}

// Kolom cari ditaruh di kartu alat header, sejajar dengan filter: <PageHeader search={<SearchBox .../>}>. Di tab Account Receivable: <HeaderActions><SearchBox/>...
export function SearchBox({ value, onChange, placeholder = "Cari", className }) {
  return (
    <div className={cn("relative w-full max-w-xs", className)}>
      <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
      />
    </div>
  );
}

export function FilterButton({ count = 0, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
      <HiOutlineFunnel className="h-4 w-4" /> Filter{count > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] text-white">{count}</span>}
    </button>
  );
}

export function FieldSelect({ label, value, onChange, children, title, selectClassName }) {
  return (
    <label className="flex h-9 items-center gap-1.5 text-xs font-semibold text-slate-500" title={title}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10", selectClassName)}>
        {children}
      </select>
    </label>
  );
}

export function PrimaryButton({ onClick, disabled, icon: Icon, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-60">
      {Icon && <Icon className="h-4 w-4" />} {children}
    </button>
  );
}

export function RefreshButton({ onClick, spinning }) {
  return (
    <button type="button" onClick={onClick} title="Muat ulang" aria-label="Muat ulang" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-emerald-400 hover:text-emerald-700">
      <HiOutlineArrowPath className={cn("h-4 w-4", spinning && "animate-spin")} />
    </button>
  );
}

export function FieldDate({ label, value, onChange, min, max }) {
  return (
    <label className="flex h-9 items-center gap-1.5 text-xs font-semibold text-slate-500">
      {label}
      <input type="date" value={value} min={min} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
    </label>
  );
}

// Periode standar semua halaman: "Dari [tanggal] – [tanggal]". onChange(from, to) dipanggil dengan pasangan baru.
export function FieldDateRange({ label = "Periode", from, to, onChange, min, max }) {
  const cls = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
  return (
    <div className="flex h-9 items-center gap-1.5 text-xs font-semibold text-slate-500">
      {label}
      <input type="date" aria-label={`${label} dari`} value={from || ""} min={min} max={to || max} onChange={(e) => e.target.value && onChange(e.target.value, to)} className={cls} />
      <span className="text-slate-400">–</span>
      <input type="date" aria-label={`${label} sampai`} value={to || ""} min={from || min} max={max} onChange={(e) => e.target.value && onChange(from, e.target.value)} className={cls} />
    </div>
  );
}

// Filter tambahan (lebih dari 4 di header): tombol "Filter" + dialog. Isi dialog langsung berlaku (tanpa tombol Terapkan).
// count = jumlah filter di dalam dialog yang tidak bernilai default; onReset mengembalikan semuanya ke default.
export function MoreFilters({ count = 0, onReset, title = "Filter", children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <FilterButton count={count} onClick={() => setOpen(true)} />
      {open && createPortal(
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/30 p-4 pt-24" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-label={title} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-extrabold text-slate-800">{title}</p>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">Tutup</button>
            </div>
            <div className="space-y-3 p-4 [&>label]:justify-between [&>div]:justify-between [&_select]:min-w-[180px]">{children}</div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
              {onReset && <button type="button" onClick={onReset} disabled={!count} className="h-9 rounded-lg px-3 text-xs font-bold text-slate-500 hover:text-rose-600 disabled:opacity-40">Reset</button>}
              <PrimaryButton onClick={() => setOpen(false)}>Selesai</PrimaryButton>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Slot aksi header: halaman dengan banyak sub-tab (mis. Account Receivable) menaruh PageHeader sekali,
// lalu tiap sub-tab mengisi kolom kanan header lewat <HeaderActions> (urutan & posisi tetap sama di semua tab).
export const HeaderSlotContext = createContext(null);
// Sub-tab yang tetap hidup di belakang layar (agar filternya tidak hilang) memberi tahu apakah ia sedang aktif;
// hanya tab aktif yang mengisi kolom kanan header.
export const TabActiveContext = createContext(true);
export function HeaderActions({ children }) {
  const slot = useContext(HeaderSlotContext);
  const active = useContext(TabActiveContext);
  return slot && active ? createPortal(children, slot) : null;
}

// Pilihan jamak berbentuk daftar centang dalam dropdown (mis. Metode: Tunai, QRIS, ...)
export function FieldMultiSelect({ label, options, value, onChange, allLabel = "Semua" }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary = value.length === 0 ? allLabel : value.length <= 2 ? options.filter(([v]) => value.includes(v)).map(([, l]) => l).join(", ") : `${value.length} dipilih`;
  return (
    <div ref={box} className="relative flex h-9 items-center gap-1.5 text-xs font-semibold text-slate-500">
      {label}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} className="flex h-9 min-w-[110px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-emerald-400">
        <span className="truncate">{summary}</span>
        <HiOutlineChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="absolute left-0 top-full z-30 mt-1 min-w-[190px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {options.map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={value.includes(v)} onChange={() => toggle(v)} className="h-4 w-4 rounded border-slate-300 accent-emerald-600" />
              {l}
            </label>
          ))}
          {value.length > 0 && <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-400 hover:text-rose-600">Hapus pilihan</button>}
        </div>
      )}
    </div>
  );
}
