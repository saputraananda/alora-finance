import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import { rangeOf } from "./FocFilter";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";
const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500";

// Detail jurnal setoran + koreksi. Jurnal yang tercatat tidak diubah di tempat: simpan = jurnal balik + jurnal baru yang benar.
function SetoranModal({ id, onClose, onSaved }) {
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(false);
  const [lines, setLines] = useState([]);
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/finance-ho/pos/setoran/${id}`)
      .then((r) => { setD(r); setLines(r.lines.map((l) => ({ ...l }))); setDesc(r.entry.description); })
      .catch((e) => setErr(e.message));
  }, [id]);

  const td = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const tc = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(td - tc) < 0.5 && td > 0;
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, x) => (x === i ? { ...l, [k]: v } : l)));
  const canEdit = d?.entry.status === "POSTED";

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api(`/finance-ho/pos/setoran/${id}`, { method: "PUT", body: JSON.stringify({ description: desc, lines: lines.map((l) => ({ account_id: l.account_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo })) }) });
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold">{edit ? "Edit" : "Detail"} Jurnal Setoran Kasir <span className="ml-1 font-mono text-emerald-300">{d?.entry.entry_no}</span></h3>
            {d && <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold", canEdit ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700")}>{canEdit ? "Posted" : "Sudah dikoreksi"}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="text-slate-300 hover:text-white"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>

        <div className="overflow-auto p-5 text-xs">
          {!d ? (
            <p className="py-10 text-center text-slate-400">{err || "Memuat..."}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div><p className="text-[10px] font-bold uppercase text-slate-400">No. jurnal</p><p className="mt-0.5 rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono font-bold text-slate-700">{d.entry.entry_no}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Tanggal jurnal</p><p className="mt-0.5 rounded-lg bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-700">{dmy(d.entry.date)}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Referensi</p><p className="mt-0.5 rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono text-slate-700">{d.entry.source_ref}</p></div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Keterangan</p>
                {edit ? <input value={desc} onChange={(e) => setDesc(e.target.value)} className={cn(inp, "mt-0.5")} /> : <p className="mt-0.5 font-semibold text-slate-700">{d.entry.description}</p>}
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Rincian akun</p>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50"><tr><th className={th}>#</th><th className={th}>Akun</th><th className={th}>Keterangan</th><th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Kredit</th>{edit && <th className={th} />}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((l, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2">
                            {edit ? (
                              <select value={l.account_id} onChange={(e) => { const a = d.accounts.find((x) => String(x.id) === e.target.value); setLines((ls) => ls.map((x, k) => (k === i ? { ...x, account_id: Number(e.target.value), code: a?.code, name: a?.name } : x))); }} className={cn(inp, "min-w-[240px]")}>
                                {d.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                              </select>
                            ) : <><span className="font-mono font-bold text-slate-700">{l.code}</span> <span className="text-slate-700">{l.name}</span></>}
                          </td>
                          <td className="px-3 py-2">{edit ? <input value={l.memo || ""} onChange={(e) => setLine(i, "memo", e.target.value)} className={inp} /> : <span className="text-slate-500">{l.memo || "-"}</span>}</td>
                          <td className="px-3 py-2 text-right">{edit ? <input type="number" min="0" value={l.debit || ""} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, debit: e.target.value, credit: e.target.value ? 0 : x.credit } : x)))} className={cn(inp, "w-28 text-right")} /> : <span className="font-semibold tabular-nums">{l.debit ? rp(l.debit) : "-"}</span>}</td>
                          <td className="px-3 py-2 text-right">{edit ? <input type="number" min="0" value={l.credit || ""} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, credit: e.target.value, debit: e.target.value ? 0 : x.debit } : x)))} className={cn(inp, "w-28 text-right")} /> : <span className="font-semibold tabular-nums">{l.credit ? rp(l.credit) : "-"}</span>}</td>
                          {edit && <td className="px-2 py-2"><button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} disabled={lines.length <= 2} className="rounded-md p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-30" aria-label="Hapus baris"><HiOutlineTrash className="h-4 w-4" /></button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {edit && (
                  <button type="button" onClick={() => setLines((ls) => [...ls, { account_id: d.accounts[0]?.id, code: d.accounts[0]?.code, name: d.accounts[0]?.name, debit: 0, credit: 0, memo: "" }])} className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline"><HiOutlinePlus className="h-3.5 w-3.5" /> Tambah baris</button>
                )}
              </div>
              {edit && <p className="rounded-lg bg-amber-50 p-3 text-[11px] text-amber-800">Jurnal yang sudah tercatat tidak ditimpa. Saat disimpan, sistem membuat jurnal pembalik untuk jurnal ini, lalu jurnal baru dengan isian di atas. Keduanya tetap terlihat di General Ledger.</p>}
              {err && <p className="rounded-lg bg-rose-50 p-3 text-[11px] font-semibold text-rose-700">{err}</p>}
            </div>
          )}
        </div>

        {d && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
            <div className="text-xs text-slate-600">
              Total debit <strong className="tabular-nums">Rp {rp(td)}</strong> · Total kredit <strong className="tabular-nums">Rp {rp(tc)}</strong>{" "}
              <span className={cn("ml-1 font-bold", balanced ? "text-emerald-700" : "text-rose-600")}>{balanced ? "Balance" : `Selisih Rp ${rp(Math.abs(td - tc))}`}</span>
            </div>
            <div className="flex gap-2">
              {!edit ? (
                <>
                  <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Tutup</button>
                  {canEdit && <button type="button" onClick={() => setEdit(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"><HiOutlinePencilSquare className="h-4 w-4" /> Edit</button>}
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { setEdit(false); setLines(d.lines.map((l) => ({ ...l }))); setDesc(d.entry.description); setErr(""); }} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
                  <button type="button" onClick={save} disabled={!balanced || busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan koreksi"}</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// Halaman "Jurnal Setoran Kasir" (satu jurnal per closing shift Final, dibuat otomatis)
export default function SetoranKasir({ filter, q, tick }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => { setPage(1); }, [q]);
  const rangeKey = JSON.stringify([rangeOf(filter), filter.outlets]);
  useEffect(() => { setPage(1); }, [rangeKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = rangeOf(filter);
      const qs = new URLSearchParams({ from: r.from, to: r.to, page: String(page) });
      if (filter.outlets.length) qs.set("outlets", filter.outlets.join(","));
      if (q) qs.set("search", q);
      setData(await api(`/finance-ho/pos/setoran?${qs}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [rangeKey, page, q, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {open && <SetoranModal id={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {note && <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">{note}</p>}

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jurnal setoran</p><p className="mt-0.5 text-lg font-extrabold text-slate-800">{rp(data.summary.count)}</p></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total disetor ke Kas Sentral</p><p className="mt-0.5 text-lg font-extrabold text-slate-800">Rp {rp(data.summary.amount)}</p></div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Closing shift belum dijurnal</p><p className={cn("mt-0.5 text-lg font-extrabold", data.summary.pending ? "text-amber-600" : "text-slate-800")}>{rp(data.summary.pending)}</p></div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr><th className={th}>Tanggal</th><th className={th}>No. jurnal</th><th className={th}>Jenis</th><th className={th}>Outlet</th><th className={th}>Kasir · Shift</th><th className={th}>Keterangan</th><th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Kredit</th><th className={th}>Status</th><th className={th} /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data || data.rows.length === 0 ? (
                <tr><td colSpan={10} className="py-10 text-center text-slate-400">{loading ? "Memuat..." : "Belum ada jurnal setoran pada periode ini. Jurnal dibuat otomatis saat kasir menutup shift terakhir."}</td></tr>
              ) : data.rows.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r.id)} className={cn("cursor-pointer hover:bg-emerald-50/40", r.reversed && "opacity-60")}>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-500">{dmy(r.date)}</td>
                  <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">{r.entry_no}</td>
                  <td className="px-3 py-2.5"><span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-700">Setoran Kasir</span></td>
                  <td className="px-3 py-2.5 font-semibold text-slate-700">{r.outlet_name}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.cashier || "-"}{r.shift_number ? ` · Shift ${r.shift_number}` : ""}</td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-slate-700" title={r.description}>{r.description}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">Rp {rp(r.debit)}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">Rp {rp(r.credit)}</td>
                  <td className="px-3 py-2.5"><span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold", r.reversed ? "border-slate-300 bg-slate-100 text-slate-600" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{r.status}</span></td>
                  <td className="px-3 py-2.5 text-slate-400">{r.has_proof && (r.proof ? <a href={r.proof} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Lihat foto bukti setor" className="inline-flex rounded-md p-1 text-emerald-600 hover:bg-emerald-50"><HiOutlinePhoto className="h-4 w-4" /></a> : <HiOutlinePhoto className="h-4 w-4 text-slate-300" title="Ada foto bukti, tapi alamat server foto belum diatur (POS_ASSET_BASE_URL)" />)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.pagination && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
            <span>Menampilkan {data.rows.length ? (data.pagination.page - 1) * data.pagination.limit + 1 : 0}–{(data.pagination.page - 1) * data.pagination.limit + data.rows.length} dari {data.pagination.total} jurnal</span>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><HiOutlineChevronLeft className="h-4 w-4" /></button>
              <span className="px-1 font-bold text-slate-700">{page} / {data.pagination.totalPages}</span>
              <button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><HiOutlineChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">Dibuat otomatis dari closing shift POS: Dr Kas Sentral, Cr Kas cabang. Nominal = penerimaan tunai hari itu. Bila setoran aktual berbeda, buka jurnal lalu Edit.</p>
    </div>
  );
}
