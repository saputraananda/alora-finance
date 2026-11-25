import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineExclamationTriangle, HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../../../lib/api";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "-");
const inputCls = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const thCls = "px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500";
const TOL = 1;
const keyOf = (it) => `${it.ref_type}:${it.ref_key}`;
const KIND_TONE = { "Dibayar deposit": "bg-sky-50 text-sky-700", "Belum lunas": "bg-amber-50 text-amber-700" };

function ConfirmDeposit({ notas, deps, totals, onConfirm, onClose, busy, error }) {
  const customers = [...new Set(notas.map((n) => (n.customer || "").trim()).filter(Boolean))];
  const bankNames = deps.map((d) => (d.bank_description || "").trim()).filter(Boolean);
  const firstWords = customers.map((c) => c.split(/\s+/)[0].toLowerCase()).filter(Boolean);
  const bankText = bankNames.join(" ").toLowerCase();
  const looksDifferent = firstWords.length > 0 && !firstWords.some((w) => bankText.includes(w));
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">Konfirmasi Pencocokan Deposit</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">Belum disimpan sebelum dikonfirmasi.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">Nama di nota</p>
              <p className="break-words text-sm font-extrabold text-slate-800">{customers.length ? customers.join(", ") : "-"}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-sky-800">Nama di mutasi bank</p>
              {bankNames.length ? <ul className="space-y-0.5">{bankNames.map((b, i) => <li key={i} className="break-words text-sm font-extrabold text-slate-800">{b}</li>)}</ul> : <p className="text-sm font-extrabold text-slate-800">-</p>}
            </div>
          </div>
          {looksDifferent && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-900"><HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Nama di nota dan di mutasi bank tampak berbeda. Pastikan ini pelanggan yang sama.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <p className="bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Nota ({notas.length})</p>
              <table className="w-full text-left text-[11px]">
                <thead><tr className="border-b border-slate-100"><th className={thCls}>Nota</th><th className={thCls}>Pelanggan</th><th className={thCls}>Jenis</th><th className={cn(thCls, "text-right")}>Nominal</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {notas.map((n) => (
                    <tr key={keyOf(n)}>
                      <td className="px-2 py-1.5 font-mono font-semibold text-slate-700">{n.nota}</td>
                      <td className="px-2 py-1.5 text-slate-600">{n.customer || "-"}</td>
                      <td className="px-2 py-1.5"><span className={cn("whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold", KIND_TONE[n.kind_label] || "bg-slate-100 text-slate-600")}>{n.kind_label}</span></td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">Rp {rp(n.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <p className="bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Deposit ({deps.length})</p>
              <table className="w-full text-left text-[11px]">
                <thead><tr className="border-b border-slate-100"><th className={thCls}>Kode</th><th className={thCls}>Mutasi bank</th><th className={cn(thCls, "text-right")}>Sisa</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {deps.map((d) => (
                    <tr key={d.deposit_match_id}>
                      <td className="px-2 py-1.5 font-mono font-semibold text-slate-700">{d.code}</td>
                      <td className="px-2 py-1.5 text-slate-600">{d.bank_description || "-"}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">Rp {rp(d.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5"><p className="font-bold text-slate-700">Total nota</p><p className="text-sm font-extrabold tabular-nums text-slate-800">Rp {rp(totals.nota)}</p></div>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5"><p className="font-bold text-slate-700">Deposit dipilih (sisa)</p><p className="text-sm font-extrabold tabular-nums text-slate-800">Rp {rp(totals.dep)}</p></div>
            <div className="flex items-center justify-between border-b border-slate-100 bg-emerald-50/60 px-4 py-2.5"><p className="font-bold text-slate-700">Akan terpakai</p><p className="text-base font-extrabold tabular-nums text-emerald-700">Rp {rp(totals.used)}</p></div>
            <div className="flex items-center justify-between px-4 py-2.5"><p className="font-bold text-slate-700">Sisa deposit setelahnya</p><p className="text-sm font-extrabold tabular-nums text-slate-800">Rp {rp(totals.after)}</p></div>
          </div>
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{busy ? "Menyimpan..." : "Cocokkan"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Mode Deposit: kiri = nota (dibayar deposit / belum lunas), kanan = deposit yang masih punya sisa.
export default function DepositMode({ from, to, outlet, onExit, onMatched }) {
  const [qL, setQL] = useState("");
  const [qR, setQR] = useState("");
  const [qLDeb, setQLDeb] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selL, setSelL] = useState(new Set());
  const [selR, setSelR] = useState(new Set());
  const [pane, setPane] = useState("L");
  const [dlg, setDlg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dlgErr, setDlgErr] = useState("");
  const seq = useRef(0);

  useEffect(() => { const t = setTimeout(() => setQLDeb(qL), 300); return () => clearTimeout(t); }, [qL]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from: from || "", to: to || "" });
      if (outlet) qs.set("outlet", outlet);
      if (qLDeb.trim()) qs.set("q", qLDeb.trim());
      const res = await api(`/finance-ho/rekon/deposit?${qs}`);
      if (my !== seq.current) return;
      setData(res);
      setError("");
    } catch (e) {
      if (my === seq.current) setError(e.message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [from, to, outlet, qLDeb]);
  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const deposits = data?.deposits || [];
  const R = useMemo(() => {
    const q = qR.trim().toLowerCase();
    return deposits.filter((d) => d.remaining > TOL && (!q || `${d.code} ${d.bank_description || ""} ${d.recon_code || ""} ${d.remaining} ${d.amount}`.toLowerCase().includes(q)));
  }, [deposits, qR]);

  const notas = useMemo(() => items.filter((x) => selL.has(keyOf(x))), [items, selL]);
  const deps = useMemo(() => deposits.filter((d) => selR.has(d.deposit_match_id)), [deposits, selR]);
  const totals = useMemo(() => {
    const nota = Math.round(notas.reduce((s, x) => s + (Number(x.amount) || 0), 0) * 100) / 100;
    const dep = Math.round(deps.reduce((s, d) => s + (Number(d.remaining) || 0), 0) * 100) / 100;
    const used = Math.min(nota, dep);
    return { nota, dep, used, after: Math.round((dep - used) * 100) / 100 };
  }, [notas, deps]);
  const tooMuch = totals.nota > totals.dep + TOL;
  const canMatch = notas.length > 0 && deps.length > 0 && !tooMuch;

  const toggle = (setter, k) => setter((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const clear = () => { setSelL(new Set()); setSelR(new Set()); };

  const confirm = async () => {
    setBusy(true);
    setDlgErr("");
    try {
      const r = await api("/finance-ho/rekon/deposit/match", {
        method: "POST",
        body: JSON.stringify({ deposit_match_ids: deps.map((d) => d.deposit_match_id), items: notas.map((n) => ({ ref_type: n.ref_type, ref_key: n.ref_key })) }),
      });
      setDlg(false);
      clear();
      onMatched(`Deposit dicocokkan: terpakai Rp ${rp(r?.used ?? totals.used)}`);
      load();
    } catch (e) {
      setDlgErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5">
        <p className="text-xs font-semibold text-emerald-900">Mode Deposit: pilih nota di kiri dan deposit di kanan, lalu cocokkan.</p>
        <button type="button" onClick={onExit} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50">‹ Kembali ke mutasi bank</button>
      </div>
      {error && <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><HiOutlineExclamationTriangle className="h-4 w-4" /> {error} <button type="button" onClick={load} className="ml-auto underline">Coba lagi</button></p>}

      <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 xl:hidden">
        {[["L", "Nota"], ["R", "Deposit tersedia"]].map(([k, l]) => <button key={k} type="button" onClick={() => setPane(k)} className={cn("flex-1 rounded-[10px] px-3 py-2 text-xs font-semibold", pane === k ? "bg-emerald-600 text-white" : "text-slate-600")}>{l}</button>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:block", pane !== "L" && "hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div><h2 className="text-sm font-extrabold text-slate-900">Nota</h2><p className="text-[11px] text-slate-400">Dibayar deposit atau belum lunas pada periode ini</p></div>
            <div className="relative"><HiOutlineMagnifyingGlass className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={qL} onChange={(e) => setQL(e.target.value)} placeholder="Cari nota, pelanggan" className={cn(inputCls, "w-44 pl-7")} /></div>
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50"><tr><th className="w-8 px-3 py-2.5" /><th className={thCls}>Nota / Pelanggan</th><th className={thCls}>Tanggal</th><th className={thCls}>Jenis</th><th className={cn(thCls, "text-right")}>Nominal</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !data ? Array.from({ length: 5 }).map((_, i) => <tr key={i}>{Array.from({ length: 5 }).map((__, j) => <td key={j} className="px-3 py-3"><div className="h-3 animate-pulse rounded bg-slate-100" /></td>)}</tr>) : items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-14 text-center text-xs text-slate-400">Tidak ada nota</td></tr>
                ) : items.map((x) => {
                  const k = keyOf(x);
                  return (
                    <tr key={k} onClick={() => toggle(setSelL, k)} className={cn("cursor-pointer hover:bg-slate-50", selL.has(k) && "bg-emerald-50")}>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="h-4 w-4 accent-emerald-600" aria-label={`Pilih ${x.nota}`} checked={selL.has(k)} onChange={() => toggle(setSelL, k)} /></td>
                      <td className="max-w-[240px] px-2 py-2.5">
                        <div className="font-mono text-[11px] font-semibold text-slate-700">{x.nota}</div>
                        <div className="truncate text-slate-500" title={x.customer}>{x.customer || "-"}</div>
                        {x.outlet_name && <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{x.outlet_name}</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-top text-slate-500">{dm(x.date)}</td>
                      <td className="px-2 py-2.5 align-top"><span className={cn("whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold", KIND_TONE[x.kind_label] || "bg-slate-100 text-slate-600")}>{x.kind_label}</span></td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right align-top font-semibold tabular-nums">Rp {rp(x.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-400">{items.length} nota</div>
        </section>

        <section className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:block", pane !== "R" && "hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div><h2 className="text-sm font-extrabold text-slate-900">Deposit tersedia</h2><p className="text-[11px] text-slate-400">Deposit yang masih punya sisa{data?.summary ? ` · total sisa Rp ${rp(data.summary.deposit_total_remaining)}` : ""}</p></div>
            <div className="relative"><HiOutlineMagnifyingGlass className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={qR} onChange={(e) => setQR(e.target.value)} placeholder="Cari kode, keterangan" className={cn(inputCls, "w-44 pl-7")} /></div>
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50"><tr><th className="w-8 px-3 py-2.5" /><th className={thCls}>Kode / Mutasi bank</th><th className={thCls}>Tanggal</th><th className={cn(thCls, "text-right")}>Nominal</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !data ? Array.from({ length: 5 }).map((_, i) => <tr key={i}>{Array.from({ length: 4 }).map((__, j) => <td key={j} className="px-3 py-3"><div className="h-3 animate-pulse rounded bg-slate-100" /></td>)}</tr>) : R.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-14 text-center text-xs text-slate-400">Belum ada deposit yang bisa dipakai.</td></tr>
                ) : R.map((d) => (
                  <tr key={d.deposit_match_id} onClick={() => toggle(setSelR, d.deposit_match_id)} className={cn("cursor-pointer hover:bg-slate-50", selR.has(d.deposit_match_id) && "bg-emerald-50")}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="h-4 w-4 accent-emerald-600" aria-label={`Pilih ${d.code}`} checked={selR.has(d.deposit_match_id)} onChange={() => toggle(setSelR, d.deposit_match_id)} /></td>
                    <td className="max-w-[260px] px-2 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-mono text-[11px] font-semibold text-slate-700">{d.code}</span>
                        {d.recon_code && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600" title="Rekon Code">{d.recon_code}</span>}
                      </div>
                      <div className="truncate text-slate-400" title={d.bank_description}>{d.bank_description || "-"}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 align-top text-slate-500">{dm(d.date)}</td>
                    <td className="px-2 py-2.5 text-right align-top tabular-nums">
                      <div className="font-semibold">Rp {rp(d.amount)}</div>
                      <div className="text-[10px] text-slate-400">terpakai Rp {rp(d.used)}</div>
                      <div className="text-[10px] font-semibold text-sky-700">sisa Rp {rp(d.remaining)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-400">{R.length} deposit</div>
        </section>
      </div>

      <div className="sticky bottom-3 z-20 rounded-2xl border border-emerald-200 bg-white p-3 shadow-xl">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div><span className="text-slate-400">Nota dipilih</span> <b className="tabular-nums text-slate-800">{notas.length} · Rp {rp(totals.nota)}</b></div>
          <div><span className="text-slate-400">Deposit dipilih</span> <b className="tabular-nums text-slate-800">{deps.length} · sisa Rp {rp(totals.dep)}</b></div>
          <div><span className="text-slate-400">Akan terpakai</span> <b className="tabular-nums text-emerald-700">Rp {rp(totals.used)}</b><span className="ml-1.5 text-[10px] font-semibold text-slate-400">sisa deposit setelahnya Rp {rp(totals.after)}</span></div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal pilih</button>
            <button type="button" disabled={!canMatch} onClick={() => { setDlgErr(""); setDlg(true); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">Cocokkan</button>
          </div>
        </div>
        {tooMuch && deps.length > 0 && <p className="mt-1.5 text-[11px] font-bold text-rose-600">Nominal nota lebih besar dari sisa deposit</p>}
        {!(tooMuch && deps.length > 0) && <p className="mt-1.5 text-[11px] text-slate-400">{notas.length === 0 && deps.length === 0 ? "Centang nota di kiri dan deposit di kanan. Bila nota lebih kecil dari deposit, sisa deposit tetap bisa dipakai nanti." : !notas.length ? "Pilih nota di panel kiri." : !deps.length ? "Pilih deposit di panel kanan." : "Siap dicocokkan. Periksa nama di dialog konfirmasi."}</p>}
      </div>

      {dlg && <ConfirmDeposit notas={notas} deps={deps} totals={totals} onConfirm={confirm} onClose={() => setDlg(false)} busy={busy} error={dlgErr} />}
    </div>
  );
}
