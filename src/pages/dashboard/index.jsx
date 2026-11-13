import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowPath,
  HiOutlineBars3,
  HiOutlineBuildingLibrary,
  HiOutlineChartBar,
  HiOutlineExclamationTriangle,
  HiOutlineInformationCircle,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import DateFilter, { useDateFilter } from "../../components/DateFilter";
import { DashboardDataProvider } from "./data";
import { DEFAULT_LAYOUT, WIDGETS, sanitizeLayout } from "./registry";
import { cn, rangeLabel } from "./ui";

const UNITS = [
  { key: "all", label: "Semua unit" },
  { key: "waschen", label: "Waschen" },
  { key: "cleanox", label: "Cleanox" },
];
const SPAN = { 1: "", 2: "md:col-span-2", 3: "md:col-span-2 xl:col-span-3" };
const selectCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30";

// Jendela pilih widget untuk ditambahkan
function AddWidgetModal({ available, onAdd, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Tambah widget</h2>
            <p className="text-[11px] text-slate-400">Pilih data yang ingin ditampilkan di dashboard Anda.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-3">
          {available.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">Semua widget sudah ditampilkan.</p>
          ) : (
            <ul className="space-y-1.5">
              {available.map((id) => (
                <li key={id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800">{WIDGETS[id].title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{WIDGETS[id].desc}</p>
                  </div>
                  <button type="button" onClick={() => onAdd(id)} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                    Tambah
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function DashboardFinance() {
  const date = useDateFilter("cutoff");
  const [unit, setUnit] = useState("all");
  const [outlet, setOutlet] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const [layout, setLayout] = useState(null); // null = belum dimuat
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  useEffect(() => {
    document.title = "Dashboard | HO Finance";
    api("/finance-ho/dashboard/outlets").then((r) => setOutlets(r.data)).catch(() => { });
    api("/finance-ho/dashboard/layout")
      .then((r) => setLayout(r.layout ? sanitizeLayout(r.layout) : DEFAULT_LAYOUT))
      .catch(() => setLayout(DEFAULT_LAYOUT));
  }, []);

  // Simpan susunan ke server setiap kali pengguna mengubahnya
  const persist = useCallback((next) => {
    setLayout(next);
    setSaveError("");
    api("/finance-ho/dashboard/layout", { method: "PUT", body: JSON.stringify({ layout: next }) }).catch((e) => setSaveError(e.message || "Gagal menyimpan tampilan."));
  }, []);

  // Pindahkan widget yang diseret ke posisi widget tujuan
  const drop = (targetId) => {
    if (dragId && dragId !== targetId) {
      const next = layout.filter((x) => x !== dragId);
      next.splice(layout.indexOf(targetId), 0, dragId);
      persist(next);
    }
    setDragId(null);
    setOverId(null);
  };
  const remove = (id) => persist(layout.filter((x) => x !== id));
  const add = (id) => persist([...layout, id]);
  const reset = () => {
    setSaveError("");
    api("/finance-ho/dashboard/layout", { method: "DELETE" })
      .then(() => setLayout(DEFAULT_LAYOUT))
      .catch((e) => setSaveError(e.message || "Gagal mengembalikan tampilan bawaan."));
  };

  const available = Object.keys(WIDGETS).filter((id) => !(layout || []).includes(id));
  // Filter unit menyala: widget yang datanya belum bisa dipisah per unit disembunyikan
  const visible = (layout || []).filter((id) => unit === "all" || WIDGETS[id].unit);
  const hiddenTitles = unit === "all" ? [] : (layout || []).filter((id) => !WIDGETS[id].unit).map((id) => WIDGETS[id].title);

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      <section className="relative mb-4 overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-r from-[#059669] to-[#6EE7B7] p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
        <div className="relative flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/30 bg-white/20 text-white shadow-inner">
            <HiOutlineChartBar className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white drop-shadow-xs sm:text-2xl">Dashboard Keuangan HO</h1>
            <p className="mt-0.5 text-xs font-medium text-emerald-50 sm:text-sm">
              {date.ready ? `Periode ${rangeLabel(date.from, date.to)}` : "Pilih rentang tanggal"}
            </p>
          </div>
        </div>
      </section>

      {/* Baris kontrol: tombol widget & atur di kiri, filter di ujung kanan */}
      <div className="mb-4 flex flex-nowrap items-center justify-between gap-3 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
        {/* Kiri: Tambah widget & Atur tata letak */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={!layout}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <HiOutlinePlus className="h-4 w-4" /> Widget
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            disabled={!layout}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition disabled:opacity-50",
              editing
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            <HiOutlineAdjustmentsHorizontal className="h-4 w-4" /> {editing ? "Selesai" : "Atur"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={reset}
              className="shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              Kembalikan bawaan
            </button>
          )}
        </div>

        {/* Kanan: Filter Unit, Cabang, Periode, dan Refresh */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-white p-0.5">
            {UNITS.map((u) => (
              <button
                key={u.key}
                type="button"
                onClick={() => setUnit(u.key)}
                className={cn(
                  "whitespace-nowrap rounded-[10px] px-3 py-1.5 text-xs font-semibold transition",
                  unit === u.key
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                {u.label}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <HiOutlineBuildingLibrary className="h-4 w-4 shrink-0 text-slate-400" />
            <select
              value={outlet}
              onChange={(e) => setOutlet(e.target.value)}
              className={selectCls}
            >
              <option value="">Semua cabang</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <span className="mx-0.5 h-6 w-px shrink-0 bg-slate-200" />

          <DateFilter f={date} modes={["cutoff", "range"]} compact />

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Muat ulang data"
            className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
          >
            <HiOutlineArrowPath className="h-4 w-4" />
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}
      {editing && (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
          Mode atur: seret widget ke posisi yang diinginkan, hapus dengan tanda silang. Perubahan tersimpan otomatis untuk akun Anda.
        </p>
      )}
      {hiddenTitles.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
          <HiOutlineInformationCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Widget yang disembunyikan karena datanya belum bisa dipisah per unit: {hiddenTitles.join(", ")}.</span>
        </p>
      )}

      {!layout ? (
        <div className="flex justify-center py-20"><div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" /></div>
      ) : !date.ready ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">Pilih tanggal awal dan akhir untuk menampilkan data.</div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          Dashboard kosong. Klik <span className="font-bold text-emerald-700">+ Widget</span> untuk menambahkan.
        </div>
      ) : (
        <DashboardDataProvider filters={{ from: date.from, to: date.to, outlet, unit }} refreshKey={refreshKey}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((id) => {
              const w = WIDGETS[id];
              const Component = w.Component;
              return (
                <div
                  key={id}
                  draggable={editing}
                  onDragStart={(e) => {
                    setDragId(id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", id);
                  }}
                  onDragOver={(e) => {
                    if (dragId && dragId !== id) {
                      e.preventDefault();
                      setOverId(id);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    drop(id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={cn(
                    "relative rounded-2xl transition",
                    SPAN[w.span],
                    editing && "outline-dashed outline-2 outline-emerald-300",
                    dragId === id && "opacity-40",
                    overId === id && "outline-solid outline-emerald-500 ring-4 ring-emerald-200"
                  )}
                >
                  <Component unit={unit} />
                  {editing && (
                    <>
                      {/* Lapisan penangkap: seluruh kartu bisa diseret & isi kartu tidak terklik saat mengatur */}
                      <div className="absolute inset-0 z-[5] cursor-grab rounded-2xl bg-white/20 active:cursor-grabbing" />
                      <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-1.5 py-1 text-[10px] font-bold text-slate-500 shadow-sm">
                        <HiOutlineBars3 className="h-4 w-4" /> Seret
                      </div>
                      <button type="button" onClick={() => remove(id)} title="Hapus widget" className="absolute right-2 top-2 z-10 rounded-lg border border-slate-200 bg-white/95 p-1 text-rose-500 shadow-sm hover:bg-rose-50">
                        <HiOutlineXMark className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </DashboardDataProvider>
      )}

      {adding && <AddWidgetModal available={available} onAdd={add} onClose={() => setAdding(false)} />}
    </div>
  );
}
