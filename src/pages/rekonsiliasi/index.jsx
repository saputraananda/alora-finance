import { useState } from "react";
import {
  HiOutlineScale,
  HiOutlineBuildingLibrary,
  HiOutlineArrowPath,
  HiOutlineDocumentCheck,
  HiOutlineClock,
  HiOutlineSparkles,
} from "react-icons/hi2";

export default function Rekonsiliasi() {
  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* ── Header Banner ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-r from-[#059669] to-[#6EE7B7] p-6 shadow-sm">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-teal-200/25 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 border border-white/30 text-white shadow-inner backdrop-blur-xs">
              <HiOutlineScale className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white sm:text-2xl drop-shadow-xs">
                Rekonsiliasi
              </h1>
              <p className="text-xs sm:text-sm text-emerald-50 mt-0.5 font-medium drop-shadow-xs">
                Penyelarasan catatan kas & rekening koran bank perusahaan
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Placeholder Content ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 sm:p-12 text-center shadow-xs">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 mb-4 shadow-sm">
          <HiOutlineBuildingLibrary className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">
          Fitur Rekonsiliasi Bank & Kas
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
          Modul pencocokan mutasi rekening bank dengan pembukuan jurnal internal secara otomatis maupun manual.
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-800 border border-amber-200">
          <HiOutlineClock className="h-4 w-4 text-amber-600" />
          <span>Dalam Tahap Pengembangan (Coming Soon)</span>
        </div>
      </div>
    </div>
  );
}

