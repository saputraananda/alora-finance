import { Fragment, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineArrowUpTray, HiOutlineCheckCircle, HiOutlineChevronDown, HiOutlineExclamationTriangle, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../../../lib/api";
import { DetailJurnalModal } from "../../../components/DetailJurnalModal";
import { FieldDateRange, FieldMultiSelect, FieldSelect, HeaderActions, MoreFilters, PrimaryButton, RefreshButton, TabActiveContext } from "../../../components/ui/PageHeader";

const cn = (...c) => c.filter(Boolean).join(" ");
const rupiah = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const signed = (n) => (Number(n) > 0 ? `+${rupiah(n)}` : rupiah(n));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");
const METHODS = [["Tunai", "Tunai"], ["QRIS", "QRIS"], ["EDC", "EDC"], ["Transfer", "Transfer"], ["Jurnal", "Jurnal"]];
const METHOD_TONE = { Tunai: "bg-emerald-50 text-emerald-700", QRIS: "bg-violet-50 text-violet-700", EDC: "bg-amber-50 text-amber-700", Transfer: "bg-sky-50 text-sky-700", Jurnal: "bg-slate-100 text-slate-600" };
const STATUS_TONE = { Matched: "border-emerald-200 bg-emerald-50 text-emerald-700", Difference: "border-rose-200 bg-rose-50 text-rose-700" };
const th = "px-3 py-2.5";

const jBtn = "font-mono text-[10px] font-semibold text-sky-700 underline decoration-dotted underline-offset-2 hover:text-sky-900";
function GlCell({ r, onOpen }) {
  if (r.state === "DONE") return <span className="inline-flex flex-col items-end"><span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700"><HiOutlineCheckCircle className="h-3.5 w-3.5" /> Sudah di GL</span><button type="button" onClick={() => onOpen(r.journal_id)} title="Lihat jurnal di General Ledger" className={jBtn}>{r.journal_no}</button></span>;
  if (r.state === "VIA_SOURCE") return <span className="inline-flex flex-col items-end" title="Uangnya sudah dicatat masuk Bank oleh jurnal asalnya; pencocokan ini hanya membuktikan uangnya masuk."><span className="text-[11px] font-bold text-emerald-700">Sudah di GL lewat jurnal {r.methods.includes("Jurnal") ? "asal" : "POS"}</span>{r.source_journals.length > 0 && <span className="flex flex-wrap justify-end gap-x-2">{r.source_journals.map((j) => <button key={j.id} type="button" onClick={() => onOpen(j.id)} title="Lihat jurnal di General Ledger" className={jBtn}>{j.no}</button>)}</span>}</span>;
  if (r.state === "BLOCKED") return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700" title={r.blockers.join("\n")}><HiOutlineExclamationTriangle className="h-3.5 w-3.5" /> Belum bisa</span>;
  return <span className="text-[11px] font-bold text-sky-700">Siap transfer</span>;
}

// Account Receivable › Hasil Rekonsiliasi: semua pencocokan (Rekonsiliasi transaksi). Pilih baris → Transfer to GL, satu jurnal per baris.
export default function HasilRekon({ onGoto, initialDate, initialOutlet }) {
  const [from, setFrom] = useState(initialDate || daysAgo(30));
  const [to, setTo] = useState(initialDate || iso(new Date()));
  const [outlet, setOutlet] = useState(initialOutlet ? String(initialOutlet) : "");
  const [methods, setMethods] = useState([]);
  const [status, setStatus] = useState("");
  const [gl, setGl] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [open, setOpen] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [journalId, setJournalId] = useState(null);
  const active = useContext(TabActiveContext);

  useEffect(() => { api("/finance-ho/journals/meta").then((r) => setOutlets(r.outlets || [])).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ from, to });
      if (outlet) p.set("outlet", outlet);
      if (methods.length) p.set("method", methods.join(","));
      if (status) p.set("status", status);
      if (gl) p.set("gl", gl);
      setData(await api(`/finance-ho/rekon/results?${p}`));
    } catch (e) {
      setMsg({ type: "error", text: e.message });
      setData((d) => d || { data: [], summary: {} });
    } finally {
      setLoading(false);
    }
  }, [from, to, outlet, methods, status, gl]);
  useEffect(() => { load(); }, [load]);
  // Tab tetap hidup di belakang layar: muat ulang saat dibuka lagi supaya pencocokan terbaru muncul (filter tidak berubah)
  useEffect(() => { if (active) load(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data?.data || [];
  const ready = useMemo(() => rows.filter((r) => r.state === "READY"), [rows]);
  const picked = ready.filter((r) => sel.has(r.match_id));
  const allChecked = ready.length > 0 && picked.length === ready.length;
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleOpen = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const transfer = async () => {
    if (!picked.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api("/finance-ho/rekon/results/transfer", { method: "POST", body: JSON.stringify({ match_ids: picked.map((r) => r.match_id) }) });
      setMsg({ type: "ok", text: res.message, details: (res.results || []).filter((x) => !x.ok).map((x) => `#${x.match_id}: ${x.message}`) });
      setSel(new Set());
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(false);
      load();
    }
  };

  const s = data?.summary || {};
  return (
    <div className="space-y-4">
      {journalId && <DetailJurnalModal open journalId={journalId} onClose={() => setJournalId(null)} onReversed={() => { setJournalId(null); load(); }} />}
      <HeaderActions>
        <FieldSelect label="Cabang" value={outlet} onChange={setOutlet}>
          <option value="">Semua</option>
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </FieldSelect>
        <FieldMultiSelect label="Metode" options={METHODS} value={methods} onChange={setMethods} />
        <FieldDateRange from={from} to={to} max={iso(new Date())} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <MoreFilters count={(status ? 1 : 0) + (gl ? 1 : 0)} onReset={() => { setStatus(""); setGl(""); setSel(new Set()); }}>
          <FieldSelect label="Status" value={status} onChange={setStatus}>
            <option value="">Semua</option>
            <option value="Matched">Matched</option>
            <option value="Difference">Difference</option>
          </FieldSelect>
          <FieldSelect label="General Ledger" value={gl} onChange={(v) => { setGl(v); setSel(new Set()); }}>
            <option value="BELUM">Belum di GL</option>
            <option value="SUDAH">Sudah di GL</option>
            <option value="">Semua</option>
          </FieldSelect>
        </MoreFilters>
        <PrimaryButton onClick={transfer} disabled={busy || !picked.length} icon={HiOutlineArrowUpTray}>
          {busy ? "Memproses..." : picked.length ? `Transfer to GL (${picked.length})` : "Transfer to GL"}
        </PrimaryButton>
        <RefreshButton onClick={load} spinning={loading} />
      </HeaderActions>

      {msg && (
        <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs font-medium", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {msg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="flex-1">
            <p>{msg.text}</p>
            {msg.details?.length > 0 && <ul className="mt-1 list-disc pl-4 text-[11px]">{msg.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          </div>
          <button type="button" onClick={() => setMsg(null)} aria-label="Tutup" className="opacity-60 hover:opacity-100"><HiOutlineXMark className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Hasil rekonsiliasi", s.total, "text-slate-800"], ["Siap transfer", s.ready, "text-sky-700"], ["Belum bisa", s.blocked, "text-amber-700"], ["Sudah di GL", s.done, "text-emerald-700"]].map(([l, v, c]) => (
          <div key={l} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{l}</p>
            <p className={cn("mt-1 text-lg font-extrabold tabular-nums", c)}>{data ? rupiah(v || 0) : "-"}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label="Pilih semua yang siap" checked={allChecked} disabled={!ready.length} onChange={() => setSel(allChecked ? new Set() : new Set(ready.map((r) => r.match_id)))} className="h-3.5 w-3.5 accent-emerald-600" /></th>
                <th className={th}>Tanggal bank</th><th className={th}>Cabang</th><th className={th}>Metode</th><th className={th}>Transaksi internal</th><th className={th}>Mutasi bank</th>
                <th className={cn(th, "text-right")}>Internal</th><th className={cn(th, "text-right")}>Bank</th><th className={cn(th, "text-right")}>Selisih</th><th className={th}>Status</th><th className={cn(th, "text-right")}>General Ledger</th><th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data ? (
                Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 12 }).map((__, j) => <td key={j} className="px-3 py-3"><div className="h-3 animate-pulse rounded bg-slate-100" /></td>)}</tr>)
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-slate-400">Tidak ada hasil rekonsiliasi pada filter ini. Pencocokan dibuat di <button type="button" onClick={() => onGoto("transaksi")} className="font-bold text-emerald-700 underline">Rekonsiliasi transaksi</button>.</td></tr>
              ) : rows.map((r) => (
                <Fragment key={r.match_id}>
                  <tr className={cn(sel.has(r.match_id) && "bg-emerald-50/40")}>
                    <td className="px-4 py-3">{r.state === "READY" && <input type="checkbox" aria-label={`Pilih pencocokan ${r.match_id}`} checked={sel.has(r.match_id)} onChange={() => toggle(r.match_id)} className="h-3.5 w-3.5 accent-emerald-600" />}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600">{dmy(r.date)}</td>
                    <td className="px-3 py-3 font-bold text-slate-800">{r.outlet_name}</td>
                    <td className="px-3 py-3">{r.methods.map((m) => <span key={m} className={cn("mr-1 rounded-md px-2 py-0.5 text-[10px] font-bold", METHOD_TONE[m] || "bg-slate-100 text-slate-600")}>{m}</span>)}</td>
                    <td className="max-w-[220px] px-3 py-3 text-slate-700"><span className="block truncate" title={r.internal.map((i) => i.label).join(", ")}>{r.internal.map((i) => i.label).join(", ")}</span></td>
                    <td className="max-w-[220px] px-3 py-3 text-slate-500"><span className="block truncate" title={r.bank.map((b) => b.description).join(" | ")}>{r.bank.map((b) => b.recon_code || b.description).join(", ")}</span>{r.bank_label && <span className="block text-[10px] text-slate-400">{r.bank_label}</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{rupiah(r.internal_total)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{rupiah(r.bank_total)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {Math.abs(r.diff) < 0.5 ? <span className="text-slate-400">0</span> : <span className="font-semibold text-rose-600">{signed(r.diff)}</span>}
                      {r.alloc && <span className="block text-[10px] font-semibold text-slate-400">→ {r.alloc.label}{r.alloc.party ? ` (${r.alloc.party})` : ""}</span>}
                    </td>
                    <td className="px-3 py-3"><span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", STATUS_TONE[r.status])}>{r.status}</span></td>
                    <td className="px-3 py-3 text-right"><GlCell r={r} onOpen={setJournalId} /></td>
                    <td className="px-2 py-3"><button type="button" onClick={() => toggleOpen(r.match_id)} aria-label="Lihat jurnal" aria-expanded={open.has(r.match_id)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><HiOutlineChevronDown className={cn("h-4 w-4 transition", open.has(r.match_id) && "rotate-180")} /></button></td>
                  </tr>
                  {open.has(r.match_id) && (
                    <tr className="bg-slate-50/70">
                      <td />
                      <td colSpan={11} className="px-3 py-3">
                        {r.blockers.length > 0 && (
                          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                            <p className="font-bold">Belum bisa ditransfer:</p>
                            <ul className="list-disc pl-4">{r.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
                            {r.blockers.some((b) => b.includes("Sinkron POS")) && <Link to="/finance-ho/integrasi-pos" className="mt-1 inline-block font-bold underline">Buka Status Sinkron POS</Link>}
                            {r.blockers.some((b) => b.includes("dialokasikan")) && <button type="button" onClick={() => onGoto("transaksi")} className="ml-3 mt-1 font-bold underline">Buka Rekonsiliasi transaksi</button>}
                          </div>
                        )}
                        {r.lines.length === 0 ? (
                          <p className="text-[11px] text-slate-500">{r.state === "VIA_SOURCE" ? "Tidak ada jurnal baru: uangnya sudah dicatat masuk Bank oleh jurnal asalnya." : "Jurnal tampil setelah syarat di atas terpenuhi."}</p>
                        ) : (
                          <table className="w-full max-w-2xl text-[11px]">
                            <thead className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><tr><td className="py-1">{r.state === "DONE" ? <>Jurnal <button type="button" onClick={() => setJournalId(r.journal_id)} className={jBtn}>{r.journal_no}</button></> : "Jurnal yang akan dibuat"}</td><td className="py-1 text-right">Debit</td><td className="py-1 text-right">Kredit</td></tr></thead>
                            <tbody>
                              {r.lines.map((l, i) => (
                                <tr key={i} className="border-t border-slate-200/70">
                                  <td className={cn("py-1.5", l.credit > 0 && "pl-6")}><span className="font-semibold text-slate-700">{l.account_code} {l.account_name}</span><span className="block text-[10px] text-slate-400">{l.memo}</span></td>
                                  <td className="py-1.5 text-right tabular-nums">{l.debit > 0 ? rupiah(l.debit) : ""}</td>
                                  <td className="py-1.5 text-right tabular-nums">{l.credit > 0 ? rupiah(l.credit) : ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
