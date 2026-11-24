import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineArrowUpTray, HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineXMark } from "react-icons/hi2";
import { api, getToken } from "../../lib/api";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");
const th = "whitespace-nowrap px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500";
const selectCls = "w-full min-w-[200px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

const STATUS = {
  NEW: ["Baru", "bg-emerald-50 text-emerald-700"],
  EXISTS: ["Sudah ada", "bg-sky-50 text-sky-700"],
  SIMILAR: ["Mirip", "bg-amber-50 text-amber-700"],
  IMPORTED: ["Sudah diimpor", "bg-slate-100 text-slate-500"],
  SKIP: ["Dilewati", "bg-slate-100 text-slate-500"],
};
const FILTERS = [["ALL", "Semua"], ["NEW", "Baru"], ["EXISTS", "Sudah ada"], ["SIMILAR", "Mirip"], ["SKIP", "Dilewati"]];
const importable = (r) => r.status !== "SKIP" && r.status !== "IMPORTED";

async function postForm(path, fd) {
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api${path}`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Gagal membaca file.");
  return data;
}

const encode = (s) => (s?.action === "LINK" ? `LINK:${s.link_code}` : s?.action || "NEW");
const decode = (v) => (v.startsWith("LINK:") ? { action: "LINK", link_code: v.slice(5) } : { action: v });

function Chip({ label, value, tone }) {
  const t = { green: "border-emerald-200 bg-emerald-50/60 text-emerald-700", amber: "border-amber-200 bg-amber-50/60 text-amber-700", sky: "border-sky-200 bg-sky-50/60 text-sky-700" }[tone] || "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", t)}>{label} <span className="tabular-nums">{value}</span></span>;
}

const Row = memo(function Row({ r, sel, onChange }) {
  const [label, cls] = STATUS[r.status] || STATUS.SKIP;
  const can = importable(r);
  return (
    <tr className={cn(!can && "bg-slate-50/60 text-slate-400")}>
      <td className="whitespace-nowrap px-2.5 py-2">
        {r.outlet_name || r.branch || "-"}
        {r.outlet_assumed && <span title="Kota Wisata dianggap Sentra Eropa — periksa" className="ml-1.5 cursor-help rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">dugaan</span>}
      </td>
      <td className="min-w-[180px] px-2.5 py-2">
        <p className={cn("font-semibold", can ? "text-slate-800" : "text-slate-500")}>{r.name}</p>
        <p className="text-[10px] text-slate-400">{[r.brand, r.qty ? `${r.qty} unit` : null, r.sheet ? `${r.sheet} baris ${r.row}` : null].filter(Boolean).join(" · ")}</p>
      </td>
      <td className="whitespace-nowrap px-2.5 py-2">{dmy(r.acquisition_date)}</td>
      <td className="px-2.5 py-2 text-right tabular-nums">{rp(r.cost)}</td>
      <td className="px-2.5 py-2 text-right tabular-nums">{r.life_months ?? "-"}</td>
      <td className="px-2.5 py-2 text-right tabular-nums">{rp(r.monthly)}</td>
      <td className="px-2.5 py-2 text-right tabular-nums">{rp(r.opening_accum)}</td>
      <td className="whitespace-nowrap px-2.5 py-2"><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", cls)}>{label}</span></td>
      <td className="px-2.5 py-2">
        {can ? (
          <select value={sel} onChange={(e) => onChange(r.key, e.target.value)} className={selectCls}>
            <option value="NEW">Tambah baru</option>
            {(r.candidates || []).map((c) => <option key={c.code} value={`LINK:${c.code}`}>Hubungkan ke {c.code} · {c.name}{c.outlet_name ? ` · ${c.outlet_name}` : ""}</option>)}
            <option value="SKIP">Lewati</option>
          </select>
        ) : <span className="text-[10px]">{r.reason || "-"}</span>}
      </td>
    </tr>
  );
});

export default function ImportAsetDialog({ onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [until, setUntil] = useState("2025-12");
  const [preview, setPreview] = useState(null);
  const [sel, setSel] = useState({});
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !busy) (step === 3 ? finish : onClose)(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  });

  const finish = () => { onDone?.(); onClose(); };

  const read = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("opening_until", until);
      const p = await postForm(`/finance-ho/assets/import/preview?opening_until=${encodeURIComponent(until)}`, fd);
      const init = {};
      for (const r of p.rows) if (importable(r)) init[r.key] = encode(r.suggested);
      setPreview(p);
      setSel(init);
      setFilter("ALL");
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setOne = useMemo(() => (key, v) => setSel((s) => ({ ...s, [key]: v })), []);
  const applySuggestions = () => {
    const init = {};
    for (const r of preview.rows) if (importable(r)) init[r.key] = encode(r.suggested);
    setSel(init);
  };

  const rows = preview?.rows || [];
  const shown = useMemo(() => rows.filter((r) => filter === "ALL" || (filter === "SKIP" ? r.status === "SKIP" || r.status === "IMPORTED" : r.status === filter)), [rows, filter]);
  const toImport = rows.filter((r) => importable(r) && sel[r.key] && sel[r.key] !== "SKIP").length;
  const s = preview?.summary;

  const commit = async () => {
    setBusy(true);
    setError("");
    try {
      const body = { opening_until: preview.opening_until || until, rows: rows.filter(importable).map((r) => ({ ...r, ...decode(sel[r.key] || "SKIP") })) };
      const r = await api("/finance-ho/assets/import/commit", { method: "POST", body: JSON.stringify(body) });
      setResult(r);
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => { if (!busy) (step === 3 ? finish : onClose)(); };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={close} />
      <div role="dialog" aria-label="Import Excel aset" className={cn("relative flex w-full flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl", step === 2 ? "max-w-6xl" : "max-w-lg")} style={{ maxHeight: "92vh" }}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Import Excel aset</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">Langkah {step} dari 3 · {["Pilih file", "Periksa", "Selesai"][step - 1]}</p>
          </div>
          <button type="button" onClick={close} aria-label="Tutup" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50"><HiOutlineXMark className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs text-slate-600">
          {error && <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700"><HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

          {step === 1 && (
            <>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center hover:border-emerald-400"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}>
                <HiOutlineArrowUpTray className="h-6 w-6 text-slate-400" />
                <span className="font-bold text-slate-700">{file ? file.name : "Pilih atau seret file Excel (.xlsx)"}</span>
                <span className="text-[11px] text-slate-400">{file ? `${(file.size / 1024).toFixed(0)} KB` : "File penyusutan aset"}</span>
                <input type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setFile(f); }} />
              </label>
              <label className="block font-semibold text-slate-500">Penyusutan dihitung sampai
                <input type="month" value={until} onChange={(e) => e.target.value && setUntil(e.target.value)} className="mt-1 block w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                <span className="mt-1 block text-[11px] font-normal text-slate-400">Penyusutan sebelum bulan ini dianggap sudah berjalan dan dicatat sebagai akumulasi awal.</span>
              </label>
            </>
          )}

          {step === 2 && preview && (
            <>
              <div className="flex flex-wrap gap-2">
                <Chip label="Siap diimpor" value={s.importable} tone="green" />
                <Chip label="Sudah ada" value={s.exists} tone="sky" />
                <Chip label="Mirip" value={s.similar} tone="amber" />
                <Chip label="Baru" value={s.new} tone="green" />
                <Chip label="Dilewati (kosong)" value={s.skipped} />
                <Chip label="Sudah pernah diimpor" value={s.imported} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-lg border px-3 py-1.5 text-[11px] font-bold", filter === k ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400")}>{l}</button>
                  ))}
                </div>
                <button type="button" onClick={applySuggestions} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-emerald-400">Terapkan saran ke semua</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50"><tr>
                    <th className={th}>Cabang</th><th className={th}>Aset</th><th className={th}>Tgl perolehan</th>
                    <th className={cn(th, "text-right")}>Nilai perolehan (Rp)</th><th className={cn(th, "text-right")}>Masa manfaat (bln)</th>
                    <th className={cn(th, "text-right")}>Susut/bulan</th><th className={cn(th, "text-right")}>Akumulasi awal</th><th className={th}>Status</th><th className={th}>Aksi</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {shown.map((r) => <Row key={r.key} r={r} sel={sel[r.key]} onChange={setOne} />)}
                    {shown.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-slate-400">Tidak ada baris pada filter ini.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400">Aset baru disimpan di alfi saja (tidak menulis ke SuperApp). Aset yang dihubungkan hanya diisi data penyusutannya.</p>
            </>
          )}

          {step === 3 && result && (
            <>
              <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-800"><HiOutlineCheckCircle className="h-5 w-5" /> Import selesai</p>
              <p>{result.created} aset dibuat, {result.linked} dihubungkan, {result.skipped} dilewati.</p>
              {result.errors?.length > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
                  <p className="mb-1 font-bold">{result.errors.length} baris gagal:</p>
                  <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-4">{result.errors.map((e, i) => <li key={i}>{e.key}: {e.message}</li>)}</ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          {step === 1 && (
            <>
              <button type="button" onClick={close} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="button" onClick={read} disabled={!file || busy} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Membaca..." : "Baca file"}</button>
            </>
          )}
          {step === 2 && (
            <>
              <button type="button" onClick={() => { setStep(1); setError(""); }} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Kembali</button>
              <button type="button" onClick={commit} disabled={busy || toImport === 0} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Mengimpor..." : `Impor ${toImport} aset`}</button>
            </>
          )}
          {step === 3 && <button type="button" onClick={finish} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700">Tutup</button>}
        </div>
      </div>
    </div>,
    document.body
  );
}
