import { useCallback, useEffect, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineLockClosed } from "react-icons/hi2";
import { api } from "../../../lib/api";

const cn = (...c) => c.filter(Boolean).join(" ");
const dmy = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "-");
const inputCls = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

// Pengaturan > Kunci Tanggal: Finance menentukan sendiri batas tanggal; jurnal s/d tanggal itu ditolak.
export default function KunciTanggal() {
  const [data, setData] = useState(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api("/finance-ho/settings/lock-date");
      setData(res);
      setDate(res.lock_before_date || "");
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (value) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api("/finance-ho/settings/lock-date", { method: "PUT", body: JSON.stringify({ date: value || null }) });
      setMsg({ type: "ok", text: res.message });
      setData(res);
      setDate(res.lock_before_date || "");
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const current = data?.lock_before_date || null;
  const dirty = (date || "") !== (current || "");
  const opening = dirty && current && date && date < current; // membuka kembali tanggal yang tadinya terkunci

  return (
    <div className="max-w-2xl space-y-4">
      {msg && (
        <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs font-medium", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {msg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
        <div className="flex items-center gap-2">
          <HiOutlineLockClosed className={cn("h-5 w-5", current ? "text-emerald-600" : "text-slate-300")} />
          <p className="text-sm font-extrabold text-slate-800">{current ? `Terkunci sampai ${dmy(current)}` : "Belum ada batas kunci"}</p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Jurnal bertanggal <b>sampai dengan</b> tanggal batas tidak bisa dibuat, diubah, diposting, atau dijadikan tanggal pembalik, untuk semua cabang dan jurnal Pusat
          (penyusutan, alokasi biaya pusat, persetujuan rekonsiliasi harian ikut ditolak). Koreksi dibuat sebagai jurnal baru di tanggal setelah batas.
        </p>

        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Batas kunci tanggal</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input type="date" value={date} max={data?.today ? new Date(new Date(`${data.today}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) : undefined} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          <button type="button" disabled={busy || !dirty} onClick={() => save(date)} className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? "Menyimpan..." : "Simpan"}
          </button>
          {current && (
            <button type="button" disabled={busy} onClick={() => save(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              Hapus batas
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">Harus sebelum hari ini supaya jurnal hari berjalan tetap bisa dibuat. Kosongkan berarti tidak ada batas.</p>

        {opening && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Memundurkan batas membuka kembali tanggal {dmy(date)} sampai {dmy(current)}. Laporan periode itu bisa berubah. Perubahan dicatat di riwayat.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Riwayat perubahan</p>
        {!data?.history?.length ? (
          <p className="mt-2 text-xs text-slate-400">Belum ada perubahan.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-xs text-slate-600">
            {data.history.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  {dmy(h.before)} → <b className="text-slate-800">{h.after ? dmy(h.after) : "tanpa batas"}</b>
                </span>
                <span className="text-slate-400">{String(h.changed_at || "").replace("T", " ").slice(0, 16)}{h.actor_id ? ` · user #${h.actor_id}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
