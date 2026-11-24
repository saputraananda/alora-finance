import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { FieldDateRange, FieldSelect, HeaderActions, SearchBox } from "../../../components/ui/PageHeader";

const cn = (...c) => c.filter(Boolean).join(" ");
const LABEL = { IMPORT: "Import file", MATCH: "Matching", UNMATCH: "Unmatching", STATUS: "Perubahan status", APPROVE: "Approval", EDIT: "Perubahan transaksi" };
const TONE = { IMPORT: "bg-sky-50 text-sky-700", MATCH: "bg-emerald-50 text-emerald-700", UNMATCH: "bg-rose-50 text-rose-700", STATUS: "bg-orange-50 text-orange-700", APPROVE: "bg-indigo-50 text-indigo-700", EDIT: "bg-slate-100 text-slate-600" };
const CAT_TONE = { Tunai: "bg-emerald-50 text-emerald-700", Transfer: "bg-sky-50 text-sky-700", QRIS: "bg-violet-50 text-violet-700", EDC: "bg-amber-50 text-amber-700" };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

// Riwayat tindakan rekonsiliasi: import, matching, unmatching, penjelasan selisih, perubahan status, approval.
// Kolom: Recon Code (mutasi bank) dan Payment Category (metode bayar dari nota: Tunai / Transfer / QRIS / EDC).
export default function Riwayat() {
  const [action, setAction] = useState("");
  const [outlet, setOutlet] = useState("");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(iso(new Date()));
  const [q, setQ] = useState("");
  const [qs, setQs] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQs(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { api("/finance-ho/journals/meta").then((r) => setOutlets(r.outlets || [])).catch(() => {}); }, []);

  useEffect(() => {
    let alive = true;
    setRows(null);
    const p = new URLSearchParams({ limit: "300", from, to });
    if (action) p.set("action", action);
    if (outlet) p.set("outlet", outlet);
    if (qs) p.set("q", qs);
    api(`/finance-ho/rekon/workspace/history?${p}`)
      .then((r) => alive && (setRows(r.data), setError("")))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [action, outlet, from, to, qs]);

  return (
    <div className="space-y-4">
      <HeaderActions>
        <SearchBox value={q} onChange={setQ} placeholder="Cari referensi, nama file, atau keterangan" className="w-56" />
        <FieldSelect label="Cabang" value={outlet} onChange={setOutlet} title="Berlaku untuk baris pencocokan">
          <option value="">Semua</option>
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </FieldSelect>
        <FieldSelect label="Aktivitas" value={action} onChange={setAction}>
          <option value="">Semua</option>
          {Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FieldSelect>
        <FieldDateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </HeaderActions>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-2.5">Waktu</th><th className="px-3 py-2.5">Aktivitas</th><th className="px-3 py-2.5">Recon Code</th><th className="px-3 py-2.5">Payment Category</th><th className="px-3 py-2.5">Cabang</th><th className="px-3 py-2.5">Pengguna</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {error ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-xs font-semibold text-rose-600">{error}</td></tr>
              ) : !rows ? (
                Array.from({ length: 5 }).map((_, i) => <tr key={i}>{[0, 1, 2, 3, 4, 5].map((j) => <td key={j} className="px-4 py-3"><div className="h-3 animate-pulse rounded bg-slate-100" /></td>)}</tr>)
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-xs text-slate-400">Belum ada riwayat pada filter ini. Import file atau pencocokan akan tercatat di sini.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} title={r.detail}>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500">{r.created_at}</td>
                    <td className="px-3 py-3"><span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold", TONE[r.action] || "bg-slate-100 text-slate-600")}>{LABEL[r.action] || r.action}</span></td>
                    <td className="max-w-[260px] px-3 py-3">
                      {r.recon_code ? <span className="font-mono text-[11px] font-semibold text-slate-700">{r.recon_code}</span> : <span className="block truncate text-slate-400" title={r.detail}>{r.detail}</span>}
                    </td>
                    <td className="px-3 py-3">
                      {r.payment_category ? r.payment_category.split(", ").map((c) => <span key={c} className={cn("mr-1 rounded-md px-2 py-0.5 text-[10px] font-bold", CAT_TONE[c] || "bg-slate-100 text-slate-600")}>{c}</span>) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{r.outlet_name || <span className="text-slate-300">-</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500">{r.user_name || (r.user_id ? `User #${r.user_id}` : "-")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
