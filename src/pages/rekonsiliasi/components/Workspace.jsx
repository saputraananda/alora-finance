import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { HiOutlineChevronDown, HiOutlineChevronRight, HiOutlineExclamationTriangle, HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../../../lib/api";
import DateFilter, { useDateFilter } from "../../../components/DateFilter";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "-");
const TOL = 1;
const inputCls = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const thCls = "px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500";

// Istilah status dipertahankan (pengguna Finance); ikon agar tidak hanya warna
const STATUS = {
  Matched: ["✓ Matched", "border-emerald-200 bg-emerald-50 text-emerald-700"],
  Unmatched: ["○ Unmatched", "border-slate-300 bg-slate-50 text-slate-600"],
  Partial: ["◐ Partially Matched", "border-sky-200 bg-sky-50 text-sky-700"],
  PendingBank: ["⏳ Pending Bank", "border-amber-200 bg-amber-50 text-amber-700"],
  Difference: ["⚠ Difference", "border-rose-200 bg-rose-50 text-rose-700"],
  Explained: ["✎ Explained", "border-orange-200 bg-orange-50 text-orange-700"],
  Reviewed: ["✔✔ Reviewed", "border-indigo-200 bg-indigo-50 text-indigo-700"],
};
const Badge = ({ s }) => <span className={cn("whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold", STATUS[s]?.[1])}>{STATUS[s]?.[0] || s}</span>;
const DONE = ["Matched", "Reviewed", "Explained"];
const keyOf = (it) => `${it.ref_type}:${it.ref_key}`;

function Skeleton({ cols }) {
  return Array.from({ length: 5 }).map((_, i) => (
    <tr key={i}>{Array.from({ length: cols }).map((__, j) => <td key={j} className="px-3 py-3"><div className="h-3 animate-pulse rounded bg-slate-100" /></td>)}</tr>
  ));
}

// Dialog Konfirmasi Matching & Alokasi: Kategori Payment wajib, dipilih dari master aplikasi
function ConfirmMatch({ internal, bank, mode, onMode, categories, catsLoading, picks, setPicks, expl, setExpl, totals, onConfirm, onClose, busy, error }) {
  const dir = bank[0] && bank[0].amount < 0 ? "DR" : "CR";
  const ready = bank.every((b) => picks[b.id]);
  const equal = Math.abs(totals.diff) <= TOL;
  // QRIS/EDC dengan uang bank lebih kecil dari POS: selisih umumnya potongan MDR
  const onlineOnly = internal.length > 0 && internal.every((i) => i.ref_type === "POS_ONLINE");
  const mdrHint = onlineOnly && totals.diff > TOL && mode === "DIFF";
  const mdrText = `Potongan MDR ${[...new Set(internal.map((i) => i.method))].join("/")}`;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">Konfirmasi Matching & Alokasi</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">Kategori Payment ditentukan di sini. Belum disimpan sebelum Anda mengonfirmasi.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Transaksi internal ({internal.length})</p>
              <ul className="space-y-1">{internal.map((i) => <li key={keyOf(i)} className="flex justify-between gap-2"><span className="truncate font-mono text-[11px]">{i.ref}</span><span className="tabular-nums font-semibold">Rp {rp(i.remaining)}</span></li>)}</ul>
              <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-bold"><span>Total</span><span className="tabular-nums">Rp {rp(totals.internal)}</span></p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Mutasi bank ({bank.length})</p>
              <ul className="space-y-2">
                {bank.map((b) => (
                  <li key={b.id}>
                    <div className="flex justify-between gap-2"><span className="truncate font-mono text-[11px]">{b.recon_code || `#${b.id}`}</span><span className="tabular-nums font-semibold">Rp {rp(b.remaining)}</span></div>
                    <select value={picks[b.id] || ""} onChange={(e) => setPicks((p) => ({ ...p, [b.id]: e.target.value }))} className={cn(inputCls, "mt-1 w-full")} aria-label={`Kategori Payment ${b.recon_code || b.id}`}>
                      <option value="">{catsLoading ? "Memuat kategori..." : "Pilih Kategori Payment / Alokasikan ke *"}</option>
                      {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-bold"><span>Total</span><span className="tabular-nums">Rp {rp(totals.bank)}</span></p>
            </div>
          </div>
          {!catsLoading && categories.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-900">
              Belum ada Kategori Payment untuk {dir === "CR" ? "uang masuk" : "uang keluar"}. Tambahkan dulu di{" "}
              <Link to="/finance-ho/pengaturan/kategori-payment" className="underline">Pengaturan › Kategori payment</Link>, lalu kembali ke sini.
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">
              Kategori dari Pengaturan › Kategori payment ({dir === "CR" ? "uang masuk" : "uang keluar"}). Bila mutasi berbeda kategori, pilih per mutasi.
            </p>
          )}
          <div className={cn("rounded-xl border p-3", equal ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60")}>
            {equal ? (
              <p className="font-semibold text-emerald-800">✓ Total sama. Pencocokan penuh.</p>
            ) : (
              <>
                <p className="font-semibold text-amber-900">Selisih Rp {rp(Math.abs(totals.diff))} ({totals.diff > 0 ? "internal lebih besar" : "bank lebih besar"})</p>
                <div className="mt-2 space-y-1.5">
                  {[["PARTIAL", "Cocokkan sebagian", "Nominal terkecil dicocokkan; sisa tetap terbuka di sisi yang lebih besar."], ["DIFF", "Cocokkan dengan selisih", "Kedua sisi ditutup. Status Difference sampai selisih dijelaskan (lalu Explained)."]].map(([k, l, d]) => (
                    <label key={k} className="flex cursor-pointer items-start gap-2">
                      <input type="radio" name="mode" checked={mode === k} onChange={() => onMode(k)} className="mt-0.5 accent-emerald-600" />
                      <span><b>{l}</b><span className="block text-[11px] text-slate-500">{d}</span></span>
                    </label>
                  ))}
                </div>
                {mode === "DIFF" && (
                  <div className="mt-3 border-t border-amber-200/70 pt-3">
                    <p className="font-semibold text-amber-900">Penjelasan selisih <span className="font-normal text-amber-700">(boleh diisi nanti)</span></p>
                    <input value={expl} onChange={(e) => setExpl(e.target.value)} placeholder="Mis. Potongan MDR QRIS" className={cn(inputCls, "mt-1.5 w-full")} />
                    {mdrHint && (
                      <button type="button" onClick={() => setExpl(mdrText)} className="mt-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
                        Tandai sebagai {mdrText}
                      </button>
                    )}
                    {mdrHint && <p className="mt-1.5 text-[11px] text-amber-800">Selisih yang dijelaskan pada penjualan QRIS/EDC dicatat sebagai Beban MDR saat hari dikunci di Rekonsiliasi harian.</p>}
                  </div>
                )}
              </>
            )}
          </div>
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
          <button type="button" disabled={!ready || busy} onClick={onConfirm} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
            {busy ? "Menyimpan..." : "Konfirmasi pencocokan"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Detail({ target, onClose, onChanged }) {
  const [matches, setMatches] = useState([]);
  const [explain, setExplain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmUndo, setConfirmUndo] = useState(null);
  const x = target.row;
  useEffect(() => {
    let alive = true;
    Promise.all((x.match_ids || []).map((id) => api(`/finance-ho/rekon/workspace/match/${id}`).catch(() => null))).then((r) => alive && setMatches(r.filter(Boolean)));
    return () => { alive = false; };
  }, [x]);
  const act = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const kv = (k, v) => <div className="flex justify-between gap-4 border-b border-slate-100 py-2"><span className="shrink-0 text-slate-400">{k}</span><span className="text-right font-semibold text-slate-700">{v}</span></div>;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-800">{target.side === "L" ? "Detail transaksi internal" : "Detail mutasi bank"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto p-6 text-xs">
          <div className="flex items-center justify-between"><span className="font-mono text-sm font-bold text-slate-800">{target.side === "L" ? x.ref : x.recon_code || `#${x.id}`}</span><Badge s={x.status} /></div>
          {target.side === "L" ? (
            <div>
              {kv("Tanggal", dm(x.date) + "/" + (x.date || "").slice(0, 4))}{kv("Cabang", x.outlet_name)}{kv("Keterangan", x.desc)}{kv("Metode", x.method)}
              {kv("Nominal", `Rp ${rp(x.amount)}`)}{x.used > 0 && kv("Sudah dicocokkan", `Rp ${rp(x.used)} (sisa Rp ${rp(x.remaining)})`)}{kv("Sumber data", x.source)}
              {x.children?.length > 0 && kv("Tahap sebelumnya", x.children.map((c, i) => <span key={i} className="block">{c}</span>))}
              {x.pos_diff ? kv("Selisih dengan POS", `Rp ${rp(x.pos_diff)}`) : null}
              {x.category && kv("Kategori Payment", x.category)}
            </div>
          ) : (
            <div>
              {kv("Tanggal", dm(x.date) + "/" + (x.date || "").slice(0, 4))}{kv("Rekon Code (sistem)", <span className="font-mono">{x.recon_code || "-"}</span>)}
              {kv("Keterangan", <span className="whitespace-pre-line">{x.description_full || x.description}</span>)}{kv("Kode transaksi bank", x.bank_code || "-")}
              {kv("Debit", x.debit ? `Rp ${rp(x.debit)}` : "-")}{kv("Kredit", x.credit ? `Rp ${rp(x.credit)}` : "-")}{x.balance != null && kv("Saldo", `Rp ${rp(x.balance)}`)}
              {kv("Kategori Payment", x.payment_category || <span className="font-normal text-slate-400">belum dialokasikan</span>)}
              {x.source_payment_category && kv("Kategori Payment (Excel, metadata sumber)", x.source_payment_category)}
              {x.source_recon_code && kv("Rekon Code (Excel, metadata sumber)", x.source_recon_code)}
              {x.excel_row && kv("Sumber", `Baris Excel ${x.excel_row}${x.import_file_id ? ` · file #${x.import_file_id}` : ""}`)}
              {x.used > 0 && kv("Sudah dicocokkan", `Rp ${rp(x.used)} (sisa Rp ${rp(x.remaining)})`)}
            </div>
          )}
          {matches.map((m) => (
            <div key={m.match.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pencocokan #{m.match.id} · {m.match.status === "MATCHED" ? "penuh" : m.match.status === "PARTIAL" ? "sebagian" : `dengan selisih Rp ${rp(Math.abs(m.match.difference))}`}</p>
              <ul className="mt-1 space-y-0.5">{m.items.map((i, k) => <li key={k} className="flex justify-between gap-2 text-[11px]"><span>{i.side === "BANK" ? "Bank" : "Internal"} · {i.ref_type} {i.ref_key}{i.category_label ? ` · ${i.category_label}` : ""}</span><span className="tabular-nums">Rp {rp(i.amount)}</span></li>)}</ul>
              {m.match.explanation && <p className="mt-1.5 rounded bg-orange-50 p-2 text-[11px] text-orange-800">Penjelasan: {m.match.explanation}</p>}
              {m.match.status === "DIFF" && !m.match.explanation && (
                <div className="mt-2 flex gap-2">
                  <input value={explain} onChange={(e) => setExplain(e.target.value)} placeholder="Jelaskan selisih" className={cn(inputCls, "flex-1")} />
                  <button type="button" disabled={busy || !explain.trim()} onClick={() => act(() => api("/finance-ho/rekon/workspace/explain", { method: "POST", body: JSON.stringify({ match_id: m.match.id, text: explain }) }))} className="rounded-lg bg-orange-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-orange-700 disabled:opacity-40">Simpan</button>
                </div>
              )}
              {!m.match.undone_at && (
                <button type="button" disabled={busy} onClick={() => setConfirmUndo(m.match.id)} className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50">Batalkan matching</button>
              )}
            </div>
          ))}
          {err && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700">{err}</p>}
          {x.legacy_matched && <p className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">Mutasi ini dicocokkan lewat pencocokan jurnal (tab Jurnal bank).</p>}
          <p className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">Pencocokan tidak mengubah jurnal atau nominal sumber dan tidak membuat pendapatan baru. Membatalkan tidak menghapus data sumber.</p>
        </div>
        <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Tutup</button>
        </div>
        {confirmUndo && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 p-6">
            <div className="max-w-sm text-center">
              <p className="text-sm font-bold text-slate-800">Batalkan pencocokan #{confirmUndo}?</p>
              <p className="mt-1 text-[11px] text-slate-500">Status kembali ke Pending Bank / Unmatched. Data sumber tidak berubah.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" onClick={() => setConfirmUndo(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">Tidak</button>
                <button type="button" onClick={() => { const id = confirmUndo; setConfirmUndo(null); act(() => api("/finance-ho/rekon/workspace/unmatch", { method: "POST", body: JSON.stringify({ match_id: id }) })); }} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700">Ya, batalkan</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function Workspace({ onGoImport }) {
  const date = useDateFilter("cutoff");
  const [bankId, setBankId] = useState("");
  const [outlet, setOutlet] = useState("");
  const [method, setMethod] = useState("");
  const [statusF, setStatusF] = useState("belum");
  const [qL, setQL] = useState("");
  const [qR, setQR] = useState("");
  const [sortL, setSortL] = useState("old");
  const [sortR, setSortR] = useState("old");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selL, setSelL] = useState(new Set());
  const [selR, setSelR] = useState(new Set());
  const [open, setOpen] = useState(new Set());
  const [limitL, setLimitL] = useState(200);
  const [limitR, setLimitR] = useState(200);
  const [pane, setPane] = useState("L");
  const [detail, setDetail] = useState(null);
  const [dlg, setDlg] = useState(null); // {mode}
  const [categories, setCategories] = useState([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [picks, setPicks] = useState({});
  const [expl, setExpl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dlgErr, setDlgErr] = useState("");
  const [toast, setToast] = useState(null); // {msg, matchId}
  const toastTimer = useRef(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!date.ready) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from: date.from || "", to: date.to || "", status: statusF });
      if (bankId) qs.set("bank_account_id", bankId);
      if (outlet) qs.set("outlet", outlet);
      if (method) qs.set("method", method);
      const res = await api(`/finance-ho/rekon/workspace?${qs}`);
      if (my !== seq.current) return;
      setData(res);
      setError("");
      if (!bankId && res.bank) setBankId(String(res.bank.id));
    } catch (e) {
      if (my === seq.current) setError(e.message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [date.ready, date.from, date.to, bankId, outlet, method, statusF]);
  useEffect(() => { load(); }, [load]);

  const internal = data?.internal || [];
  const bankRows = data?.bank_rows || [];
  const sg = data?.suggestions || {};
  const sortFn = (mode, amt) => (a, b) => (mode === "big" ? amt(b) - amt(a) : a.date.localeCompare(b.date) || amt(b) - amt(a));
  const match = (s, q) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  const L = useMemo(() => internal.filter((x) => match(`${x.ref} ${x.desc} ${x.outlet_name} ${x.amount}`, qL)).sort(sortFn(sortL, (x) => x.amount)), [internal, qL, sortL]);
  const R = useMemo(() => bankRows.filter((x) => match(`${x.description} ${x.recon_code || ""} ${x.amount}`, qR)).sort(sortFn(sortR, (x) => Math.abs(x.amount))), [bankRows, qR, sortR]);

  // Kandidat pasangan untuk mutasi bank yang dipilih
  const cand = useMemo(() => {
    const m = new Map();
    [...selR].forEach((id) => (sg[id] || []).forEach((c) => c.items.forEach((it) => { const k = `${it.ref_type}:${it.ref_key}`; m.set(k, Math.max(m.get(k) || 0, c.score)); })));
    return m;
  }, [selR, sg]);

  const selLRows = useMemo(() => internal.filter((x) => selL.has(keyOf(x))), [internal, selL]);
  const selRRows = useMemo(() => bankRows.filter((x) => selR.has(x.id)), [bankRows, selR]);
  const totals = useMemo(() => {
    const i = selLRows.reduce((s, x) => s + x.remaining, 0);
    const b = selRRows.reduce((s, x) => s + x.remaining, 0);
    return { internal: Math.round(i * 100) / 100, bank: Math.round(b * 100) / 100, diff: Math.round((i - b) * 100) / 100 };
  }, [selLRows, selRRows]);
  const ready = selLRows.length > 0 && selRRows.length > 0;
  const sameDir = selRRows.every((x) => x.amount > 0) || selRRows.every((x) => x.amount < 0);
  const equal = Math.abs(totals.diff) <= TOL;

  const toggleL = (it) => { if (it.matchable && it.remaining > TOL) setSelL((s) => { const n = new Set(s); n.has(keyOf(it)) ? n.delete(keyOf(it)) : n.add(keyOf(it)); return n; }); };
  const toggleR = (b) => {
    if (b.remaining <= TOL) return;
    setSelR((s) => { const n = new Set(s); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n; });
    const first = (sg[b.id] || [])[0]?.items?.[0];
    if (first) setTimeout(() => document.getElementById(`L-${first.ref_type}-${first.ref_key}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
  };
  const clear = useCallback(() => { setSelL(new Set()); setSelR(new Set()); }, []);

  const pickBest = () => {
    const last = selRRows[selRRows.length - 1];
    const best = (sg[last?.id] || [])[0];
    if (best) setSelL((s) => { const n = new Set(s); best.items.forEach((i) => n.add(`${i.ref_type}:${i.ref_key}`)); return n; });
  };
  // Auto match: menyiapkan pasangan kuat berikutnya (satu kandidat, skor ≥ 85). Kategori tetap dipilih user di dialog.
  const autoMatch = () => {
    const strong = bankRows.find((b) => b.remaining > TOL && (sg[b.id] || []).length === 1 && sg[b.id][0].score >= 85 && !selR.has(b.id));
    if (!strong) { setToast({ msg: "Tidak ada pasangan kuat lagi. Sisanya perlu dipilih manual." }); return; }
    setSelR(new Set([strong.id]));
    setSelL(new Set(sg[strong.id][0].items.map((i) => `${i.ref_type}:${i.ref_key}`)));
    document.getElementById(`R-${strong.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const openDialog = async (mode) => {
    setDlgErr("");
    setPicks({});
    setExpl("");
    setDlg({ mode });
    setCatsLoading(true);
    try {
      const dir = selRRows[0]?.amount < 0 ? "DR" : "CR";
      const r = await api(`/finance-ho/rekon/workspace/categories?direction=${dir}`);
      setCategories(r.items);
    } catch (e) {
      setDlgErr(e.message);
    } finally {
      setCatsLoading(false);
    }
  };
  const showToast = (t) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 9000); };
  const confirmMatch = async () => {
    setBusy(true);
    setDlgErr("");
    try {
      const r = await api("/finance-ho/rekon/workspace/match", {
        method: "POST",
        body: JSON.stringify({
          bank_account_id: Number(bankId), mode: equal ? "FULL" : dlg.mode, explanation: !equal && dlg.mode === "DIFF" ? expl : undefined,
          bank: selRRows.map((b) => ({ id: b.id, category_code: picks[b.id] })),
          internal: selLRows.map((i) => ({ ref_type: i.ref_type, ref_key: i.ref_key, date: i.date })),
        }),
      });
      setDlg(null);
      clear();
      showToast({ msg: r.message, matchId: r.match_id });
      load();
    } catch (e) {
      setDlgErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    const id = toast?.matchId;
    if (!id) return;
    try {
      await api("/finance-ho/rekon/workspace/unmatch", { method: "POST", body: JSON.stringify({ match_id: id }) });
      setToast({ msg: "Pencocokan diurungkan." });
      load();
    } catch (e) {
      setToast({ msg: e.message });
    }
  };
  const next = () => {
    setToast(null);
    const n = bankRows.filter((b) => b.remaining > TOL).sort(sortFn(sortR, (x) => Math.abs(x.amount)))[0];
    if (n) { setSelL(new Set()); setSelR(new Set([n.id])); document.getElementById(`R-${n.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }
  };

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "Escape" && !dlg && !detail) clear();
      if (e.key === "Enter" && !dlg && !detail && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) && ready && equal && sameDir) openDialog("FULL");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const s = data?.summary;
  const cards = [["belum", "Belum selesai", s?.belum, "text-amber-600"], ["PendingBank", "Pending Bank", s?.pending_bank, "text-slate-800"], ["Difference", "Difference", s?.difference, "text-rose-600"], ["Matched", "Sudah cocok", s?.matched, "text-emerald-600"]];
  const noBanks = data && !data.banks.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Rekening bank
          <select value={bankId} onChange={(e) => { setBankId(e.target.value); clear(); }} className={inputCls}>
            {(data?.banks || []).map((b) => <option key={b.id} value={b.id}>{b.bank_name} {b.account_no}{b.holder ? ` · ${b.holder}` : ""}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Cabang
          <select value={outlet} onChange={(e) => setOutlet(e.target.value)} className={inputCls}>
            <option value="">Semua</option>
            {(data?.outlets || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Metode
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            <option value="">Semua</option><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>EDC</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Status
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={inputCls}>
            <option value="belum">Belum selesai</option><option value="all">Semua</option><option value="Matched">Selesai</option>
            {Object.entries(STATUS).filter(([k]) => !["Matched"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v[0].replace(/^\S+ /, "")}</option>)}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onGoImport} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">⬆ Import Excel/CSV</button>
          <button type="button" onClick={autoMatch} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700">✦ Auto match</button>
        </div>
        <div className="w-full border-t border-slate-100 pt-2"><DateFilter f={date} modes={["cutoff", "range"]} /></div>
      </div>

      {error && <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><HiOutlineExclamationTriangle className="h-4 w-4" /> {error} <button type="button" onClick={load} className="ml-auto underline">Coba lagi</button></p>}
      {noBanks && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Belum ada rekening bank aktif. Tambahkan di <Link to="/finance-ho/pengaturan/rekening-bank" className="font-bold underline">Pengaturan › Rekening bank</Link>, lalu impor rekening koran.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map(([k, label, v, tone]) => (
          <button key={k} type="button" onClick={() => setStatusF(statusF === k ? "all" : k)} className={cn("rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-emerald-300", statusF === k ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200")}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className={cn("mt-1 text-xl font-extrabold tabular-nums", tone)}>{loading && !data ? "…" : rp(v)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">{statusF === k ? "filter aktif · klik untuk semua" : "klik untuk memfilter"}</p>
          </button>
        ))}
      </div>

      <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 xl:hidden">
        {[["L", "Transaksi Internal"], ["R", "Mutasi Bank"]].map(([k, l]) => <button key={k} type="button" onClick={() => setPane(k)} className={cn("flex-1 rounded-[10px] px-3 py-2 text-xs font-semibold", pane === k ? "bg-emerald-600 text-white" : "text-slate-600")}>{l}</button>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Panel kiri */}
        <section className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:block", pane !== "L" && "hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div><h2 className="text-sm font-extrabold text-slate-900">Transaksi Internal</h2><p className="text-[11px] text-slate-400">Satu baris per transaksi · tahap sebelumnya di dalam baris ▸</p></div>
            <div className="flex items-center gap-2">
              <div className="relative"><HiOutlineMagnifyingGlass className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={qL} onChange={(e) => setQL(e.target.value)} placeholder="Cari referensi, nominal" className={cn(inputCls, "w-44 pl-7")} /></div>
              <select value={sortL} onChange={(e) => setSortL(e.target.value)} className={inputCls}><option value="old">Terlama dulu</option><option value="big">Nominal terbesar</option></select>
            </div>
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50"><tr><th className="w-8 px-3 py-2.5" /><th className={thCls}>Tanggal</th><th className={thCls}>Referensi / Keterangan</th><th className={thCls}>Metode</th><th className={cn(thCls, "text-right")}>Debit</th><th className={cn(thCls, "text-right")}>Kredit</th><th className={thCls}>Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !data ? <Skeleton cols={7} /> : L.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-14 text-center text-xs text-slate-400">{noBanks ? "Belum ada data." : "Tidak ada transaksi pada filter ini."}</td></tr>
                ) : L.slice(0, limitL).map((x) => {
                  const k = keyOf(x);
                  const c = cand.get(k);
                  const exp = open.has(k);
                  return (
                    <Fragment key={k}>
                      <tr id={`L-${x.ref_type}-${x.ref_key}`} onClick={() => setDetail({ side: "L", row: x })} className={cn("cursor-pointer hover:bg-slate-50", selL.has(k) && "bg-emerald-50", c && "bg-emerald-50/40 shadow-[inset_3px_0_0_#10b981]")}>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="h-4 w-4 accent-emerald-600" aria-label={`Pilih ${x.ref}`} checked={selL.has(k)} disabled={!x.matchable || x.remaining <= TOL} onChange={() => toggleL(x)} /></td>
                        <td className="whitespace-nowrap px-2 py-2.5 align-top text-slate-500">{dm(x.date)}</td>
                        <td className="max-w-[240px] px-2 py-2.5">
                          <div className="font-mono text-[11px] font-semibold text-slate-700">
                            {x.children?.length > 0 ? <button type="button" className="mr-1 text-slate-400" aria-label="Buka tahap sebelumnya" onClick={(e) => { e.stopPropagation(); setOpen((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n; }); }}>{exp ? <HiOutlineChevronDown className="inline h-3 w-3" /> : <HiOutlineChevronRight className="inline h-3 w-3" />}</button> : <span className="mr-1 inline-block w-3" />}
                            {x.ref}
                          </div>
                          <div className="truncate text-slate-500" title={x.desc}>{x.desc}</div>
                          <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{x.outlet_name}</span>
                          {c && <span className="ml-1 mt-0.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">✦ {c}% cocok</span>}
                        </td>
                        <td className="px-2 py-2.5 align-top">{x.method}</td>
                        <td className="px-2 py-2.5 text-right align-top font-semibold tabular-nums">{x.dir === "IN" ? rp(x.amount) : ""}</td>
                        <td className="px-2 py-2.5 text-right align-top font-semibold tabular-nums">{x.dir === "OUT" ? rp(x.amount) : ""}</td>
                        <td className="px-2 py-2.5 align-top"><Badge s={x.status} />{x.used > 0 && x.remaining > TOL && <div className="mt-1 text-[10px] font-semibold text-sky-700">sisa Rp {rp(x.remaining)}</div>}</td>
                      </tr>
                      {exp && <tr className="bg-slate-50/70"><td /><td colSpan={6} className="px-2 py-2 text-[11px] text-slate-500">{x.children.map((ch, i) => <div key={i}>↳ {ch}</div>)}</td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-400">
            <span>Menampilkan {Math.min(L.length, limitL)} dari {L.length} transaksi</span>
            {L.length > limitL && <button type="button" onClick={() => setLimitL((n) => n + 200)} className="font-bold text-emerald-700">Tampilkan lebih banyak</button>}
          </div>
        </section>

        {/* Panel kanan */}
        <section className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:block", pane !== "R" && "hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div><h2 className="text-sm font-extrabold text-slate-900">Mutasi Bank</h2><p className="text-[11px] text-slate-400">{data?.bank ? `${data.bank.bank_name} ${data.bank.account_no}` : "Dari impor rekening koran"} · {s ? `${rp(s.bank_unmatched)} tersisa` : ""}</p></div>
            <div className="flex items-center gap-2">
              <div className="relative"><HiOutlineMagnifyingGlass className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={qR} onChange={(e) => setQR(e.target.value)} placeholder="Cari keterangan, nominal" className={cn(inputCls, "w-44 pl-7")} /></div>
              <select value={sortR} onChange={(e) => setSortR(e.target.value)} className={inputCls}><option value="old">Terlama dulu</option><option value="big">Nominal terbesar</option></select>
            </div>
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50"><tr><th className="w-8 px-3 py-2.5" /><th className={thCls}>Tanggal</th><th className={thCls}>Keterangan</th><th className={cn(thCls, "text-right")}>Debit</th><th className={cn(thCls, "text-right")}>Kredit</th><th className={cn(thCls, "text-right")}>Saldo</th><th className={thCls}>Kategori Payment</th><th className={thCls}>Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !data ? <Skeleton cols={8} /> : R.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-14 text-center">
                    <p className="text-xs text-slate-400">{bankRows.length === 0 && !s?.bank_unmatched && statusF !== "all" ? "Belum ada mutasi bank yang perlu dicocokkan." : "Tidak ada mutasi pada filter ini."}</p>
                    <button type="button" onClick={onGoImport} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">⬆ Import rekening koran</button>
                  </td></tr>
                ) : R.slice(0, limitR).map((x) => {
                  const best = (sg[x.id] || [])[0];
                  return (
                    <tr key={x.id} id={`R-${x.id}`} onClick={() => setDetail({ side: "R", row: x })} className={cn("cursor-pointer hover:bg-slate-50", selR.has(x.id) && "bg-emerald-50")}>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="h-4 w-4 accent-emerald-600" aria-label={`Pilih ${x.recon_code || x.id}`} checked={selR.has(x.id)} disabled={x.remaining <= TOL} onChange={() => toggleR(x)} /></td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-top text-slate-500">{dm(x.date)}</td>
                      <td className="max-w-[230px] px-2 py-2.5">
                        <div className="truncate font-medium text-slate-700" title={x.description_full || x.description}>{x.description}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {x.recon_code && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600" title="Rekon Code (dibuat sistem)">{x.recon_code}</span>}
                          {x.bank_code && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500" title="Kode transaksi bank">kode {x.bank_code}</span>}
                          {x.excel_row && <span className="text-[10px] text-slate-400" title="Baris Excel asal">baris {x.excel_row}</span>}
                          {best && x.remaining > TOL && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">✦ {sg[x.id].length > 1 ? `${sg[x.id].length} kandidat` : "ada pasangan"}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right align-top font-semibold tabular-nums">{x.debit ? rp(x.debit) : ""}</td>
                      <td className="px-2 py-2.5 text-right align-top font-semibold tabular-nums">{x.credit ? rp(x.credit) : ""}</td>
                      <td className="px-2 py-2.5 text-right align-top tabular-nums text-slate-500">{x.balance != null ? rp(x.balance) : "-"}</td>
                      <td className="px-2 py-2.5 align-top text-[11px]">{x.payment_category || <span className="text-slate-300">belum dialokasikan</span>}</td>
                      <td className="px-2 py-2.5 align-top"><Badge s={x.status} />{x.used > 0 && x.remaining > TOL && <div className="mt-1 text-[10px] font-semibold text-sky-700">sisa Rp {rp(x.remaining)}</div>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-400">
            <span>Menampilkan {Math.min(R.length, limitR)} dari {R.length} mutasi</span>
            {R.length > limitR && <button type="button" onClick={() => setLimitR((n) => n + 200)} className="font-bold text-emerald-700">Tampilkan lebih banyak</button>}
          </div>
        </section>
      </div>

      {/* Baki pilihan */}
      <div className="sticky bottom-3 z-20 rounded-2xl border border-emerald-200 bg-white p-3 shadow-xl">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div><span className="text-slate-400">Internal dipilih</span> <b className="tabular-nums text-slate-800">{selLRows.length} baris · Rp {rp(totals.internal)}</b></div>
          <div><span className="text-slate-400">Bank dipilih</span> <b className="tabular-nums text-slate-800">{selRRows.length} baris · Rp {rp(totals.bank)}</b></div>
          <div><span className="text-slate-400">Selisih</span> <b className={cn("tabular-nums", ready && equal ? "text-emerald-600" : ready ? "text-rose-600" : "text-slate-800")}>Rp {rp(totals.diff)}</b></div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selRRows.length > 0 && cand.size > 0 && [...cand.keys()].some((k) => !selL.has(k)) && <button type="button" onClick={pickBest} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100">✦ Pilih pasangan</button>}
            <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal pilih (Esc)</button>
            {ready && !equal ? (
              <>
                <button type="button" disabled={!sameDir} onClick={() => openDialog("PARTIAL")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Cocokkan sebagian…</button>
                <button type="button" disabled={!sameDir} onClick={() => openDialog("DIFF")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Cocokkan dengan selisih…</button>
              </>
            ) : (
              <button type="button" disabled={!ready || !sameDir} onClick={() => openDialog("FULL")} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">Cocokkan (Enter)</button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          {!selR.size && !selL.size ? "Pilih satu baris bank: kandidat pasangannya di kiri langsung tersorot beserta persentase kecocokan. Penerimaan: Debit internal ↔ Kredit bank." : !sameDir ? "Mutasi masuk (kredit) dan keluar (debit) tidak boleh dicocokkan sekaligus." : !ready ? "Pilih pasangan di panel seberang." : equal ? "Total sama. Kategori Payment dipilih di dialog konfirmasi." : "Total berbeda. Pilih cara menyelesaikan selisih."}
        </p>
      </div>

      {dlg && (
        <ConfirmMatch
          internal={selLRows} bank={selRRows} mode={dlg.mode} onMode={(m) => setDlg({ mode: m })} categories={categories} catsLoading={catsLoading}
          picks={picks} setPicks={setPicks} expl={expl} setExpl={setExpl} totals={totals} onConfirm={confirmMatch} onClose={() => setDlg(null)} busy={busy} error={dlgErr}
        />
      )}
      {detail && <Detail target={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); load(); }} />}
      {toast && (
        <div className="fixed bottom-28 right-6 z-[10050] flex max-w-sm items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-xs text-white shadow-2xl">
          <span className="flex-1">{toast.msg}</span>
          {toast.matchId && <button type="button" onClick={undo} className="rounded-lg bg-white/10 px-2.5 py-1 font-bold hover:bg-white/20">Urungkan</button>}
          {toast.matchId && <button type="button" onClick={next} className="rounded-lg bg-emerald-500 px-2.5 py-1 font-bold hover:bg-emerald-400">Lanjut ›</button>}
        </div>
      )}
    </div>
  );
}
