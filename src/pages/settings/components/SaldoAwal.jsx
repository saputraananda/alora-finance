import { useCallback, useEffect, useMemo, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlinePlus, HiOutlineTrash } from "react-icons/hi2";
import { api } from "../../../lib/api";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

// Pengaturan > Saldo awal (Konsep Fase 0: "COA, cabang, saldo awal")
export default function SaldoAwal() {
  const [data, setData] = useState(null);
  const [date, setDate] = useState("");
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api("/finance-ho/settings/opening");
      setData(res);
      setDate(res.date || "");
      setLines(res.lines.length ? res.lines.map((l) => ({ account_id: l.account_id, outlet_id: l.outlet_id || "", amount: String(l.amount) })) : [{ account_id: "", outlet_id: "", amount: "" }]);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const locked = data?.posted && data.posted.status !== "REVERSED";
  const accOf = (id) => data?.accounts.find((a) => String(a.id) === String(id));

  // Pratinjau keseimbangan (positif = saldo normal akun)
  const preview = useMemo(() => {
    let d = 0;
    let k = 0;
    lines.forEach((l) => {
      const a = accOf(l.account_id);
      const amt = Number(l.amount) || 0;
      if (!a || !amt) return;
      if ((a.normal_balance === "DEBIT") === amt >= 0) d += Math.abs(amt);
      else k += Math.abs(amt);
    });
    return { d, k, diff: d - k };
  }, [lines, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (i, patch) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const run = async (key, fn) => {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fn();
      setMsg({ type: "ok", text: res.message });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run("save", () =>
      api("/finance-ho/settings/opening", {
        method: "PUT",
        body: JSON.stringify({ date, lines: lines.map((l) => ({ account_id: Number(l.account_id) || null, outlet_id: Number(l.outlet_id) || null, amount: Number(l.amount) || 0 })) }),
      })
    );

  if (!data) return <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-400">Memuat saldo awal...</div>;

  return (
    <div className="space-y-4">
      {msg && (
        <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs font-medium", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {msg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs">
        <label className="flex items-center gap-2 font-semibold text-slate-500">
          Tanggal saldo awal:
          <input type="date" value={date} disabled={locked} onChange={(e) => setDate(e.target.value)} className={cn(inputCls, "w-auto")} />
        </label>
        <p className="flex-1 text-[11px] text-slate-500">
          Biasanya sehari sebelum cabang pertama mulai memakai alfi. Isi jumlah sesuai saldo normal akun (positif = saldo normal; negatif = saldo berlawanan).
        </p>
        {locked && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">Diposting · {data.posted.entry_no}</span>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr><th className={th}>Akun</th><th className={cn(th, "w-48")}>Cabang</th><th className={cn(th, "w-48 text-right")}>Saldo</th><th className={cn(th, "w-28")}>Posisi</th><th className={cn(th, "w-10")} /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l, i) => {
              const a = accOf(l.account_id);
              const amt = Number(l.amount) || 0;
              const side = a && amt ? ((a.normal_balance === "DEBIT") === amt >= 0 ? "Debit" : "Kredit") : "-";
              return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <select disabled={locked} value={l.account_id} onChange={(e) => set(i, { account_id: e.target.value })} className={inputCls}>
                      <option value="">— pilih akun —</option>
                      {data.accounts.map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select disabled={locked} value={l.outlet_id} onChange={(e) => set(i, { outlet_id: e.target.value })} className={inputCls}>
                      <option value="">Pusat</option>
                      {data.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><input disabled={locked} type="number" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} className={cn(inputCls, "text-right tabular-nums")} placeholder="0" /></td>
                  <td className="px-3 py-2 text-slate-500">{side}</td>
                  <td className="px-2 py-2 text-center">
                    {!locked && (
                      <button type="button" onClick={() => setLines((p) => (p.length <= 1 ? [{ account_id: "", outlet_id: "", amount: "" }] : p.filter((_, idx) => idx !== i)))} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50 text-xs">
            <tr><td colSpan={2} className="px-3 py-2 font-bold">Total debit / kredit</td><td className="px-3 py-2 text-right font-bold tabular-nums">{rp(preview.d)} / {rp(preview.k)}</td><td colSpan={2} /></tr>
            <tr>
              <td colSpan={2} className="px-3 py-2 text-slate-500">Penyeimbang ke {data.equity?.label || "(peran belum dipetakan)"}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{Math.abs(preview.diff) < 0.005 ? "0" : rp(Math.abs(preview.diff))}</td>
              <td className="px-3 py-2 text-slate-500">{preview.diff > 0 ? "Kredit" : preview.diff < 0 ? "Debit" : "-"}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        {!locked && (
          <div className="border-t border-slate-100 p-3">
            <button type="button" onClick={() => setLines((p) => [...p, { account_id: "", outlet_id: "", amount: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <HiOutlinePlus className="h-4 w-4 text-emerald-600" /> Tambah baris
            </button>
          </div>
        )}
      </div>

      {!locked && (
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy !== null} onClick={save} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {busy === "save" ? "Menyimpan..." : "Simpan draft"}
          </button>
          <button type="button" disabled={busy !== null || !date || !data.lines.length} title={!data.lines.length ? "Simpan draft dulu" : ""} onClick={() => run("post", () => api("/finance-ho/settings/opening/post", { method: "POST" }))} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
            {busy === "post" ? "Memposting..." : "Posting saldo awal"}
          </button>
        </div>
      )}
      {locked && <p className="text-right text-[11px] text-slate-400">Untuk mengubah, balik jurnal {data.posted.entry_no} di menu Jurnal.</p>}
    </div>
  );
}
