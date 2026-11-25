import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { HiOutlineArrowUpTray, HiOutlineChevronDown, HiOutlineChevronRight, HiOutlineExclamationTriangle, HiOutlineMagnifyingGlass, HiOutlinePhoto, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../../../lib/api";
import PeriodPicker from "../../../components/ui/PeriodPicker";
import { defaultPeriod, periodChanged, periodLabel, periodRange, yesterdayWib } from "../../../lib/period";
import { todayWib } from "../../../lib/cutoff";
import NotaModal from "../../../components/NotaModal";
import { FieldMultiSelect, FieldSelect, HeaderActions, MoreFilters, PrimaryButton, RefreshButton } from "../../../components/ui/PageHeader";
import ImportMutasi from "./ImportMutasi";
import DepositMode from "./DepositMode";

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
const ALLOC_LABEL = { BANK_CHARGE: "Bank Charge (MDR)", PIUTANG: "Piutang", DEPOSIT: "Deposit", PELUNASAN: "Pelunasan" };
const Badge = ({ s, resolved, alloc }) => (
  <span className="inline-flex flex-col items-start gap-0.5">
    <span className={cn("whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold", STATUS[s]?.[1])}>{STATUS[s]?.[0] || s}</span>
    {s === "Difference" && <span className={cn("text-[10px] font-semibold", alloc || resolved ? "text-slate-500" : "text-rose-500")}>{alloc ? ALLOC_LABEL[alloc] : resolved ? "sudah dijelaskan" : "belum dialokasikan"}</span>}
  </span>
);
const DONE = ["Matched", "Reviewed", "Explained"];
const keyOf = (it) => `${it.ref_type}:${it.ref_key}`;

// Kotak "Dipilih": baris yang dicentang selalu tampil di atas daftar (di luar area gulir), lengkap dengan tombol lepas
function SelectedBox({ rows, onRemove, total }) {
  if (!rows.length) return null;
  return (
    <div className="border-b border-emerald-200 bg-emerald-50/70 px-4 py-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-800">
        <span>Dipilih ({rows.length})</span>
        <span className="tabular-nums">Total Rp {rp(total)}</span>
      </div>
      <ul className="max-h-28 space-y-1 overflow-y-auto pr-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px]">
            <span className="shrink-0 tabular-nums text-slate-400">{dm(r.date)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700" title={r.title}>{r.title}</span>
            {r.sub && <span className="hidden shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">{r.sub}</span>}
            <span className="shrink-0 font-bold tabular-nums text-slate-800">Rp {rp(r.amount)}</span>
            <button type="button" onClick={() => onRemove(r.key)} aria-label={`Lepas ${r.title}`} className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><HiOutlineXMark className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Skeleton({ cols }) {
  return Array.from({ length: 5 }).map((_, i) => (
    <tr key={i}>{Array.from({ length: cols }).map((__, j) => <td key={j} className="px-3 py-3"><div className="h-3 animate-pulse rounded bg-slate-100" /></td>)}</tr>
  ));
}

// Dialog Konfirmasi Matching & Alokasi (dua sisi): kiri transaksi internal, kanan mutasi bank.
//   Uang bank KURANG (selisih bertanda minus): alokasikan ke Bank Charge atau Piutang.
//   Uang bank LEBIH (selisih bertanda plus)   : alokasikan ke Deposit atau Pelunasan kekurangan sebelumnya.
function ConfirmMatch({ internal, bank, mode, onMode, categories, catsLoading, picks, setPicks, expl, setExpl, totals, alloc, setAlloc, openPiutang, kasir, onConfirm, onClose, busy, error }) {
  const dir = bank[0] && bank[0].amount < 0 ? "DR" : "CR";
  const ready = bank.every((b) => picks[b.id]);
  const equal = Math.abs(totals.diff) <= TOL;
  const short = totals.diff > TOL; // internal lebih besar → uang masuk kurang
  const gap = Math.abs(totals.diff);
  const canAlloc = dir === "CR" && !equal;
  const onlineOnly = internal.length > 0 && internal.every((i) => i.ref_type === "POS_ONLINE");
  const mdrText = `Potongan MDR ${[...new Set(internal.map((i) => i.method))].join("/")}`;
  const picked = openPiutang.find((p) => p.match_id === Number(alloc.ref));
  const allocOk = !canAlloc || (alloc.type && (alloc.type !== "PIUTANG" || alloc.party.trim()) && (alloc.type !== "PELUNASAN" || (picked && gap <= picked.remaining + TOL)));
  const piutangLabel = onlineOnly ? "pelanggan / pihak terkait" : "kasir / pelanggan";
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              Konfirmasi Matching & Alokasi
              {!equal && <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold", short ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700")}>{short ? "Selisih −" : "Selisih +"}</span>}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-400">Kategori payment dan penyelesaian selisih ditentukan di sini. Belum disimpan sebelum dikonfirmasi.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Transaksi internal ({internal.length})</p>
              <ul className="space-y-1">{internal.map((i) => <li key={keyOf(i)} className="flex justify-between gap-2"><span className="truncate font-mono text-[11px]">{i.ref}</span><span className="tabular-nums font-semibold">Rp {rp(i.remaining)}</span></li>)}</ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Mutasi bank ({bank.length})</p>
              <ul className="space-y-2">
                {bank.map((b) => (
                  <li key={b.id}>
                    <div className="flex justify-between gap-2"><span className="truncate font-mono text-[11px]">{b.recon_code || `#${b.id}`}</span><span className="tabular-nums font-semibold">Rp {rp(b.remaining)}</span></div>
                    <select value={picks[b.id] || ""} onChange={(e) => setPicks((p) => ({ ...p, [b.id]: e.target.value }))} className={cn(inputCls, "mt-1 w-full")} aria-label={`Kategori Payment ${b.recon_code || b.id}`}>
                      <option value="">{catsLoading ? "Memuat kategori..." : "Pilih Kategori Payment *"}</option>
                      {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Ringkasan: total nota, total uang masuk, selisih (minus bila uang masuk kurang) */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5"><div><p className="font-bold text-slate-700">Total Nota</p><p className="text-[10px] text-slate-400">Transaksi internal / POS</p></div><p className="text-sm font-extrabold tabular-nums text-slate-800">Rp {rp(totals.internal)}</p></div>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5"><div><p className="font-bold text-slate-700">Total Uang Masuk</p><p className="text-[10px] text-slate-400">Mutasi bank</p></div><p className="text-sm font-extrabold tabular-nums text-slate-800">Rp {rp(totals.bank)}</p></div>
            <div className={cn("flex items-center justify-between px-4 py-2.5", equal ? "bg-emerald-50/60" : short ? "bg-rose-50/60" : "bg-emerald-50/60")}>
              <p className="flex items-center gap-2 font-bold text-slate-700">Selisih {!equal && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", short ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>{short ? "Kurang" : "Lebih"}</span>}</p>
              <p className={cn("text-base font-extrabold tabular-nums", equal ? "text-emerald-700" : short ? "text-rose-600" : "text-emerald-700")}>{equal ? "Rp 0" : short ? `−Rp ${rp(gap)}` : `+Rp ${rp(gap)}`}</p>
            </div>
          </div>

          {!catsLoading && categories.length === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-900">
              Belum ada Kategori Payment untuk {dir === "CR" ? "uang masuk" : "uang keluar"}. Tambahkan dulu di{" "}
              <Link to="/finance-ho/pengaturan/kategori-payment" className="underline">Pengaturan › Kategori payment</Link>, lalu kembali ke sini.
            </p>
          )}

          {equal ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 font-semibold text-emerald-800">✓ Total sama. Pencocokan penuh.</p>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="font-semibold text-amber-900">Ada selisih Rp {rp(gap)} ({short ? "uang masuk kurang dari nota" : "uang masuk lebih besar dari nota"}). Alokasikan selisih ini ke akun di bawah.</p>
              {canAlloc && (
                <div className="mt-3 space-y-3 border-t border-amber-200/70 pt-3">
                  <p className="font-bold text-amber-900">{short ? "Penyelesaian selisih kurang" : "Alokasi kelebihan dana"}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-[11px] font-semibold text-slate-600">{short ? "Dibebankan ke *" : "Dialokasikan ke *"}
                      <select value={alloc.type} onChange={(e) => setAlloc({ type: e.target.value, party: "", ref: "" })} className={cn(inputCls, "mt-1 w-full")}>
                        <option value="">Pilih...</option>
                        {short ? (
                          <>
                            <option value="BANK_CHARGE">Bank Charge — biaya admin / MDR</option>
                            <option value="PIUTANG">Piutang — ditagih ke {piutangLabel}</option>
                          </>
                        ) : (
                          <>
                            <option value="DEPOSIT">Deposit / uang lebih — disimpan sebagai saldo</option>
                            <option value="PELUNASAN">Pelunasan kekurangan sebelumnya — tutup piutang lama</option>
                          </>
                        )}
                      </select>
                    </label>
                    {alloc.type === "PIUTANG" && (
                      <label className="text-[11px] font-semibold text-slate-600">Pihak piutang *
                        <input list="rekon-kasir" value={alloc.party} onChange={(e) => setAlloc({ ...alloc, party: e.target.value })} placeholder={onlineOnly ? "Nama pelanggan / pihak" : "Pilih kasir atau ketik nama"} className={cn(inputCls, "mt-1 w-full")} />
                        <datalist id="rekon-kasir">{(kasir || []).map((k) => <option key={k} value={k} />)}</datalist>
                        <span className="mt-1 block text-[10px] font-normal text-slate-400">Pakai nama yang sama setiap kali agar utang orang ini bisa ditelusuri dan dilunasi nanti.</span>
                      </label>
                    )}
                    {alloc.type === "PELUNASAN" && (
                      <label className="text-[11px] font-semibold text-slate-600">Kekurangan yang dilunasi *
                        <select value={alloc.ref} onChange={(e) => setAlloc({ ...alloc, ref: e.target.value })} className={cn(inputCls, "mt-1 w-full")}>
                          <option value="">{openPiutang.length ? "Pilih kekurangan..." : "Belum ada kekurangan terbuka"}</option>
                          {[["Cabang ini", openPiutang.filter((p) => p.same_outlet)], ["Cabang lain", openPiutang.filter((p) => !p.same_outlet)]].filter(([, l]) => l.length).map(([g, l]) => (
                            <optgroup key={g} label={g}>
                              {l.map((p) => <option key={p.match_id} value={p.match_id}>{p.code} · {dm(p.created)} · {p.party || p.outlet_name || "-"} · sisa Rp {rp(p.remaining)}{p.party_total > p.remaining ? ` (total utang ${p.party || "pihak ini"} Rp ${rp(p.party_total)})` : ""}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  {alloc.type === "PIUTANG" && <p className="rounded-lg bg-amber-100/70 p-2.5 text-[11px] font-semibold text-amber-900">Terdapat selisih sebesar Rp {rp(gap)}. Akan otomatis masuk ke akun piutang.</p>}
                  {alloc.type === "BANK_CHARGE" && <p className="rounded-lg bg-amber-100/70 p-2.5 text-[11px] font-semibold text-amber-900">Selisih Rp {rp(gap)} dicatat sebagai biaya bank (Beban Administrasi / MDR).</p>}
                  {alloc.type === "DEPOSIT" && <p className="rounded-lg bg-emerald-100/70 p-2.5 text-[11px] font-semibold text-emerald-900">Kelebihan Rp {rp(gap)} dicatat sebagai deposit (kewajiban), bukan pendapatan.</p>}
                  {alloc.type === "PELUNASAN" && picked && gap > picked.remaining + TOL && <p className="rounded-lg bg-rose-100/70 p-2.5 text-[11px] font-semibold text-rose-800">Kelebihan lebih besar dari sisa kekurangan (Rp {rp(picked.remaining)}). Pilih kekurangan lain atau alokasikan ke Deposit.</p>}
                  <label className="block text-[11px] font-semibold text-slate-600">Remark selisih <span className="font-normal text-slate-400">(opsional)</span>
                    <textarea rows={2} value={expl} onChange={(e) => setExpl(e.target.value)} placeholder={short ? "Mis. Setoran tunai kurang, sisa Rp 496.260 belum disetor kasir. Akan disetor susulan." : "Mis. Setoran susulan kekurangan shift sore 12 Nov (Kasir Rizky)."} className={cn(inputCls, "mt-1 w-full resize-none")} />
                  </label>
                  {onlineOnly && short && alloc.type === "BANK_CHARGE" && (
                    <button type="button" onClick={() => setExpl(mdrText)} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100">Isi remark: {mdrText}</button>
                  )}
                </div>
              )}
              {!canAlloc && dir === "DR" && (
                <div className="mt-3 border-t border-amber-200/70 pt-3">
                  <p className="font-semibold text-amber-900">Penjelasan selisih <span className="font-normal text-amber-700">(boleh diisi nanti)</span></p>
                  <input value={expl} onChange={(e) => setExpl(e.target.value)} placeholder="Jelaskan selisih" className={cn(inputCls, "mt-1.5 w-full")} />
                </div>
              )}
            </div>
          )}
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
          <button type="button" disabled={!ready || busy || !allocOk} onClick={onConfirm} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
            {busy ? "Menyimpan..." : "Konfirmasi Pencocokan"}
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
  const [pays, setPays] = useState(null); // nota di balik baris internal (+ foto bukti)
  const [nota, setNota] = useState(null);
  const [photo, setPhoto] = useState(null);
  const x = target.row;
  useEffect(() => {
    if (target.side !== "L" || !["POS_CASH", "POS_TRF", "POS_ONLINE"].includes(x.ref_type)) return undefined;
    let alive = true;
    api(`/finance-ho/rekon/workspace/internal-detail?ref_type=${encodeURIComponent(x.ref_type)}&ref_key=${encodeURIComponent(x.ref_key)}`).then((r) => alive && setPays(r)).catch(() => alive && setPays({ payments: [] }));
    return () => { alive = false; };
  }, [target.side, x.ref_type, x.ref_key]);
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
          <div className="flex items-center justify-between"><span className="font-mono text-sm font-bold text-slate-800">{target.side === "L" ? x.ref : x.recon_code || `#${x.id}`}</span><Badge s={x.status} resolved={x.resolved} alloc={x.alloc_type} /></div>
          {target.side === "L" ? (
            <div>
              {kv("Tanggal", dm(x.date) + "/" + (x.date || "").slice(0, 4))}{kv("Cabang", x.outlet_name)}{kv("Keterangan", x.desc)}{kv("Metode", x.method)}
              {kv("Nominal", `Rp ${rp(x.amount)}`)}{x.used > 0 && kv("Sudah dicocokkan", `Rp ${rp(x.used)} (sisa Rp ${rp(x.remaining)})`)}{kv("Sumber data", x.source)}
              {x.children?.length > 0 && kv("Tahap sebelumnya", x.children.map((c, i) => <span key={i} className="block">{c}</span>))}
              {x.pos_diff ? kv("Selisih dengan POS", `Rp ${rp(x.pos_diff)}`) : null}
              {x.category && kv("Kategori Payment", x.category)}
              {(x.pairs || []).length > 0 && kv("Pasangan di bank", x.pairs.map((p, i) => <span key={i} className="block">{p.bank_label} · {p.recon_code || `#${p.statement_id}`} · {dm(p.date)} · Rp {rp(p.amount)}</span>))}
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
          {target.side === "L" && pays && pays.payments.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Nota di balik transaksi ini ({pays.payments.length}{pays.truncated ? "+" : ""})</p>
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {pays.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                    {p.has_proof && p.proof ? (
                      <button type="button" onClick={() => setPhoto(p.proof)} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200" title="Lihat bukti pembayaran"><img src={p.proof} alt="" className="h-full w-full object-cover" loading="lazy" /></button>
                    ) : (
                      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed", p.has_proof ? "border-emerald-300 text-emerald-600" : "border-slate-200 text-slate-300")} title={p.has_proof ? "Ada foto bukti (alamat server foto belum diatur)" : "Tidak ada foto bukti"}><HiOutlinePhoto className="h-4 w-4" /></span>
                    )}
                    <button type="button" onClick={() => setNota(p.transaction_id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate font-mono text-[11px] font-bold text-emerald-700 hover:underline">{p.order_no}</p>
                      <p className="truncate text-[11px] text-slate-500">{p.time} · {p.method}{p.customer ? ` · ${p.customer}` : ""}</p>
                    </button>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-700">Rp {rp(p.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-slate-400">Klik nota untuk melihat rincian dan foto bukti pembayaran.</p>
            </div>
          )}
          {matches.map((m) => (
            <div key={m.match.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pencocokan #{m.match.id} · {m.match.status === "MATCHED" ? "penuh" : m.match.status === "PARTIAL" ? "sebagian" : `dengan selisih Rp ${rp(Math.abs(m.match.difference))}`}</p>
              <ul className="mt-1 space-y-0.5">{m.items.map((i, k) => <li key={k} className="flex justify-between gap-2 text-[11px]"><span>{i.side === "BANK" ? "Bank" : "Internal"} · {i.ref_type} {i.ref_key}{i.category_label ? ` · ${i.category_label}` : ""}</span><span className="tabular-nums">Rp {rp(i.amount)}</span></li>)}</ul>
              {m.match.alloc_type && <p className="mt-1.5 rounded bg-slate-50 p-2 text-[11px] font-semibold text-slate-700">Alokasi selisih: {{ BANK_CHARGE: "Bank Charge", PIUTANG: `Piutang${m.match.alloc_party ? ` (${m.match.alloc_party})` : ""}`, DEPOSIT: "Deposit / uang lebih", PELUNASAN: `Pelunasan kekurangan #${m.match.alloc_ref_match_id || ""}` }[m.match.alloc_type]}</p>}
              {m.match.explanation && <p className="mt-1.5 rounded bg-orange-50 p-2 text-[11px] text-orange-800">Remark: {m.match.explanation}</p>}
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
        {nota && <NotaModal transactionId={nota} onClose={() => setNota(null)} />}
        {photo && (
          <div className="fixed inset-0 z-[10100] flex items-center justify-center bg-black/80 p-4" onClick={() => setPhoto(null)}><img src={photo} alt="Bukti pembayaran" className="max-h-full max-w-full rounded-xl" /></div>
        )}
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

export default function Workspace() {
  const [period, setPeriod] = useState(() => defaultPeriod({ mode: "date", from: yesterdayWib(), to: yesterdayWib() }));
  const range = periodRange(period);
  const [bankId, setBankId] = useState("ALL"); // ALL = Semua rekening
  const [outlet, setOutlet] = useState("");
  const [methods, setMethods] = useState([]); // Metode: boleh lebih dari satu
  const [alloc, setAlloc] = useState({ type: "", party: "", ref: "" });
  const [openPiutang, setOpenPiutang] = useState([]);
  const [kasir, setKasir] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const leftRef = useRef(null);
  const [statusF, setStatusF] = useState("belum");
  const [allocF, setAllocF] = useState(""); // khusus Difference: BANK_CHARGE | PIUTANG | OTHER
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
  const [depMode, setDepMode] = useState(false); // mode Deposit: nota ↔ deposit (bukan mutasi bank)
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
    const my = ++seq.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from: range.from || "", to: range.to || "", status: statusF });
      if (bankId) qs.set("bank_account_id", bankId);
      if (outlet) qs.set("outlet", outlet);
      if (methods.length) qs.set("method", methods.join(","));
      if (statusF === "Difference" && allocF) qs.set("alloc", allocF);
      const res = await api(`/finance-ho/rekon/workspace?${qs}`);
      if (my !== seq.current) return;
      setData(res);
      setError("");
    } catch (e) {
      if (my === seq.current) setError(e.message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [range.from, range.to, bankId, outlet, methods, statusF, allocF]);
  useEffect(() => { load(); }, [load]);

  const internal = data?.internal || [];
  const bankRows = data?.bank_rows || [];
  const sg = data?.suggestions || {};
  const sortFn = (mode, amt) => (a, b) => (mode === "big" ? amt(b) - amt(a) : a.date.localeCompare(b.date) || amt(b) - amt(a));
  const match = (s, q) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  // Kandidat pasangan untuk mutasi bank yang dicentang (kunci → skor), dihitung dulu agar bisa dipin di atas panel kiri
  const candScore = useMemo(() => {
    const m = new Map();
    [...selR].forEach((id) => (sg[id] || []).forEach((c) => c.items.forEach((it) => { const k = `${it.ref_type}:${it.ref_key}`; m.set(k, Math.max(m.get(k) || 0, c.score)); })));
    return m;
  }, [selR, sg]);
  const L = useMemo(() => {
    const list = internal.filter((x) => match(`${x.ref} ${x.desc} ${x.outlet_name} ${x.amount}`, qL)).sort(sortFn(sortL, (x) => x.amount));
    if (!candScore.size) return list;
    // Pasangan langsung tampil di paling atas (skor tertinggi dulu), tanpa perlu menggulir
    const top = list.filter((x) => candScore.has(keyOf(x))).sort((a, b) => candScore.get(keyOf(b)) - candScore.get(keyOf(a)));
    return [...top, ...list.filter((x) => !candScore.has(keyOf(x)))];
  }, [internal, qL, sortL, candScore]);
  const R = useMemo(() => bankRows.filter((x) => match(`${x.description} ${x.recon_code || ""} ${x.amount}`, qR)).sort(sortFn(sortR, (x) => Math.abs(x.amount))), [bankRows, qR, sortR]);

  const cand = candScore;

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
    // Pasangan terbaik di kiri langsung tampil di atas dan ikut dicentang bila yakin (skor ≥ 60)
    const best = (sg[b.id] || [])[0];
    if (best && best.score >= 60 && !selR.has(b.id) && selR.size === 0 && selL.size === 0) {
      setSelL(new Set(best.items.map((i) => `${i.ref_type}:${i.ref_key}`)));
    }
    setTimeout(() => { if (leftRef.current) leftRef.current.scrollTop = 0; }, 30);
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
    setAlloc({ type: "", party: "", ref: "" });
    setDlg({ mode });
    const oid = selLRows[0]?.outlet_id || "";
    api(`/finance-ho/rekon/workspace/open-piutang?outlet=${oid}`).then((r) => setOpenPiutang(r.items || [])).catch(() => setOpenPiutang([]));
    api(`/finance-ho/rekon/workspace/parties?outlet=${oid}`).then((r) => setKasir(r.kasir || [])).catch(() => setKasir([]));
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
      const bankIds = [...new Set(selRRows.map((b) => b.bank_account_id || Number(bankId)))];
      if (bankIds.length !== 1 || !bankIds[0]) throw new Error("Mutasi dari rekening yang berbeda tidak bisa dicocokkan sekaligus. Pilih mutasi dari satu rekening.");
      const r = await api("/finance-ho/rekon/workspace/match", {
        method: "POST",
        body: JSON.stringify({
          bank_account_id: bankIds[0], mode: equal ? "FULL" : dlg.mode, explanation: !equal && dlg.mode === "DIFF" ? expl : undefined,
          allocation: !equal && dlg.mode === "DIFF" && alloc.type ? { type: alloc.type, party: alloc.party, settles_match_id: alloc.ref ? Number(alloc.ref) : undefined } : undefined,
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
  const da = s?.diff_alloc;
  const noBanks = data && !data.banks.length;

  return (
    <div className="space-y-4">
      <HeaderActions>
        <MoreFilters
          count={(outlet ? 1 : 0) + (bankId !== "ALL" ? 1 : 0) + (methods.length ? 1 : 0) + (statusF !== "belum" ? 1 : 0) + (periodChanged(period, defaultPeriod({ mode: "date", from: yesterdayWib(), to: yesterdayWib() })) ? 1 : 0)}
          summary={periodLabel(period)}
          onReset={() => { setOutlet(""); setBankId("ALL"); clear(); setMethods([]); setStatusF("belum"); setAllocF(""); setPeriod(defaultPeriod({ mode: "date", from: yesterdayWib(), to: yesterdayWib() })); }}
        >
          <FieldSelect label="Cabang" value={outlet} onChange={setOutlet}>
            <option value="">Semua</option>
            {(data?.outlets || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </FieldSelect>
          <FieldSelect label="Rekening" value={bankId} onChange={(v) => { setBankId(v); clear(); }} selectClassName="max-w-[260px]">
            <option value="ALL">Semua rekening</option>
            {(data?.banks || []).map((b) => <option key={b.id} value={b.id}>{b.bank_name} {b.account_no}{b.holder ? ` · ${b.holder}` : ""}</option>)}
          </FieldSelect>
          <FieldMultiSelect label="Metode" value={methods} onChange={setMethods} options={[["Tunai", "Tunai"], ["Transfer", "Transfer"], ["QRIS", "QRIS"], ["EDC", "EDC"]]} />
          <FieldSelect label="Status" value={statusF} onChange={setStatusF}>
            <option value="belum">Belum selesai</option><option value="all">Semua</option><option value="Matched">Matched</option>
            {Object.entries(STATUS).filter(([k]) => !["Matched"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v[0].replace(/^\S+ /, "")}</option>)}
          </FieldSelect>
          <PeriodPicker value={period} onChange={setPeriod} maxDate={todayWib()} />
        </MoreFilters>
        <button type="button" onClick={() => setShowImport(true)} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700"><HiOutlineArrowUpTray className="h-4 w-4" /> Import Excel/CSV</button>
        <PrimaryButton onClick={autoMatch}>✦ Auto match</PrimaryButton>
        <RefreshButton onClick={load} spinning={loading} />
      </HeaderActions>
      {showImport && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowImport(false)} />
          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-slate-50 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
              <div><h3 className="text-base font-bold text-slate-800">Import Excel/CSV</h3><p className="mt-0.5 text-[11px] text-slate-400">Unggah rekening koran (uang yang benar-benar masuk/keluar bank), lalu cocokkan di sini.</p></div>
              <button type="button" onClick={() => setShowImport(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><HiOutlineXMark className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-6"><ImportMutasi onDone={() => { setShowImport(false); load(); }} /></div>
          </div>
        </div>
      )}

      {error && <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><HiOutlineExclamationTriangle className="h-4 w-4" /> {error} <button type="button" onClick={load} className="ml-auto underline">Coba lagi</button></p>}
      {noBanks && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Belum ada rekening bank aktif. Tambahkan di <Link to="/finance-ho/pengaturan/rekening-bank" className="font-bold underline">Pengaturan › Rekening bank</Link>, lalu impor rekening koran.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { k: "belum", label: "Total Transaksi / Nota", v: s?.internal_count, tone: "text-slate-800", sub: s ? `${rp(s.reconciliated)} reconciliated · ${rp(s.belum)} belum selesai` : "" },
          { k: "PendingBank", label: "Pending Bank", v: s?.pending_bank, tone: "text-amber-600", sub: "menunggu uang masuk di bank" },
          { k: "Matched", label: "Matched", v: s?.matched, tone: "text-emerald-600", sub: "sudah cocok dengan bank" },
          { k: "Difference", label: "Difference", v: s?.difference, tone: "text-rose-600", sub: "pasang dengan selisih", split: true },
          { k: "deposit", label: "Deposit", v: da ? `Rp ${rp(da.deposit)}` : "-", tone: "text-sky-700", sub: "kelebihan bayar disimpan sebagai deposit", dep: true },
        ].map((c) => c.dep ? (
          <button key={c.k} type="button" onClick={() => { setDepMode((v) => !v); clear(); }} className={cn("rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400", depMode ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-200" : "border-slate-200")}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.label}</p>
            <p className={cn("mt-1 text-xl font-extrabold tabular-nums", c.tone)}>{loading && !data ? "…" : c.v}</p>
            {da?.deposit_remaining != null && <p className="mt-0.5 text-[11px] font-bold tabular-nums text-sky-700">sisa Rp {rp(da.deposit_remaining)}</p>}
            <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{depMode ? "mode deposit aktif · klik untuk kembali" : c.sub}</p>
          </button>
        ) : c.split ? (
          <div key={c.k} className={cn("rounded-2xl border bg-white p-4 text-left shadow-sm transition", statusF === "Difference" ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200 hover:border-emerald-300")}>
            <button type="button" onClick={() => { setAllocF(""); setStatusF(statusF === "Difference" && !allocF ? "all" : "Difference"); }} className="block w-full text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.label}</p>
              <p className={cn("mt-1 text-xl font-extrabold tabular-nums", c.tone)}>{loading && !data ? "…" : rp(c.v)}</p>
            </button>
            {/* Dua jenis selisih berjejer menyamping; klik untuk memfilter, nominal ada di tooltip */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug">
              {[["BANK_CHARGE", "Bank Charge", s?.diff_pairs?.bank_charge, da?.bank_charge, "Alasan MDR / biaya bank"], ["PIUTANG", "Piutang", s?.diff_pairs?.piutang, da?.piutang, "Ditagih ke kasir / pelanggan"], ["OTHER", "Lainnya", s?.diff_pairs?.lainnya, (da?.belum_dialokasi || 0) + (da?.deposit || 0) + (da?.pelunasan || 0), "Deposit, pelunasan, atau belum dialokasi"]].filter(([k, , n]) => k !== "OTHER" || n > 0).map(([k, l, n, amt, tip], i) => (
                <span key={k} className="flex items-center gap-2">
                  {i > 0 && <span className="text-slate-300">·</span>}
                  <button type="button" title={`${tip} — Rp ${rp(amt || 0)}`} onClick={() => { setStatusF("Difference"); setAllocF(allocF === k && statusF === "Difference" ? "" : k); }} className={cn("rounded font-semibold hover:text-emerald-700", statusF === "Difference" && allocF === k ? "font-bold text-emerald-700 underline" : "text-slate-400")}>
                    {l} {rp(n || 0)}
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <button key={c.k} type="button" onClick={() => { setDepMode(false); setStatusF(statusF === c.k ? "all" : c.k); }} className={cn("rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-emerald-300", statusF === c.k && !depMode ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200")}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.label}</p>
            <p className={cn("mt-1 text-xl font-extrabold tabular-nums", c.tone)}>{loading && !data ? "…" : rp(c.v)}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{statusF === c.k && !depMode ? "filter aktif · klik untuk semua" : c.sub}</p>
          </button>
        ))}
      </div>

      {depMode && <DepositMode from={range.from} to={range.to} outlet={outlet} onExit={() => setDepMode(false)} onMatched={(msg) => { showToast({ msg }); load(); }} />}

      {!depMode && <>
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
          {cand.size > 0 && (
            <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-[11px] font-semibold text-emerald-800">✦ {cand.size} pasangan untuk mutasi bank yang dicentang ditampilkan di paling atas{selL.size ? " (pasangan terbaik sudah dicentang)" : ""}.</p>
          )}
          <SelectedBox
            rows={selLRows.map((x) => ({ key: keyOf(x), date: x.date, title: x.ref, sub: x.outlet_name, amount: x.remaining }))}
            total={totals.internal}
            onRemove={(k) => setSelL((st) => { const n = new Set(st); n.delete(k); return n; })}
          />
          <div ref={leftRef} className="max-h-[440px] overflow-auto">
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
                          {(x.pairs || []).map((p) => (
                            <button key={p.statement_id} type="button" onClick={(e) => { e.stopPropagation(); if (p.other_bank) { setBankId(String(p.bank_account_id)); clear(); } }} title={p.other_bank ? "Pasangan ada di rekening lain. Klik untuk membuka rekening itu." : "Pasangan di mutasi bank (panel kanan)"} className={cn("mt-1 flex max-w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] font-semibold", p.other_bank ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-sky-50 text-sky-700 cursor-default")}>
                              ↔ {p.bank_label} · {p.recon_code || `#${p.statement_id}`} · Rp {rp(p.amount)}{p.other_bank ? " · buka rekening ›" : ""}
                            </button>
                          ))}
                          {c && <span className="ml-1 mt-0.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">✦ {c}% cocok</span>}
                        </td>
                        <td className="px-2 py-2.5 align-top">{x.method}</td>
                        <td className="px-2 py-2.5 text-right align-top font-semibold tabular-nums">{x.dir === "IN" ? rp(x.amount) : ""}</td>
                        <td className="px-2 py-2.5 text-right align-top font-semibold tabular-nums">{x.dir === "OUT" ? rp(x.amount) : ""}</td>
                        <td className="px-2 py-2.5 align-top"><Badge s={x.status} resolved={x.resolved} alloc={x.alloc_type} />{x.used > 0 && x.remaining > TOL && <div className="mt-1 text-[10px] font-semibold text-sky-700">sisa Rp {rp(x.remaining)}</div>}</td>
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
            <div><h2 className="text-sm font-extrabold text-slate-900">Mutasi Bank</h2><p className="text-[11px] text-slate-400">{data?.bank ? `${data.bank.bank_name} ${data.bank.account_no}` : data?.all_banks ? "Semua rekening" : "Dari impor rekening koran"} · {s ? `${rp(s.bank_unmatched)} tersisa` : ""}</p></div>
            <div className="flex items-center gap-2">
              <div className="relative"><HiOutlineMagnifyingGlass className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={qR} onChange={(e) => setQR(e.target.value)} placeholder="Cari keterangan, nominal" className={cn(inputCls, "w-44 pl-7")} /></div>
              <select value={sortR} onChange={(e) => setSortR(e.target.value)} className={inputCls}><option value="old">Terlama dulu</option><option value="big">Nominal terbesar</option></select>
            </div>
          </div>
          <SelectedBox
            rows={selRRows.map((x) => ({ key: x.id, date: x.date, title: x.recon_code || x.description, sub: x.amount < 0 ? "Debit" : "Kredit", amount: x.remaining }))}
            total={totals.bank}
            onRemove={(k) => setSelR((st) => { const n = new Set(st); n.delete(k); return n; })}
          />
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50"><tr><th className="w-8 px-3 py-2.5" /><th className={thCls}>Tanggal</th><th className={thCls}>Keterangan</th><th className={cn(thCls, "text-right")}>Debit</th><th className={cn(thCls, "text-right")}>Kredit</th><th className={cn(thCls, "text-right")}>Saldo</th><th className={thCls}>Kategori Payment</th><th className={thCls}>Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !data ? <Skeleton cols={8} /> : R.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-14 text-center">
                    <p className="text-xs text-slate-400">{bankRows.length === 0 && !s?.bank_unmatched && statusF !== "all" ? "Belum ada mutasi bank yang perlu dicocokkan." : "Tidak ada mutasi pada filter ini."}</p>
                    <button type="button" onClick={() => setShowImport(true)} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">⬆ Import rekening koran</button>
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
                          {bankId === "ALL" && x.bank_label && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">{x.bank_label}</span>}
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
                      <td className="px-2 py-2.5 align-top"><Badge s={x.status} resolved={x.resolved} alloc={x.alloc_type} />{x.used > 0 && x.remaining > TOL && <div className="mt-1 text-[10px] font-semibold text-sky-700">sisa Rp {rp(x.remaining)}</div>}</td>
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
          <div>
            <span className="text-slate-400">Selisih</span>{" "}
            <b className={cn("tabular-nums", !ready ? "text-slate-800" : equal ? "text-emerald-600" : totals.diff > 0 ? "text-rose-600" : "text-emerald-600")}>
              {!ready || equal ? "Rp 0" : totals.diff > 0 ? `−Rp ${rp(totals.diff)}` : `+Rp ${rp(Math.abs(totals.diff))}`}
            </b>
            {ready && !equal && <span className="ml-1.5 text-[10px] font-semibold text-slate-400">{totals.diff > 0 ? "uang masuk kurang" : "uang masuk lebih"}</span>}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selRRows.length > 0 && cand.size > 0 && [...cand.keys()].some((k) => !selL.has(k)) && <button type="button" onClick={pickBest} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100">✦ Pilih pasangan</button>}
            <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal pilih (Esc)</button>
            {ready && !equal ? (
              <>
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
      </>}

      {dlg && (
        <ConfirmMatch
          internal={selLRows} bank={selRRows} mode={dlg.mode} onMode={(m) => setDlg({ mode: m })} categories={categories} catsLoading={catsLoading}
          picks={picks} setPicks={setPicks} expl={expl} setExpl={setExpl} totals={totals} alloc={alloc} setAlloc={setAlloc} openPiutang={openPiutang} kasir={kasir} onConfirm={confirmMatch} onClose={() => setDlg(null)} busy={busy} error={dlgErr}
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
