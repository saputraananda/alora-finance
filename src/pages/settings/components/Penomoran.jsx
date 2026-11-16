import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineArrowDown, HiOutlineArrowUp, HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlinePencilSquare, HiOutlinePlus, HiOutlineXMark } from "react-icons/hi2";
import { api } from "../../../lib/api";

// Pengaturan > Penomoran: format nomor dokumen per Tipe Transaksi (mirip Accurate).
// Satu tipe punya satu default; mengubah format hanya berlaku untuk dokumen berikutnya.

const cn = (...c) => c.filter(Boolean).join(" ");
const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-400";
const SAMPLE = { BRANCH: "RH", BANK: "BCA6978" };

// Sama dengan api/utils/numbering.js renderNumber (untuk pratinjau langsung)
function render(cfg, { date, counter }) {
  const d = date;
  return (cfg.components || []).map((c) => {
    switch (c.k) {
      case "TEXT": return c.v || "";
      case "YEAR4": return d.slice(0, 4);
      case "YEAR2": return d.slice(2, 4);
      case "MONTH": return d.slice(5, 7);
      case "DAY": return d.slice(8, 10);
      case "COUNTER": return String(counter).padStart(Number(cfg.digits) || 1, "0");
      default: return SAMPLE[c.k] || "";
    }
  }).join("");
}

const EMPTY = (type) => ({
  name: "", txn_type: type, reset_mode: type === "MUTASI" ? "month" : "day", digits: type === "MUTASI" ? 3 : 4,
  components: type === "MUTASI"
    ? [{ k: "BANK" }, { k: "TEXT", v: "/" }, { k: "YEAR2" }, { k: "TEXT", v: "/" }, { k: "MONTH" }, { k: "TEXT", v: "/" }, { k: "COUNTER" }]
    : [{ k: "TEXT", v: "JU" }, { k: "TEXT", v: "-" }, { k: "YEAR2" }, { k: "MONTH" }, { k: "DAY" }, { k: "TEXT", v: "-" }, { k: "COUNTER" }],
  is_default: false, is_active: true, next_no: "",
});

function FormModal({ item, meta, onClose, onSaved }) {
  const editing = Boolean(item.id);
  const [f, setF] = useState(() => ({ ...item, components: item.components.map((c) => ({ ...c })), next_no: editing ? String(item.next_counter || "") : "" }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const type = meta.types.find((t) => t.key === f.txn_type) || meta.types[0];
  const comps = type?.components || {};
  const used = new Set(f.components.filter((c) => c.k !== "TEXT").map((c) => c.k));
  const counterEditable = f.txn_type === "JURNAL" && !f.components.some((c) => c.k === "BRANCH");
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setComps = (fn) => setF((x) => ({ ...x, components: fn([...x.components]) }));

  const changeType = (t) => {
    const allowed = meta.types.find((x) => x.key === t)?.components || {};
    const resets = meta.types.find((x) => x.key === t)?.resets || [];
    setF((x) => ({ ...x, txn_type: t, components: x.components.filter((c) => allowed[c.k]), reset_mode: resets.includes(x.reset_mode) ? x.reset_mode : resets[0] }));
  };
  const add = (k) => setComps((list) => {
    const c = k === "TEXT" ? { k, v: "" } : { k };
    const at = list.findIndex((x) => x.k === "COUNTER");
    if (k !== "COUNTER" && at >= 0) list.splice(at, 0, c);
    else list.push(c);
    return list;
  });
  const move = (i, d) => setComps((list) => { const j = i + d; [list[i], list[j]] = [list[j], list[i]]; return list; });

  const next = Number(f.next_no) || Number(item.next_counter) || 1;
  const previewNo = render(f, { date: meta.today, counter: next });
  const afterNo = render(f, { date: meta.today, counter: next + 1 });
  const tooLong = type && previewNo.length > type.max_length;

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const body = { name: f.name, txn_type: f.txn_type, reset_mode: f.reset_mode, digits: Number(f.digits), components: f.components, is_default: f.is_default, is_active: f.is_active };
      if (counterEditable && f.next_no !== "" && Number(f.next_no) !== Number(item.next_counter)) body.next_no = Number(f.next_no);
      if (editing) await api(`/finance-ho/settings/numbering/${item.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/finance-ho/settings/numbering", { method: "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-800">{editing ? "Ubah penomoran" : "Tambah penomoran"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block font-semibold text-slate-600">Nama <span className="text-rose-500">*</span>
              <input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Mis. Jurnal Umum Standar" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="block font-semibold text-slate-600">Tipe transaksi <span className="text-rose-500">*</span>
              <select value={f.txn_type} disabled={editing} onChange={(e) => changeType(e.target.value)} className={cn(inputCls, "mt-1")}>
                {meta.types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-slate-400">{editing ? "Tipe transaksi tidak bisa diubah setelah dibuat." : type?.hint}</span>
            </label>
            <label className="block font-semibold text-slate-600">Tipe penomoran <span className="text-rose-500">*</span>
              <select value={f.reset_mode} onChange={(e) => set({ reset_mode: e.target.value })} className={cn(inputCls, "mt-1")}>
                {(type?.resets || []).map((r) => <option key={r} value={r}>{meta.reset_labels[r]}</option>)}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-slate-400">
                {f.reset_mode === "none" ? "Counter terus bertambah, tidak pernah kembali ke 1." : `Counter mulai dari 1 lagi setiap ${f.reset_mode === "day" ? "hari" : f.reset_mode === "month" ? "bulan" : "tahun"} baru.`}
                {f.txn_type === "MUTASI" && " Dihitung per rekening bank."}
              </span>
            </label>
            <label className="block font-semibold text-slate-600">Jumlah digit counter <span className="text-rose-500">*</span>
              <input type="number" min={1} max={10} value={f.digits} onChange={(e) => set({ digits: e.target.value })} className={cn(inputCls, "mt-1")} />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">Diisi nol di depan. Mis. 4 digit → 0001.</span>
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <p className="font-bold text-slate-700">Komponen penomoran</p>
              <p className="text-[11px] text-slate-400">Urutan komponen = urutan di nomor</p>
            </div>
            {f.components.length === 0 ? (
              <p className="px-4 py-5 text-center text-slate-400">Belum ada komponen. Tambahkan dari tombol di bawah.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {f.components.map((c, i) => (
                  <li key={i} className="grid grid-cols-[1fr_1.3fr_auto] items-center gap-3 px-4 py-2">
                    <span className="font-semibold text-slate-700">{comps[c.k] || c.k}</span>
                    {c.k === "TEXT" ? (
                      <input value={c.v} onChange={(e) => setComps((list) => { list[i] = { ...list[i], v: e.target.value }; return list; })} placeholder="Teks, mis. JU atau -" maxLength={20} className={inputCls} />
                    ) : (
                      <span className="font-mono text-slate-400">{render({ ...f, components: [c] }, { date: meta.today, counter: next })}</span>
                    )}
                    <span className="flex gap-0.5">
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Naikkan"><HiOutlineArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" disabled={i === f.components.length - 1} onClick={() => move(i, 1)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Turunkan"><HiOutlineArrowDown className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setComps((list) => { list.splice(i, 1); return list; })} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Hapus komponen"><HiOutlineXMark className="h-3.5 w-3.5" /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-1.5 border-t border-slate-200 bg-slate-50/60 px-4 py-2.5">
              {Object.entries(comps).map(([k, label]) => (
                <button key={k} type="button" disabled={k !== "TEXT" && used.has(k)} onClick={() => add(k)} className="rounded-full border border-dashed border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-slate-500 hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-35">
                  + {label}
                </button>
              ))}
            </div>
          </div>

          <div className={cn("rounded-2xl border px-4 py-3", tooLong ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50")}>
            <p className={cn("text-[11px] font-bold", tooLong ? "text-rose-700" : "text-emerald-700")}>Pratinjau nomor berikutnya</p>
            <p className={cn("mt-0.5 break-all font-mono text-lg font-bold", tooLong ? "text-rose-800" : "text-emerald-900")}>{previewNo || "-"}</p>
            <p className="mt-0.5 font-mono text-[11px] text-emerald-700">{previewNo ? `Setelahnya: ${afterNo}` : ""}</p>
            {f.components.some((c) => c.k === "BRANCH" || c.k === "BANK") && (
              <p className="mt-1 text-[11px] text-emerald-800">{f.txn_type === "MUTASI" ? "Kode bank diambil dari rekening yang dipilih saat impor; contoh memakai BCA6978." : "Kode cabang diambil dari cabang di header jurnal (tanpa cabang → HO); counter dihitung per cabang. Contoh memakai RH."}</p>
            )}
            {tooLong && <p className="mt-1 text-[11px] font-semibold text-rose-700">Nomor terlalu panjang (maks. {type.max_length} karakter).</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block font-semibold text-slate-600">Counter berikutnya
              <input type="number" min={1} value={counterEditable ? f.next_no : ""} disabled={!counterEditable} onChange={(e) => set({ next_no: e.target.value })} placeholder={counterEditable ? "1" : "Dihitung otomatis"} className={cn(inputCls, "mt-1")} />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">
                {counterEditable ? "Untuk melanjutkan nomor dari sistem lama pada periode berjalan. Tidak bisa lebih kecil dari nomor yang sudah terbit." : f.txn_type === "MUTASI" ? "Rekon Code dihitung dari mutasi yang sudah diimpor per rekening." : "Counter dihitung per cabang, jadi tidak diatur manual."}
              </span>
            </label>
            <div className="space-y-2.5 pt-1 md:pt-5">
              <label className="flex items-center gap-2 font-semibold text-slate-700">
                <input type="checkbox" checked={f.is_default} disabled={editing && item.is_default} onChange={(e) => set({ is_default: e.target.checked })} className="accent-emerald-600" />
                Jadikan default untuk tipe transaksi ini
              </label>
              <label className="flex items-center gap-2 font-semibold text-slate-700">
                <input type="checkbox" checked={f.is_active} disabled={editing && item.is_default} onChange={(e) => set({ is_active: e.target.checked })} className="accent-emerald-600" />
                Aktif
              </label>
              {editing && item.is_default && <p className="text-[11px] text-slate-400">Ini default. Untuk menggantinya, jadikan penomoran lain sebagai default.</p>}
            </div>
          </div>
          {err && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
          <button type="button" disabled={busy || !f.name.trim() || tooLong} onClick={save} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{busy ? "Menyimpan..." : "Simpan"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Penomoran() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    try {
      setMeta(await api("/finance-ho/settings/numbering"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const typeLabel = useMemo(() => Object.fromEntries((meta?.types || []).map((t) => [t.key, t.label])), [meta]);
  const rows = meta?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs text-slate-500">
          Atur format nomor dokumen. Setiap tipe transaksi punya satu penomoran <b>default</b> yang dipakai otomatis. Mengubah format <b>tidak mengubah nomor yang sudah terbit</b>.
          Jurnal otomatis (POS, rekonsiliasi harian, biaya admin bank, dll.) tetap memakai nomor tetap berbasis cabang dan tanggal.
        </p>
        <button type="button" disabled={!meta} onClick={() => setModal(EMPTY(meta.types[0].key))} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300"><HiOutlinePlus className="h-4 w-4" /> Tambah penomoran</button>
      </div>
      {msg && <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><HiOutlineCheckCircle className="h-4 w-4" /> {msg}</p>}
      {error && <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><HiOutlineExclamationTriangle className="h-4 w-4" /> {error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-2.5">Nama</th><th className="px-3 py-2.5">Tipe transaksi</th><th className="px-3 py-2.5">Tipe penomoran</th><th className="px-3 py-2.5">Nomor berikutnya</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!meta && !error ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-400">Memuat...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Belum ada penomoran.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className={cn(!r.is_active && "bg-slate-50/60 text-slate-400")}>
                <td className="px-4 py-3 font-semibold text-slate-800">{r.name}</td>
                <td className="px-3 py-3"><span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{typeLabel[r.txn_type] || r.txn_type}</span></td>
                <td className="px-3 py-3 text-slate-600">{meta.reset_labels[r.reset_mode]} · {r.digits} digit</td>
                <td className="px-3 py-3">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono font-bold text-slate-700">{r.next_number}</span>
                  {r.sample_note && <span className="ml-2 text-[10px] text-slate-400">{r.sample_note}</span>}
                </td>
                <td className="px-3 py-3">
                  {r.is_default && <span className="mr-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Default</span>}
                  {!r.is_active && <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Nonaktif</span>}
                </td>
                <td className="px-3 py-3 text-right">
                  <button type="button" onClick={() => setModal(r)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"><HiOutlinePencilSquare className="h-3.5 w-3.5" /> Ubah</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && meta && <FormModal item={modal} meta={meta} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg("Penomoran disimpan. Berlaku untuk dokumen berikutnya."); load(); }} />}
    </div>
  );
}
