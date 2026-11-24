import { useCallback, useEffect, useState } from "react";
import { HiOutlineArrowUpTray, HiOutlineCheckCircle, HiOutlineExclamationTriangle } from "react-icons/hi2";
import { api, getToken } from "../../../lib/api";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0);
const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");
const selectCls = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const th = "px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500";
const MAPPABLE = ["date", "desc", "kode", "amount", "sub", "debit", "credit", "balance", "rekon", "kategori"];
const FIELD_NAME = { date: "Tanggal", desc: "Keterangan", kode: "Kode transaksi", amount: "Nominal", sub: "Arah (CR/DR)", debit: "Debit", credit: "Kredit", balance: "Saldo", rekon: "Rekon Code sumber", kategori: "Kategori Payment sumber" };
const colLetter = (i) => String.fromCharCode(65 + (i % 26));

async function postForm(path, fd) {
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api${path}`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || "Gagal memproses file."), { data });
  return data;
}

function Stat({ label, value, tone }) {
  const t = { green: "border-emerald-200 bg-emerald-50/60 text-emerald-700", amber: "border-amber-200 bg-amber-50/60 text-amber-700", rose: "border-rose-200 bg-rose-50/60 text-rose-700" }[tone] || "border-slate-100 bg-slate-50/70 text-slate-800";
  return (
    <div className={cn("rounded-xl border px-3 py-2", t)}>
      <p className="text-[10px] font-bold opacity-70">{label}</p>
      <p className="text-base font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

// Pemetaan kolom manual (dipakai bila header tidak dikenali, atau user ingin mengubah)
function MappingEditor({ headers, mapping, onApply, onCancel, headerRowOptions }) {
  const [fields, setFields] = useState(mapping || {});
  const [headerRow, setHeaderRow] = useState(headerRowOptions?.[0]?.row ?? "");
  const cols = headers;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="mb-3 text-xs font-bold text-slate-700">Pemetaan kolom manual</p>
      {headerRowOptions && (
        <label className="mb-3 block text-xs font-semibold text-slate-500">Baris header
          <select value={headerRow} onChange={(e) => setHeaderRow(e.target.value)} className={cn(selectCls, "mt-1 max-w-xs")}>
            {headerRowOptions.map((o) => <option key={o.row} value={o.row}>Baris {o.row}: {o.cells.filter(Boolean).slice(0, 5).join(" | ")}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MAPPABLE.map((f) => (
          <label key={f} className="text-[11px] font-semibold text-slate-500">
            {FIELD_NAME[f]}{f === "date" || f === "desc" ? " *" : ""}
            <select value={fields[f] ?? ""} onChange={(e) => setFields((m) => ({ ...m, [f]: e.target.value }))} className={cn(selectCls, "mt-1")}>
              <option value="">(tidak dipakai)</option>
              {cols.map((h, i) => <option key={i} value={i}>{colLetter(i)}{h ? ` · ${h}` : ""}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">Batal</button>
        <button type="button" onClick={() => onApply({ headerRow: headerRow === "" ? undefined : Number(headerRow), fields })} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Terapkan & pratinjau ulang</button>
      </div>
    </div>
  );
}

export default function ImportMutasi({ onDone }) {
  const [adapters, setAdapters] = useState([]);
  const [adapter, setAdapter] = useState("FINANCE");
  const [file, setFile] = useState(null);
  const [bankId, setBankId] = useState("");
  const [mapping, setMapping] = useState(null);
  const [preview, setPreview] = useState(null);
  const [needMap, setNeedMap] = useState(null); // {message, sample}
  const [editMap, setEditMap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api("/finance-ho/rekon/bank/import/adapters").then((r) => setAdapters(r.adapters)).catch(() => {});
  }, []);

  const runPreview = useCallback(async (f, ad, bank, map) => {
    setLoading(true);
    setError("");
    setNeedMap(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("adapter", ad);
      if (bank) fd.append("bank_account_id", bank);
      if (map) fd.append("mapping", JSON.stringify(map));
      const p = await postForm("/finance-ho/rekon/bank/import/preview", fd);
      setPreview(p);
      setSkipInvalid(false);
      if (!bank && p.account_match.bank_account_id) setBankId(String(p.account_match.bank_account_id));
    } catch (e) {
      setPreview(null);
      if (e.data?.needs_mapping) setNeedMap({ message: e.message, sample: e.data.sample || [] });
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    setDone(null);
    setMapping(null);
    setEditMap(false);
    runPreview(f, adapter, bankId, null);
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setNeedMap(null);
    setError("");
    setDone(null);
    setMapping(null);
    setBankId("");
  };

  const s = preview?.summary;
  const blocking = s && s.invalid > 0 && !skipInvalid;
  const canConfirm = preview && bankId && s.new > 0 && !blocking && !confirming;

  const confirm = async () => {
    setConfirming(true);
    setError("");
    try {
      const r = await api("/finance-ho/rekon/bank/import/confirm", {
        method: "POST",
        body: JSON.stringify({ token: preview.token, bank_account_id: Number(bankId), adapter: preview.adapter, mapping, skip_invalid: skipInvalid }),
      });
      setDone(r);
      setPreview(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirming(false);
    }
  };

  const bankLabel = (b) => `${b.bank_name} ${b.account_no}${b.holder ? ` · ${b.holder}` : ""}`;
  const matchState = preview?.account_match.status;

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6">
        <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-900"><HiOutlineCheckCircle className="h-5 w-5" /> Import selesai</p>
        <p className="mt-1 text-xs text-emerald-800">{done.message}</p>
        <ul className="mt-2 list-disc pl-5 text-[11px] text-emerald-800">
          <li>{done.imported} transaksi bank baru, tiap baris Excel menjadi satu transaksi.</li>
          <li>Tiap transaksi mendapat Rekon Code sistem yang berurutan sesuai baris Excel.</li>
          <li>File asli diarsipkan di server, nomor baris Excel tersimpan di tiap transaksi. Kategori Payment baru dipilih saat Cocokkan.</li>
        </ul>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onDone} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700">Tutup & lihat mutasi</button>
          <button type="button" onClick={reset} className="rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50">Import file lain</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
          <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* 1. File */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-500">Format bank
            <select value={adapter} onChange={(e) => { setAdapter(e.target.value); if (file) runPreview(file, e.target.value, bankId, mapping); }} className={cn(selectCls, "mt-1")}>
              {(adapters.length ? adapters : [{ key: "FINANCE", label: "Format Finance (referensi)", verified: true }]).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700">
            <HiOutlineArrowUpTray className="h-4 w-4" /> {file ? "Ganti file" : "Pilih file rekening koran"}
            <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickFile(f); }} />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Excel atau CSV (data teks). Satu mesin untuk semua bank: kolom dikenali dari nama header, dan bisa dipetakan manual. Format selain Finance belum diverifikasi dengan file asli bank (ditandai di pilihan).
        </p>
        {file && <p className="mt-2 text-xs font-semibold text-slate-700">📄 {file.name} <span className="font-normal text-slate-400">· {(file.size / 1024).toFixed(0)} KB</span></p>}
        {loading && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" /> Membaca file...</p>}
      </div>

      {needMap && (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <p className="text-xs font-semibold text-amber-900">{needMap.message}</p>
          <MappingEditor
            headers={Array.from({ length: Math.max(0, ...needMap.sample.map((r) => r.cells.length)) }, (_, i) => "")}
            headerRowOptions={needMap.sample.map((r) => ({ row: r.row, cells: r.cells }))}
            mapping={null}
            onCancel={reset}
            onApply={(m) => { setMapping(m); runPreview(file, adapter, bankId, m); }}
          />
        </div>
      )}

      {preview && (
        <>
          {/* 2. Rekening */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900">Informasi rekening</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs md:grid-cols-4">
              <div><dt className="text-[10px] font-bold text-slate-400">Account Number</dt><dd className="font-mono font-semibold">{preview.account.number || "-"}</dd></div>
              <div><dt className="text-[10px] font-bold text-slate-400">Name</dt><dd className="font-semibold">{preview.account.name || "-"}</dd></div>
              <div><dt className="text-[10px] font-bold text-slate-400">Period</dt><dd className="font-semibold">{preview.account.period.raw || "-"}</dd></div>
              <div><dt className="text-[10px] font-bold text-slate-400">Currency</dt><dd className="font-semibold">{preview.account.currency || "-"}</dd></div>
            </dl>
            <div className={cn("mt-3 rounded-xl border p-3 text-[11px]", matchState === "MATCHED" ? "border-emerald-200 bg-emerald-50/60 text-emerald-800" : "border-amber-200 bg-amber-50/60 text-amber-900")}>
              {matchState === "MATCHED" && "✓ Nomor rekening cocok dengan Master Rekening Bank."}
              {matchState === "AMBIGUOUS" && "Nomor rekening cocok dengan lebih dari satu rekening. Pilih yang benar."}
              {matchState === "NOT_FOUND" && "Nomor rekening tidak ditemukan di Master Rekening Bank. Pilih rekening secara manual. Rekening baru tidak dibuat otomatis."}
              {matchState === "NO_INFO" && "File tidak memuat nomor rekening. Pilih rekening secara manual."}
            </div>
            <label className="mt-3 block max-w-md text-xs font-semibold text-slate-500">Rekening tujuan import
              <select value={bankId} onChange={(e) => { setBankId(e.target.value); runPreview(file, adapter, e.target.value, mapping); }} className={cn(selectCls, "mt-1")}>
                <option value="">Pilih rekening...</option>
                {preview.account_match.candidates.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
              </select>
            </label>
            {preview.duplicate_file && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                File yang sama pernah diimpor ({preview.duplicate_file.original_name}, {preview.duplicate_file.at}). Baris yang sudah ada akan dilewati.
              </p>
            )}
          </div>

          {/* 3. Pemetaan kolom */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900">Pemetaan kolom</h2>
              <button type="button" onClick={() => setEditMap((v) => !v)} className="text-[11px] font-bold text-emerald-700 hover:underline">{editMap ? "Tutup" : "Atur manual"}</button>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">Dibaca dari nama header (baris Excel {preview.header_row}), bukan posisi kolom. Kolom yang tidak dikenal dipertahankan sebagai info tambahan.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {preview.columns.map((c) => (
                <span key={c.index} className={cn("rounded-lg border px-2 py-1 text-[11px]", c.field ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
                  <b>{c.header || "(tanpa judul)"}</b> → {c.field ? FIELD_NAME[c.field] : "info tambahan"}
                </span>
              ))}
            </div>
            {editMap && (
              <div className="mt-3">
                <MappingEditor
                  headers={preview.columns.map((c) => c.header)}
                  mapping={preview.mapping}
                  onCancel={() => setEditMap(false)}
                  onApply={(m) => { const mm = { ...m, headerRow: m.headerRow ?? preview.header_row }; setMapping(mm); setEditMap(false); runPreview(file, adapter, bankId, mm); }}
                />
              </div>
            )}
          </div>

          {/* 4. Pratinjau */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900">Pratinjau sebelum konfirmasi</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Total transaksi" value={s.total} />
              <Stat label="Total debit" value={`Rp ${rp(s.total_debit)}`} />
              <Stat label="Total kredit" value={`Rp ${rp(s.total_credit)}`} />
              <Stat label="Baris Excel" value={s.excel_rows ? `${s.excel_rows[0]} – ${s.excel_rows[1]}` : "-"} />
              <Stat label="Baris berhasil dibaca" value={s.valid} tone="green" />
              <Stat label="Perlu cek pemetaan kolom" value={s.needs_mapping} tone={s.needs_mapping ? "amber" : undefined} />
              <Stat label="Transaksi invalid" value={s.invalid} tone={s.invalid ? "rose" : undefined} />
              <Stat label="Duplikat" value={s.duplicate} tone={s.duplicate ? "amber" : undefined} />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className={cn("rounded-xl border p-3", s.invalid ? "border-rose-200 bg-rose-50/60" : "border-slate-100 bg-slate-50/60")}>
                <p className={cn("text-[10px] font-bold uppercase tracking-wider", s.invalid ? "text-rose-700" : "text-slate-400")}>Menghalangi import · perlu keputusan ({s.invalid})</p>
                {s.invalid === 0 ? <p className="mt-1 text-[11px] text-slate-500">Tidak ada.</p> : (
                  <>
                    <ul className="mt-1 list-disc pl-4 text-[11px] text-rose-800">
                      {preview.rows.filter((r) => !r.valid).slice(0, 5).map((r) => <li key={r.excel_row}>Baris {r.excel_row}: {r.errors.join(", ")}</li>)}
                      {s.invalid > 5 && <li>dan {s.invalid - 5} lainnya</li>}
                    </ul>
                    <label className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-rose-900">
                      <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} className="accent-rose-600" /> Lewati baris invalid ini
                    </label>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Peringatan · tidak menghalangi</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-900">
                  {s.duplicate > 0 && <li>{s.duplicate} baris duplikat akan dilewati (tidak membuat Rekon Code baru)</li>}
                  {preview.code_guessed && <li>Kolom tanpa judul dikenali sebagai <b>Kode transaksi bank</b> dari isinya (kode pendek seperti 0 atau 998). Periksa di Pemetaan kolom; ubah manual bila keliru.</li>}
                  {preview.summary.new > 0 && <li>Rekon Code sistem dibuat saat konfirmasi, berurutan sesuai baris Excel (kolom Rekon Code di bawah adalah pratinjau).</li>}
                  <li>Kategori Payment tidak dipilih di sini. Nilai dari Excel (bila ada) hanya disimpan sebagai metadata sumber; Kategori Payment ditentukan saat Cocokkan.</li>
                </ul>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50"><tr><th className={th}>Baris</th><th className={th}>Tanggal</th><th className={th}>Description</th><th className={th}>Kode</th><th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Kredit</th><th className={th}>Rekon Code (sistem)</th><th className={th}>Kat. Payment (Excel)</th><th className={th}>Hasil</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.slice(0, 300).map((r) => (
                    <tr key={r.excel_row} className={cn(!r.valid ? "bg-rose-50/50" : r.duplicate ? "bg-amber-50/50" : "")}>
                      <td className="px-2 py-2 text-slate-400">{r.excel_row}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{r.date ? dm(r.date) : "-"}</td>
                      <td className="max-w-[280px] px-2 py-2"><div className="whitespace-pre-line break-words" title={r.description_full}>{r.description_full || r.description}</div>{Object.keys(r.extra || {}).length > 0 && <div className="mt-0.5 text-[10px] text-slate-400">{Object.entries(r.extra).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>}</td>
                      <td className="px-2 py-2 text-slate-500">{r.bank_code || "-"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.debit ? rp(r.debit) : ""}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.credit ? rp(r.credit) : ""}</td>
                      <td className="px-2 py-2 font-mono text-[10px]">{r.recon_code || (r.duplicate ? "tetap" : "-")}{r.source_recon_code && <div className="font-sans text-[10px] text-slate-400" title="Rekon Code di Excel (metadata sumber)">Excel: {r.source_recon_code}</div>}</td>
                      <td className="px-2 py-2 text-slate-500">{r.source_payment_category || "-"}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {!r.valid ? <span className="rounded bg-rose-100 px-1.5 py-0.5 font-bold text-rose-700">Invalid</span> : r.duplicate ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700">Duplikat · dilewati</span> : <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">Baru</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 300 && <p className="mt-1 text-[11px] text-slate-400">Menampilkan 300 baris pertama dari {preview.rows.length}. Seluruh baris tetap diproses saat konfirmasi.</p>}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                {!bankId ? "Pilih rekening tujuan terlebih dulu." : blocking ? "Putuskan baris invalid agar konfirmasi aktif." : s.new === 0 ? "Tidak ada baris baru untuk diimpor." : `${s.new} transaksi akan dibuat. File asli diarsipkan dan nomor baris Excel disimpan.`}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={reset} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
                <button type="button" disabled={!canConfirm} onClick={confirm} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
                  {confirming ? "Mengimpor..." : `Konfirmasi import (${s.new} baris)`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
