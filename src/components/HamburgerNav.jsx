import { useEffect, useRef, useState } from "react";
import { HiOutlineBars3, HiOutlineXMark } from "react-icons/hi2";

const cn = (...c) => c.filter(Boolean).join(" ");

// Satu kartu: ikon hamburger + nama menu yang sedang dibuka (posisi selalu terbaca).
// Klik kartu → menu lain muncul berjejer ke samping (kanan); bila tidak muat, turun ke baris berikutnya. Pilih satu, lalu menutup sendiri.
//   items: [{ id, label, icon?, hint? }]   value: id aktif   onSelect(id)   label: nama kelompok (untuk aksesibilitas)
export default function HamburgerNav({ items, value, onSelect, label = "Menu", className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = items.find((i) => i.id === value) || items[0];
  const others = items.filter((i) => i.id !== active?.id);
  const ActiveIcon = active?.icon;

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", esc); };
  }, [open]);

  // Menu lain tampil dari sisi kartu; bila banyak, deretan turun ke baris berikutnya (tidak terpotong)
  return (
    <nav ref={ref} aria-label={label} className={cn("flex min-w-0 items-start gap-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Menu ${label}`}
        aria-expanded={open}
        aria-current="page"
        title={open ? "Tutup menu" : `${label}: klik untuk pindah menu`}
        className={cn(
          "flex h-10 shrink-0 items-center gap-2.5 rounded-xl border px-3 text-xs font-bold transition",
          open ? "border-emerald-500 bg-emerald-600 text-white shadow-md shadow-emerald-600/25" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400"
        )}
      >
        {open ? <HiOutlineXMark className="h-5 w-5" /> : <HiOutlineBars3 className="h-5 w-5" />}
        {ActiveIcon && <ActiveIcon className={cn("h-4 w-4", open ? "text-white/80" : "text-emerald-600")} />}
        <span data-current className="whitespace-nowrap">{active?.label}</span>
      </button>

      {open && others.length > 0 && (
        <div role="menu" className="flex min-w-0 flex-1 animate-[navIn_.18s_ease-out] flex-wrap items-center gap-1 py-0.5">
          {others.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                data-nav={it.id}
                title={it.hint || it.label}
                onClick={() => { setOpen(false); onSelect(it.id); }}
                className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
