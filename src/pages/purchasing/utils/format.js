export const cn = (...c) => c.filter(Boolean).join(" ");

export const rp = (n) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);

export const dmy = (d) => {
  if (!d) return "-";
  const s = String(d);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};

export const dmyTime = (d) => (d ? `${dmy(d)} ${String(d).slice(11, 16)}` : "-");

// Kode & label status disamakan dengan halaman Pengajuan SuperApp
export const STATUS_META = {
  1: { label: "Telah Diajukan", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  2: { label: "Disetujui Supervisor", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  3: { label: "Disetujui Direktur", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  4: { label: "PR Ready", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  5: { label: "Menunggu Bayar", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  6: { label: "Terbayar", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  7: { label: "Selesai", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  9: { label: "Ditolak", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const REIMBURSE_STATUS_META = {
  1: { label: "Telah Diajukan", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  2: { label: "Disetujui SPV Departemen", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  5: { label: "Disetujui SPV Finance / Menunggu Bayar", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  7: { label: "Selesai", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  9: { label: "Ditolak", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

/** Label status yang tampil, sama dengan SuperApp (reimburse punya label sendiri; kredit status 6 → Lunas/Belum Terbayar). */
export const getStatusDisplay = (row) => {
  const status = Number(row.status);
  if (row.type === "reimburse") return REIMBURSE_STATUS_META[status] ?? REIMBURSE_STATUS_META[1];
  if (status === 6 && row.payment_method === "kredit") {
    const target = Number(row.amount) || 0;
    const paid = Number(row.total_paid) || 0;
    if (target > 0 && paid >= target) return { label: "Lunas (Kredit)", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    return { label: "Belum Terbayar", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return STATUS_META[status] ?? STATUS_META[1];
};

export const TYPE_LABEL = { pengajuan: "Pengajuan", reimburse: "Reimburse" };

export const selectCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

export const filterSelectCls =
  "rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition";

export const thCls = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

// Lampiran disimpan SuperApp di folder purchase/. Tautan aktif bila VITE_SUPERAPP_ASSET_URL diisi
// (mis. http://localhost:5001/assets), selain itu hanya nama file yang ditampilkan.
export const assetUrl = (filePath) => {
  const base = (import.meta.env.VITE_SUPERAPP_ASSET_URL || "").replace(/\/$/, "");
  return base && filePath ? `${base}/${String(filePath).replace(/^\/+/, "")}` : null;
};
