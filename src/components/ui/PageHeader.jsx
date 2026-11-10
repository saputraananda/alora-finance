// Header halaman standar (StrukturCode §4.2): banner gradien bertema alfi (emerald),
// judul + deskripsi di kiri, filter/aksi di kanan. Dipakai semua halaman HO Finance
// supaya pola tampilan sama (Referensi Tampilan hal. 3: judul & filter di setiap layar).
export default function PageHeader({ section, title, description, icon: Icon, children }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-r from-[#059669] to-[#6EE7B7] p-5 shadow-sm print:hidden sm:p-6">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-teal-200/25 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5">
          {Icon && (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/20 text-white shadow-inner">
              <Icon className="h-6 w-6" />
            </div>
          )}
          <div>
            {section && <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-50/90">{section}</p>}
            <h1 className="text-xl font-bold text-white drop-shadow-sm sm:text-2xl">{title}</h1>
            {description && <p className="mt-0.5 text-xs font-medium text-emerald-50 sm:text-sm">{description}</p>}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </section>
  );
}

// Kelas bawaan untuk input/select yang diletakkan di atas banner
export const headerControlCls =
  "rounded-xl border border-white/40 bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm outline-none backdrop-blur-sm focus:ring-2 focus:ring-white/60";
