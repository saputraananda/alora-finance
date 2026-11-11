import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineXMark } from "react-icons/hi2";
import { getToken } from "../../../lib/api";
import { api } from "../../../lib/api";
import { cn, rp, selectCls } from "../utils/format";

const WASCHEN_COMPANY_ID = 5;
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

const nowLocal = () => {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
};

// Target alokasi: tiap perusahaan; khusus Waschen Laundry (5) dipecah per outlet.
function buildTargets(scope = []) {
  const targets = [];
  const seen = new Set();
  for (const s of scope) {
    const waschen = Number(s.company_id) === WASCHEN_COMPANY_ID && s.outlet_id;
    const key = `${s.company_id}|${waschen ? s.outlet_id : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      company_id: Number(s.company_id),
      outlet_id: waschen ? Number(s.outlet_id) : null,
      label: waschen ? s.outlet_name : s.company_name,
    });
  }
  return targets;
}

export default function PayModal({ pr, scope, onClose, onDone }) {
  const [classes, setClasses] = useState([]);
  const [picked, setPicked] = useState([]);
  const [method, setMethod] = useState("cash");
  const [terminValue, setTerminValue] = useState("");
  const [terminUnit, setTerminUnit] = useState("hari");
  const [nominal, setNominal] = useState(Number(pr.nominal_bayar) > 0 ? String(Math.round(pr.nominal_bayar)) : "");
  const [adminFee, setAdminFee] = useState("");
  const [paidAt, setPaidAt] = useState(nowLocal());
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  const [cells, setCells] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/finance-ho/purchasing/classifications").then((r) => setClasses(r.data.filter((c) => c.is_active))).catch((e) => setError(e.message));
  }, []);

  const targets = useMemo(() => buildTargets(scope), [scope]);
  const cellList = useMemo(
    () => picked.flatMap((cid) => targets.map((t) => ({ classification_id: cid, ...t }))),
    [picked, targets]
  );
  const needGrid = cellList.length > 1;
  const nominalNum = Number(nominal) || 0;
  const gridSum = cellList.reduce((s, c) => s + (Number(cells[`${c.classification_id}|${c.company_id}|${c.outlet_id || 0}`]) || 0), 0);
  const className = (id) => classes.find((c) => c.id === id)?.classification_name || id;

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    setError("");
    if (!picked.length) return setError("Pilih minimal satu klasifikasi.");
    if (!nominalNum) return setError("Nominal bayar wajib diisi.");
    if (method === "kredit" && (!terminValue || Number(terminValue) <= 0)) return setError("Termin wajib diisi untuk kredit.");
    if (!files.length) return setError("Bukti pembayaran wajib dilampirkan.");
    if (needGrid && Math.round(gridSum) !== Math.round(nominalNum)) {
      return setError(`Total alokasi (Rp ${rp(gridSum)}) harus sama dengan nominal bayar (Rp ${rp(nominalNum)}).`);
    }

    const fd = new FormData();
    fd.append("classification_ids", JSON.stringify(picked));
    fd.append("payment_method", method);
    fd.append("nominal_bayar", String(nominalNum));
    if (adminFee) fd.append("admin_fee", adminFee);
    if (method === "kredit") {
      fd.append("termin_value", terminValue);
      fd.append("termin_unit", terminUnit);
    }
    if (paidAt) fd.append("paid_at", paidAt);
    if (note.trim()) fd.append("payment_note", note.trim());
    if (needGrid) {
      fd.append(
        "allocations",
        JSON.stringify(
          cellList.map((c) => ({
            classification_id: c.classification_id,
            company_id: c.company_id,
            outlet_id: c.outlet_id,
            nominal: Number(cells[`${c.classification_id}|${c.company_id}|${c.outlet_id || 0}`]) || 0,
          }))
        )
      );
    }
    files.forEach((f) => fd.append("attachments", f));

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/finance-ho/purchasing/requests/${pr.pr_id}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal memproses pembayaran");
      onDone(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h3 className="text-base font-bold text-slate-800">Bayar pengajuan</h3>
            <p className="text-xs text-slate-500">{pr.pr_code} · {pr.nama_barang}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Tutup"><HiOutlineXMark className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 overflow-auto p-5">
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-slate-500">Klasifikasi (boleh lebih dari satu)</p>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto rounded-lg border border-slate-100 p-2">
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                    picked.includes(c.id) ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400",
                    !c.account_id && !picked.includes(c.id) && "border-dashed"
                  )}
                  title={c.account_id ? `${c.account_code} · ${c.account_name}` : "Belum dipetakan ke akun — pembayaran tetap bisa dicatat, jurnal menunggu pemetaan"}
                >
                  {c.classification_name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Garis putus-putus = belum dipetakan ke akun (jurnal ditunda sampai dipetakan di menu Klasifikasi).</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-bold text-slate-500">Metode bayar
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={cn(selectCls, "mt-1 w-full")}>
                <option value="cash">Tunai / transfer langsung</option>
                <option value="kredit">Kredit (hutang)</option>
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-500">Tanggal & jam bayar
              <input type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={cn(inputCls, "mt-1")} />
            </label>
            <label className="text-[11px] font-bold text-slate-500">{method === "kredit" ? "Total tagihan (Rp)" : "Nominal bayar (Rp)"}
              <input type="number" min="0" value={nominal} onChange={(e) => setNominal(e.target.value)} className={cn(inputCls, "mt-1")} />
            </label>
            <label className="text-[11px] font-bold text-slate-500">Biaya admin (Rp, opsional)
              <input type="number" min="0" value={adminFee} onChange={(e) => setAdminFee(e.target.value)} className={cn(inputCls, "mt-1")} />
            </label>
            {method === "kredit" && (
              <div className="sm:col-span-2">
                <p className="text-[11px] font-bold text-slate-500">Termin</p>
                <div className="mt-1 flex gap-2">
                  <input type="number" min="1" value={terminValue} onChange={(e) => setTerminValue(e.target.value)} className={inputCls} placeholder="30" />
                  <select value={terminUnit} onChange={(e) => setTerminUnit(e.target.value)} className={selectCls}>
                    <option value="hari">hari</option>
                    <option value="bulan">bulan</option>
                    <option value="tahun">tahun</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {needGrid && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold text-slate-500">Alokasi nominal per klasifikasi dan outlet</p>
              <div className="overflow-hidden rounded-lg border border-slate-100">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {cellList.map((c) => {
                      const key = `${c.classification_id}|${c.company_id}|${c.outlet_id || 0}`;
                      return (
                        <tr key={key}>
                          <td className="px-3 py-1.5 text-slate-600">{className(c.classification_id)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{c.label}</td>
                          <td className="w-40 px-3 py-1.5">
                            <input type="number" min="0" value={cells[key] || ""} onChange={(e) => setCells((p) => ({ ...p, [key]: e.target.value }))} className={cn(inputCls, "text-right")} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={cn("mt-1 text-[11px] font-semibold", Math.round(gridSum) === Math.round(nominalNum) ? "text-emerald-700" : "text-amber-600")}>
                Total alokasi Rp {rp(gridSum)} dari Rp {rp(nominalNum)}
              </p>
            </div>
          )}

          <label className="block text-[11px] font-bold text-slate-500">Catatan (opsional)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={cn(inputCls, "mt-1")} />
          </label>

          <div>
            <p className="text-[11px] font-bold text-slate-500">Bukti pembayaran (wajib, JPG/PNG/WEBP/PDF, maks 5 file × 10 MB)</p>
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
              className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-emerald-700"
            />
          </div>

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-500">Batal</button>
          <button type="button" onClick={submit} disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
            {busy ? "Memproses..." : "Catat pembayaran"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
