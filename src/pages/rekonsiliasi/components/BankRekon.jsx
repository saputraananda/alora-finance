import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineLink,
  HiOutlineSparkles,
  HiOutlineTrash,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api, getToken } from "../../../lib/api";
import { currentCutoffKey, cutoffMonthLabel, cutoffRangeLabel, recentCutoffKeys } from "../../../lib/cutoff";
import ConfirmModal from "../../../components/ui/ConfirmModal";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const signed = (n) => (Number(n) < 0 ? `-${rp(Math.abs(n))}` : rp(n));
const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "-");
const inputCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

async function upload(path, file, fields) {
  const fd = new FormData();
  fd.append("file", file);
  Object.entries(fields || {}).forEach(([k, v]) => fd.append(k, v));
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api${path}`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.inserted) throw Object.assign(new Error(data.message || "Gagal mengunggah."), { data });
  return data;
}

// Pilih baris jurnal untuk dicocokkan manual ke satu mutasi (boleh lebih dari satu baris)
function MatchModal({ stmt, candidates, onClose, onSaved }) {
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const sameSign = candidates.filter((c) => Math.sign(c.amount) === Math.sign(stmt.amount));
  const sum = picked.reduce((s, id) => s + (sameSign.find((c) => c.id === id)?.amount || 0), 0);
  const ok = Math.abs(sum - stmt.amount) <= 1;

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await api("/finance-ho/rekon/bank/match", { method: "POST", body: JSON.stringify({ statement_id: stmt.id, line_ids: picked }) });
      onSaved(res.message);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]" style={{ maxHeight: "92vh" }}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Cocokkan manual</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">{dm(stmt.date)} · {stmt.description} · Rp {signed(stmt.amount)}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50"><HiOutlineXMark className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {sameSign.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">Tidak ada baris jurnal yang belum dicocokkan dengan arah yang sama.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead><tr><th className={th} /><th className={th}>Tgl</th><th className={th}>No. jurnal</th><th className={th}>Keterangan</th><th className={cn(th, "text-right")}>Jumlah</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sameSign.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))}>
                    <td className="px-3 py-2"><input type="checkbox" readOnly checked={picked.includes(c.id)} /></td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{dm(c.entry_date)}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{c.entry_no}</td>
                    <td className="px-3 py-2 text-slate-600">{c.memo || c.description}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{signed(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {err && <p className="mt-3 text-xs font-semibold text-rose-600">{err}</p>}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <span className={cn("text-xs font-bold", ok ? "text-emerald-700" : "text-slate-500")}>
            Terpilih Rp {signed(sum)} / mutasi Rp {signed(stmt.amount)}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
            <button type="button" disabled={!ok || busy} onClick={save} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {busy ? "Menyimpan..." : "Cocokkan"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function BankRekon() {
  const [month, setMonth] = useState(currentCutoffKey());
  const [bankId, setBankId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [matchFor, setMatchFor] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [balanceInput, setBalanceInput] = useState("");

  const ym = useMemo(() => month.split("-").map(Number), [month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ year: String(ym[0]), month: String(ym[1]) });
      if (bankId) qs.set("bank_account_id", bankId);
      const res = await api(`/finance-ho/rekon/bank?${qs}`);
      setData(res);
      if (!bankId && res.bank) setBankId(String(res.bank.id));
      setBalanceInput(res.summary?.statement_balance_source === "MANUAL" ? String(res.summary.statement_balance) : "");
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [ym, bankId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fn();
      setMsg({ type: res?.errors?.length ? "error" : "ok", text: res.message, details: res.errors });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message, details: e.data?.errors });
    } finally {
      setBusy(null);
    }
  };

  const downloadTemplate = async () => {
    const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
    const res = await fetch(`${base}/api/finance-ho/rekon/bank/template`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-rekening-koran.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = data?.summary;
  const body = { bank_account_id: Number(bankId), year: ym[0], month: ym[1] };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs font-medium", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {msg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="flex-1">
            <p>{msg.text}</p>
            {msg.details?.length > 0 && <ul className="mt-1 list-disc pl-4 text-[11px]">{msg.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          </div>
          <button type="button" onClick={() => setMsg(null)} className="opacity-60 hover:opacity-100"><HiOutlineXMark className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
        <label className="flex items-center gap-1.5">Rekening:
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} className={inputCls}>
            {(data?.banks || []).map((b) => <option key={b.id} value={b.id}>{b.outlet_name} · {b.bank_name} {b.account_no}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">Periode:
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} title={cutoffRangeLabel(month)}>
            {recentCutoffKeys(18).map((k) => <option key={k} value={k}>{cutoffMonthLabel(k)}</option>)}
          </select>
        </label>
        <span className="text-[11px] font-medium text-slate-400">{cutoffRangeLabel(month)}</span>
      </div>

      {data && !data.banks.length && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Belum ada rekening bank aktif. Tambahkan di <Link to="/finance-ho/pengaturan?tab=bank" className="font-bold underline">Pengaturan › Rekening bank</Link>.
        </p>
      )}

      {data?.bank && (
        <>
          {!data.bank.account && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Rekening ini belum punya akun COA, jadi saldo sistem dan pencocokan tidak bisa dihitung. Atur di <Link to="/finance-ho/pengaturan?tab=bank" className="font-bold underline">Pengaturan › Rekening bank</Link>.
            </p>
          )}
          {data.bank.shared_coa && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">
              Akun {data.bank.account} dipakai beberapa rekening, jadi saldo sistem dan jurnal disaring per cabang ({data.bank.outlet_name}). Sebaiknya tiap rekening punya akun COA sendiri.
            </p>
          )}

          {/* Ringkasan saldo */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo rekening koran</p>
              <p className="mt-1 text-xl font-extrabold text-slate-800">{s.statement_balance == null ? "-" : rp(s.statement_balance)}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <input type="number" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} placeholder={s.statement_balance_source === "FILE" ? "dari file (isi untuk menimpa)" : "isi saldo akhir periode"} className={cn(inputCls, "w-full")} />
                <button type="button" disabled={busy === "bal"} onClick={() => run("bal", () => api("/finance-ho/rekon/bank/balance", { method: "PUT", body: JSON.stringify({ ...body, closing_balance: balanceInput }) }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-emerald-400">Simpan</button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo di sistem</p>
              <p className="mt-1 text-xl font-extrabold text-slate-800">{s.system_balance == null ? "-" : rp(s.system_balance)}</p>
              <p className="mt-1 text-[11px] text-slate-400">{data.bank.account || "Akun belum diatur"} per {cutoffRangeLabel(month).split("–")[1]?.trim()}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selisih</p>
              <p className={cn("mt-1 text-xl font-extrabold", s.diff == null ? "text-slate-400" : Math.abs(s.diff) < 1 ? "text-emerald-700" : "text-rose-600")}>{s.diff == null ? "-" : signed(s.diff)}</p>
              <p className="mt-1 text-[11px] text-slate-400">{s.matched} dari {s.total} mutasi sudah dicocokkan</p>
            </div>
          </div>

          {/* Aksi */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="min-w-[220px] flex-1 text-xs text-slate-600">Unggah mutasi rekening koran (CSV / Excel): kolom <span className="font-mono text-[11px]">tanggal, keterangan, debit, kredit, saldo</span> atau <span className="font-mono text-[11px]">jumlah</span> (+ masuk, − keluar).</p>
            <button type="button" onClick={downloadTemplate} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-700">Unduh template</button>
            <button type="button" disabled={busy !== null || !data.bank.account} onClick={() => run("auto", () => api("/finance-ho/rekon/bank/auto-match", { method: "POST", body: JSON.stringify(body) }))} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40">
              <HiOutlineSparkles className="h-4 w-4" /> {busy === "auto" ? "Mencocokkan..." : "Cocokkan otomatis"}
            </button>
            <label className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700">
              {busy === "import" ? "Mengimpor..." : "Pilih file"}
              <input type="file" accept=".csv,.xlsx" className="hidden" disabled={busy !== null} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run("import", () => upload("/finance-ho/rekon/bank/import", f, { bank_account_id: bankId })); }} />
            </label>
          </div>

          {/* Daftar mutasi */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr><th className={th}>Tanggal</th><th className={th}>Mutasi di rekening koran</th><th className={cn(th, "text-right")}>Jumlah</th><th className={th}>Dicocokkan dengan</th><th className={th}>Status</th><th className={th} /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && !data.rows.length ? (
                    <tr><td colSpan={6} className="py-10 text-center text-slate-400">Memuat...</td></tr>
                  ) : data.rows.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-slate-400">Belum ada mutasi diimpor untuk periode ini.</td></tr>
                  ) : (
                    data.rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 tabular-nums text-slate-500">{dm(r.date)}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{r.description}</td>
                        <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", r.amount < 0 && "text-rose-600")}>{signed(r.amount)}</td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-600">{r.matches.length ? r.matches.map((m) => m.entry_no).join(", ") : "-"}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold", r.matched ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                            {r.matched ? (r.match_mode === "AUTO" ? "Cocok (otomatis)" : r.match_mode === "JURNAL" ? "Cocok (jurnal baru)" : "Cocok") : "Belum ada"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          {r.matched ? (
                            <button type="button" onClick={() => run("un" + r.id, () => api("/finance-ho/rekon/bank/unmatch", { method: "POST", body: JSON.stringify({ statement_id: r.id }) }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-amber-300 hover:text-amber-700">
                              Batalkan
                            </button>
                          ) : (
                            <>
                              <button type="button" disabled={!data.bank.account} onClick={() => setMatchFor(r)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40">
                                <HiOutlineLink className="h-3.5 w-3.5" /> Cocokkan manual
                              </button>
                              {r.amount < 0 && (
                                <button type="button" disabled={busy !== null || !data.bank.account} onClick={() => run("fee" + r.id, () => api("/finance-ho/rekon/bank/admin-fee", { method: "POST", body: JSON.stringify({ statement_id: r.id }) }))} className="ml-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-40">
                                  Buat jurnal biaya admin
                                </button>
                              )}
                              <button type="button" onClick={() => setToDelete(r)} title="Hapus mutasi" className="ml-1.5 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
                                <HiOutlineTrash className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500">
              Otomatis: nominal dan arah sama, tanggal jurnal H-3 s/d H+1. Satu mutasi bisa dicocokkan ke beberapa baris jurnal (mis. transfer QRIS untuk dua cabang) lewat "Cocokkan manual".
            </p>
          </div>
        </>
      )}

      {matchFor && (
        <MatchModal
          stmt={matchFor}
          candidates={data?.candidates || []}
          onClose={() => setMatchFor(null)}
          onSaved={async (m) => {
            setMatchFor(null);
            setMsg({ type: "ok", text: m });
            await load();
          }}
        />
      )}
      <ConfirmModal
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Hapus mutasi?"
        desc={toDelete ? `${dm(toDelete.date)} · ${toDelete.description} · Rp ${signed(toDelete.amount)}` : ""}
        onConfirm={() => {
          const r = toDelete;
          setToDelete(null);
          run("del", () => api(`/finance-ho/rekon/bank/statements/${r.id}`, { method: "DELETE" }));
        }}
      />
    </div>
  );
}
