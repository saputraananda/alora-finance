import { useEffect, useState } from "react";
import { HiOutlineMagnifyingGlass } from "react-icons/hi2";
import { api } from "../../../lib/api";

const cn = (...c) => c.filter(Boolean).join(" ");
const inputCls = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const LABEL = { IMPORT: "Import file", MATCH: "Matching", UNMATCH: "Unmatching", STATUS: "Perubahan status", APPROVE: "Approval", EDIT: "Perubahan transaksi" };
const TONE = { IMPORT: "bg-sky-50 text-sky-700", MATCH: "bg-emerald-50 text-emerald-700", UNMATCH: "bg-rose-50 text-rose-700", STATUS: "bg-orange-50 text-orange-700", APPROVE: "bg-indigo-50 text-indigo-700", EDIT: "bg-slate-100 text-slate-600" };

// Riwayat tindakan rekonsiliasi: import, matching, unmatching, penjelasan selisih, perubahan status, approval
export default function Riwayat() {
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [qs, setQs] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQs(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    const p = new URLSearchParams({ limit: "300" });
    if (action) p.set("action", action);
    if (qs) p.set("q", qs);
    api(`/finance-ho/rekon/workspace/history?${p}`)
      .then((r) => alive && (setRows(r.data), setError("")))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [action, qs]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <select value={action} onChange={(e) => setAction(e.target.value)} className={inputCls}>
          <option value="">Semua aktivitas</option>
          {Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="relative min-w-[220px] flex-1">
          <HiOutlineMagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari referensi, nama file, atau keterangan" className={cn(inputCls, "w-full pl-8")} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-2.5">Waktu</th><th className="px-3 py-2.5">Aktivitas</th><th className="px-3 py-2.5">Detail</th><th className="px-3 py-2.5">Pengguna</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {error ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-xs font-semibold text-rose-600">{error}</td></tr>
            ) : !rows ? (
              Array.from({ length: 5 }).map((_, i) => <tr key={i}>{[0, 1, 2, 3].map((j) => <td key={j} className="px-4 py-3"><div className="h-3 animate-pulse rounded bg-slate-100" /></td>)}</tr>)
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-xs text-slate-400">Belum ada riwayat. Import file atau pencocokan akan tercatat di sini.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500">{r.created_at}</td>
                  <td className="px-3 py-3"><span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold", TONE[r.action] || "bg-slate-100 text-slate-600")}>{LABEL[r.action] || r.action}</span></td>
                  <td className="px-3 py-3 text-slate-600">{r.detail}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{r.user_name || (r.user_id ? `User #${r.user_id}` : "-")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
