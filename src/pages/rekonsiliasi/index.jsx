import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import ConfirmModal from "../../components/ui/ConfirmModal";
import BankRekon from "./components/BankRekon";
import {
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineLockClosed,
  HiOutlinePaperClip,
  HiOutlinePlus,
  HiOutlineScale,
  HiOutlineTrash,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api, getToken } from "../../lib/api";

const cn = (...c) => c.filter(Boolean).join(" ");
const rupiah = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const signed = (n) => (Number(n) > 0 ? `+${rupiah(n)}` : rupiah(n));
const fmtDate = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : "-");
const fmtDateFull = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "-");

function localDate(offsetDays = 0) {
  const n = new Date();
  n.setDate(n.getDate() + offsetDays);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// Status warna sama di semua menu (Komponen standar referensi)
const STATUS = {
  COCOK: { label: "Cocok", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SELISIH: { label: "Selisih", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  BELUM: { label: "Belum", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  KOSONG: { label: "-", cls: "bg-slate-50 text-slate-400 border-slate-200" },
  SELISIH_DIJELASKAN: { label: "Selisih, sudah dijelaskan", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  BELUM_CAIR: { label: "Belum cair", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

const inputCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

async function uploadFile(path, file) {
  const fd = new FormData();
  fd.append("file", file);
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api${path}`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.inserted) throw Object.assign(new Error(data.message || "Gagal mengunggah file."), { data });
  return data;
}

function Notice({ msg, onClose }) {
  if (!msg) return null;
  const ok = msg.type === "ok";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border p-3 text-xs font-medium",
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
      )}
    >
      {ok ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="flex-1">
        <p>{msg.text}</p>
        {msg.details?.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-[11px] opacity-90">
            {msg.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" onClick={onClose} className="opacity-60 hover:opacity-100">
        <HiOutlineXMark className="h-4 w-4" />
      </button>
    </div>
  );
}

// ═════════════════════════════ TAB: HARIAN ══════════════════════════════
function Harian({ date, setDate, onGoto, initialOutlet }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(initialOutlet || null);
  const [explanation, setExplanation] = useState("");
  const [treatment, setTreatment] = useState("SELISIH_KAS");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/finance-ho/rekon/day?date=${date}`);
      setRows(res.data || []);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // Pilih cabang pertama yang butuh perhatian bila belum ada pilihan
  useEffect(() => {
    if (!rows.length) return;
    if (!rows.some((r) => r.outlet_id === sel)) {
      const first = rows.find((r) => r.status === "OPEN") || rows.find((r) => r.status !== "KOSONG") || rows[0];
      setSel(first.outlet_id);
    }
  }, [rows, sel]);

  const d = useMemo(() => rows.find((r) => r.outlet_id === sel), [rows, sel]);

  useEffect(() => {
    if (d) {
      setExplanation(d.explanation || "");
      setTreatment(d.treatment || "SELISIH_KAS");
    }
  }, [d?.outlet_id, d?.explanation, d?.treatment, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const cashDiff = d?.methods.find((m) => m.key === "TUNAI" && m.status === "SELISIH");
  const shortage = cashDiff && cashDiff.diff < 0;

  const [requestNote, setRequestNote] = useState("");
  const requestAgain = async () => {
    setBusy("request");
    setMsg(null);
    try {
      const res = await api("/finance-ho/rekon/request-explanation", { method: "POST", body: JSON.stringify({ date, outlet_id: d.outlet_id, note: requestNote }) });
      setMsg({ type: "ok", text: res.message });
      setRequestNote("");
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const saveExplain = async () => {
    setBusy("explain");
    setMsg(null);
    try {
      const res = await api("/finance-ho/rekon/explain", {
        method: "POST",
        body: JSON.stringify({ date, outlet_id: d.outlet_id, explanation, treatment }),
      });
      setMsg({ type: "ok", text: res.message });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    setBusy("approve");
    setMsg(null);
    try {
      const res = await api("/finance-ho/rekon/approve", { method: "POST", body: JSON.stringify({ date, outlet_id: d.outlet_id }) });
      setMsg({ type: "ok", text: res.message });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const chip = (r) => {
    if (r.status === "APPROVED") return { dot: "bg-emerald-500", text: "Dikunci" };
    if (r.status === "KOSONG") return { dot: "bg-slate-300", text: "Tidak ada transaksi" };
    if (r.status === "BELUM_MULAI") return { dot: "bg-slate-200", text: "Sebelum go-live" };
    if (r.can_approve) return { dot: "bg-sky-500", text: "Siap disetujui" };
    return { dot: "bg-amber-500", text: "Perlu tindakan" };
  };

  return (
    <div className="space-y-4">
      <Notice msg={msg} onClose={() => setMsg(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          Tanggal penjualan:
          <input type="date" value={date} max={localDate(0)} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputCls} />
        </label>
        <button type="button" onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
          <HiOutlineArrowPath className={cn("h-4 w-4", loading && "animate-spin")} />
          Muat ulang
        </button>
      </div>

      {/* Pilih cabang */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {rows.map((r) => {
          const c = chip(r);
          return (
            <button
              key={r.outlet_id}
              type="button"
              onClick={() => setSel(r.outlet_id)}
              className={cn(
                "rounded-xl border bg-white p-3 text-left transition",
                sel === r.outlet_id ? "border-emerald-500 ring-2 ring-emerald-500/15" : "border-slate-200 hover:border-emerald-300"
              )}
            >
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                {r.status === "APPROVED" && <HiOutlineLockClosed className="h-3.5 w-3.5 text-emerald-600" />}
                {r.outlet_name}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                {c.text}
              </p>
            </button>
          );
        })}
      </div>

      {loading && !d ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">Menghitung rekonsiliasi...</div>
      ) : !d ? null : (
        <div className="grid gap-4 xl:grid-cols-5">
          {/* Kiri: tabel metode */}
          <div className="space-y-4 xl:col-span-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-extrabold text-slate-800">
                  Rekonsiliasi {d.outlet_name} <span className="font-semibold text-slate-400">· {fmtDateFull(date)}</span>
                </p>
                {d.locked && (
                  <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                    <HiOutlineLockClosed className="h-3 w-3" /> Dikunci
                  </span>
                )}
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Metode</th>
                    <th className="px-3 py-2.5 text-right">POS</th>
                    <th className="px-3 py-2.5 text-right">Masuk bank</th>
                    <th className="px-3 py-2.5 text-right">MDR</th>
                    <th className="px-3 py-2.5 text-right">Selisih</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.methods.map((m) => {
                    const st = STATUS[m.status];
                    return (
                      <tr key={m.key}>
                        <td className="px-4 py-3 font-bold text-slate-800">{m.label}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{m.pos ? rupiah(m.pos) : "-"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{m.bank != null ? rupiah(m.bank) : "-"}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600">{m.mdr ? rupiah(m.mdr) : "-"}</td>
                        <td className={cn("px-3 py-3 text-right font-semibold tabular-nums", m.status === "SELISIH" ? "text-rose-600" : "text-slate-500")}>
                          {m.status === "KOSONG" || m.status === "BELUM" ? "-" : m.diff === 0 ? "0" : signed(m.diff)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold", st.cls)}>
                            {m.status === "BELUM" ? m.note : st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
                  <tr>
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupiah(d.total.pos)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupiah(d.total.bank)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupiah(d.total.mdr)}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", d.total.diff !== 0 && "text-rose-600")}>{d.total.diff === 0 ? "0" : signed(d.total.diff)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              {(d.transfer_info.bank_transfer > 0 || d.transfer_info.member_balance > 0) && (
                <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500">
                  Tidak masuk tabel di atas: Transfer bank Rp {rupiah(d.transfer_info.bank_transfer)} (dicocokkan lewat mutasi bank) dan pembayaran
                  pakai saldo member Rp {rupiah(d.transfer_info.member_balance)} (dicek bulanan dengan akun Deposit).
                </p>
              )}
            </div>

            {/* Penjelasan selisih tunai */}
            {cashDiff && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-extrabold text-slate-800">
                  Penjelasan selisih tunai ({shortage ? "kas kurang" : "kas lebih"} Rp {rupiah(Math.abs(cashDiff.diff))})
                </p>
                <textarea
                  rows={2}
                  disabled={d.locked}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Misal: Kembalian kurang ke pelanggan nota A-0031 (kasir Rina)"
                  className={cn(inputCls, "w-full resize-none")}
                />
                {shortage ? (
                  <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                    Perlakuan:
                    <select disabled={d.locked} value={treatment} onChange={(e) => setTreatment(e.target.value)} className={inputCls}>
                      <option value="SELISIH_KAS">Selisih Kas (beban perusahaan)</option>
                      <option value="PIUTANG_KARYAWAN">Piutang Karyawan (ditanggung kasir)</option>
                    </select>
                  </label>
                ) : (
                  <p className="text-[11px] text-slate-500">Kas lebih dicatat sebagai Pendapatan Lain-lain, tidak dikembalikan ke laci.</p>
                )}
                {d.explanation_by && (
                  <p className="text-[11px] text-slate-400">Dijelaskan oleh <strong className="text-slate-600">{d.explanation_by}</strong>{d.explanation_at ? `, ${String(d.explanation_at).slice(8, 10)}/${String(d.explanation_at).slice(5, 7)} ${String(d.explanation_at).slice(11, 16).replace(":", ".")}` : ""}</p>
                )}
                {d.explain_requested && (
                  <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-800">Penjelasan ulang diminta{d.requested_by ? ` oleh ${d.requested_by}` : ""}{d.request_note ? `: "${d.request_note}"` : "."} Perbarui penjelasan lalu simpan.</p>
                )}
                {!d.locked && d.explanation && !d.explain_requested && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={requestNote} onChange={(e) => setRequestNote(e.target.value)} placeholder="Catatan untuk cabang (opsional)" className={cn(inputCls, "min-w-[200px] flex-1")} />
                    <button type="button" onClick={requestAgain} disabled={busy === "request"} className="rounded-lg border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-40">
                      {busy === "request" ? "Mengirim..." : "Minta penjelasan ulang"}
                    </button>
                  </div>
                )}
                {!d.locked && (
                  <button
                    type="button"
                    onClick={saveExplain}
                    disabled={busy === "explain" || !explanation.trim()}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {busy === "explain" ? "Menyimpan..." : "Simpan penjelasan"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Kanan: jurnal + aksi */}
          <div className="space-y-4 xl:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <p className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Jurnal otomatis saat disetujui
              </p>
              {d.lines.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-400">
                  {d.locked ? "Jurnal sudah diposting. Lihat di menu Jurnal." : "Pratinjau muncul setelah semua metode terpenuhi."}
                </p>
              ) : (
                <table className="w-full text-[11px]">
                  <tbody>
                    {d.lines.map((l, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className={cn("px-4 py-1.5", l.credit > 0 && "pl-8")}>
                          <span className="font-semibold text-slate-700">{l.account_name}</span>
                          <span className="block text-[10px] text-slate-400">{l.memo}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{l.debit > 0 ? rupiah(l.debit) : ""}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{l.credit > 0 ? rupiah(l.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {d.blockers.length > 0 && (
              <div className="space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                <p className="font-bold">Belum bisa dikunci:</p>
                <ul className="list-disc space-y-1 pl-4">
                  {d.blockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 pt-1">
                  {d.needs_pos_post && (
                    <Link to="/finance-ho/integrasi-pos" className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100">
                      Buka Integrasi POS
                    </Link>
                  )}
                  {d.methods.some((m) => m.key === "TUNAI" && m.status === "BELUM") && (
                    <button type="button" onClick={() => onGoto("setoran")} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100">
                      Catat setoran
                    </button>
                  )}
                  {d.methods.some((m) => m.key !== "TUNAI" && (m.status === "BELUM" || m.status === "SELISIH")) && (
                    <button type="button" onClick={() => onGoto("settlement")} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100">
                      Impor settlement
                    </button>
                  )}
                </div>
              </div>
            )}

            {d.locked ? (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800">
                <HiOutlineLockClosed className="h-4 w-4" />
                Hari ini sudah dikunci. Koreksi dilakukan dengan jurnal balik di menu{" "}
                <Link to="/finance-ho/jurnal-umum" className="underline">Jurnal</Link>.
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={approve}
                  disabled={!d.can_approve || busy === "approve"}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {busy === "approve" ? "Memproses..." : "Setujui & kunci hari"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════ TAB: SETORAN KAS ═════════════════════════
function Setoran({ range, setRange, onOpenDay }) {
  const [rows, setRows] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [outlet, setOutlet] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      if (outlet) qs.set("outlet", outlet);
      const res = await api(`/finance-ho/rekon/deposits?${qs}`);
      setRows(res.data || []);
      if (res.outlets?.length) setOutlets(res.outlets);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [range, outlet]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (r) =>
    setForm({
      outlet_id: r.outlet_id,
      outlet_name: r.outlet_name,
      sales_date: r.sales_date,
      expected: r.expected,
      deposit_date: r.deposit_date || (localDate(0) < r.sales_date ? r.sales_date : localDate(0)),
      amount: r.amount ?? r.expected,
      notes: r.notes || "",
      proof_url: r.proof_url || null,
      proof_name: r.proof_url ? "Slip terlampir" : "",
    });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await api("/finance-ho/rekon/deposits", {
        method: "POST",
        body: JSON.stringify({
          outlet_id: form.outlet_id,
          sales_date: form.sales_date,
          deposit_date: form.deposit_date,
          amount: Number(form.amount),
          notes: form.notes,
          proof_url: form.proof_url,
        }),
      });
      setMsg({ type: "ok", text: res.message });
      setForm(null);
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const [toDelete, setToDelete] = useState(null);
  const remove = async (r) => {
    setToDelete(null);
    try {
      const res = await api(`/finance-ho/rekon/deposits?outlet_id=${r.outlet_id}&sales_date=${r.sales_date}`, { method: "DELETE" });
      setMsg({ type: "ok", text: res.message });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  };

  const onSlip = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile("/finance-ho/rekon/upload", file);
      setForm((f) => ({ ...f, proof_url: res.url, proof_name: res.name }));
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setUploading(false);
    }
  };

  const pending = rows.filter((r) => r.status === "BELUM").length;

  return (
    <div className="space-y-4">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
        <label className="flex items-center gap-1.5">
          Penjualan dari:
          <input type="date" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className={inputCls} />
        </label>
        <label className="flex items-center gap-1.5">
          sampai:
          <input type="date" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className={inputCls} />
        </label>
        <label className="flex items-center gap-1.5">
          Cabang:
          <select value={outlet} onChange={(e) => setOutlet(e.target.value)} className={inputCls}>
            <option value="">Semua</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        {pending > 0 && <span className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700">{pending} belum setor</span>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Setor</th>
                <th className="px-3 py-3">Cabang</th>
                <th className="px-3 py-3">Penjualan</th>
                <th className="px-3 py-3 text-right">Seharusnya</th>
                <th className="px-3 py-3 text-right">Disetor</th>
                <th className="px-3 py-3 text-right">Selisih</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="py-10 text-center text-slate-400">Memuat...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-slate-400">Tidak ada penjualan tunai pada rentang ini.</td></tr>
              ) : (
                rows.map((r) => {
                  const st = STATUS[r.status];
                  return (
                    <tr key={`${r.outlet_id}-${r.sales_date}`} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 tabular-nums text-slate-600">{fmtDate(r.deposit_date)}</td>
                      <td className="px-3 py-3 font-bold text-slate-800">{r.outlet_name}</td>
                      <td className="px-3 py-3 tabular-nums text-slate-600">{fmtDate(r.sales_date)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{rupiah(r.expected)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.amount != null ? rupiah(r.amount) : "-"}</td>
                      <td className={cn("px-3 py-3 text-right font-semibold tabular-nums", r.status === "SELISIH" ? "text-rose-600" : "text-slate-500")}>
                        {r.diff == null ? "-" : r.diff === 0 ? "0" : signed(r.diff)}
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold", st.cls)}>
                          {r.status === "BELUM" ? "Belum setor" : st.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        {r.proof_url && (
                          <a href={r.proof_url} target="_blank" rel="noreferrer" title="Lihat slip" className="mr-2 inline-flex text-slate-400 hover:text-emerald-600">
                            <HiOutlinePaperClip className="h-4 w-4" />
                          </a>
                        )}
                        <button type="button" onClick={() => openForm(r)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
                          {r.amount != null ? "Ubah" : "Catat setoran"}
                        </button>
                        {r.amount != null && onOpenDay && (
                          <button type="button" onClick={() => onOpenDay(r.sales_date, r.outlet_id)} className="ml-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100">
                            Lanjut ke rekonsiliasi
                          </button>
                        )}
                        {r.amount != null && (
                          <button type="button" onClick={() => setToDelete(r)} title="Hapus" className="ml-1.5 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Hapus setoran?"
        desc={toDelete ? `Setoran ${toDelete.outlet_name} untuk penjualan ${fmtDateFull(toDelete.sales_date)} akan dihapus.` : ""}
        onConfirm={() => remove(toDelete)}
      />

      {form && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setForm(null)} />
          <div className="relative w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">Setoran kas</h3>
                <p className="text-xs text-slate-500">
                  {form.outlet_name} · penjualan {fmtDateFull(form.sales_date)} · seharusnya Rp {rupiah(form.expected)}
                </p>
              </div>
              <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600">
                <HiOutlineXMark className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-slate-500">
              <label className="space-y-1">
                Tanggal setor
                <input type="date" value={form.deposit_date} min={form.sales_date} onChange={(e) => setForm({ ...form, deposit_date: e.target.value })} className={cn(inputCls, "w-full")} />
              </label>
              <label className="space-y-1">
                Nominal disetor (Rp)
                <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={cn(inputCls, "w-full text-right tabular-nums")} />
              </label>
            </div>
            <label className="block space-y-1 text-xs font-semibold text-slate-500">
              Catatan
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opsional" className={cn(inputCls, "w-full")} />
            </label>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-500">Foto slip:</span>
              {form.proof_url ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-700">
                  <HiOutlinePaperClip className="h-4 w-4" />
                  <span className="max-w-[160px] truncate">{form.proof_name}</span>
                  <button type="button" onClick={() => setForm({ ...form, proof_url: null, proof_name: "" })} className="text-slate-400 hover:text-rose-500">
                    <HiOutlineXMark className="h-4 w-4" />
                  </button>
                </span>
              ) : (
                <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-1.5 font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700">
                  {uploading ? "Mengunggah..." : "Pilih file"}
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" disabled={uploading} onChange={(e) => { onSlip(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {/* Rincian pembanding (Referensi hal. 13) */}
            <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
              {[
                ["Penjualan tunai " + fmtDate(form.sales_date), rupiah(form.expected)],
                ["Top-up deposit tunai", "belum tersedia*"],
                ["Seharusnya disetor", rupiah(form.expected)],
                ["Disetor ke bank", Number(form.amount) > 0 ? rupiah(form.amount) : "-"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-100 px-3 py-1.5 last:border-0">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-semibold tabular-nums text-slate-700">{v}</span>
                </div>
              ))}
              <div className="flex justify-between bg-slate-50 px-3 py-1.5 font-bold">
                <span>Selisih</span>
                <span className={cn("tabular-nums", Number(form.amount) - Number(form.expected) < 0 && "text-rose-600")}>{Number(form.amount) > 0 ? signed(Number(form.amount) - Number(form.expected)) : "-"}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">* POS belum menyimpan metode bayar top-up, jadi top-up tunai belum ikut dihitung.</p>
            {Number(form.amount) !== Number(form.expected) && Number(form.amount) > 0 && (
              <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-800">
                Selisih {signed(Number(form.amount) - Number(form.expected))}. Penjelasannya diisi di tab Harian.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="button" onClick={save} disabled={saving || !(Number(form.amount) > 0)} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ═════════════════════════ TAB: IMPOR SETTLEMENT ════════════════════════
function Settlement({ range, setRange }) {
  const [rows, setRows] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [manual, setManual] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/finance-ho/rekon/settlements?from=${range.from}&to=${range.to}`);
      setRows(res.data || []);
      if (res.outlets?.length) setOutlets(res.outlets);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const onFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setMsg(null);
    try {
      const res = await uploadFile("/finance-ho/rekon/settlements/import", file);
      setMsg({ type: res.errors?.length ? "error" : "ok", text: res.message, details: res.errors });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message, details: e.data?.errors });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
    const res = await fetch(`${base}/api/finance-ho/rekon/settlements/template`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-settlement.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveManual = async () => {
    setMsg(null);
    try {
      const res = await api("/finance-ho/rekon/settlements", { method: "POST", body: JSON.stringify(manual) });
      setMsg({ type: "ok", text: res.message });
      setManual(null);
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  };

  const [toDelete, setToDelete] = useState(null);
  const remove = async (r) => {
    setToDelete(null);
    try {
      await api(`/finance-ho/rekon/settlements/${r.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  };

  const totals = rows.reduce((s, r) => ({ gross: s.gross + Number(r.gross), mdr: s.mdr + Number(r.mdr), net: s.net + Number(r.net) }), { gross: 0, mdr: 0, net: 0 });

  return (
    <div className="space-y-4">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <ConfirmModal
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Hapus baris settlement?"
        desc={toDelete ? `${toDelete.provider} ${toDelete.outlet_name} transaksi ${fmtDateFull(toDelete.trx_date)} (bruto Rp ${rupiah(toDelete.gross)}) akan dihapus.` : ""}
        onConfirm={() => remove(toDelete)}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="min-w-[240px] flex-1 text-xs text-slate-600">
          Unggah laporan settlement QRIS atau EDC (CSV / Excel). Kolom: <span className="font-mono text-[11px]">tanggal_cair, penyedia, tanggal_transaksi, cabang, bruto, mdr, neto</span>.
          Cabang diisi kode outlet (mis. RH, CG).
        </p>
        <button type="button" onClick={downloadTemplate} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-700">
          Unduh template
        </button>
        <button
          type="button"
          onClick={() => setManual({ outlet_id: outlets[0]?.id || "", provider: "QRIS", trx_date: range.to, settle_date: "", gross: "", mdr: "", net: "" })}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
        >
          <HiOutlinePlus className="h-4 w-4" /> Input manual
        </button>
        <label className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700">
          {importing ? "Mengimpor..." : "Pilih file"}
          <input type="file" accept=".csv,.xlsx" className="hidden" disabled={importing} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>

      {manual && (
        <div className="grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 text-xs font-semibold text-slate-500 sm:grid-cols-4 lg:grid-cols-8">
          <label className="space-y-1">Cabang
            <select value={manual.outlet_id} onChange={(e) => setManual({ ...manual, outlet_id: e.target.value })} className={cn(inputCls, "w-full")}>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">Penyedia
            <input value={manual.provider} onChange={(e) => setManual({ ...manual, provider: e.target.value })} placeholder="QRIS / EDC BCA" className={cn(inputCls, "w-full")} />
          </label>
          <label className="space-y-1">Tgl transaksi
            <input type="date" value={manual.trx_date} onChange={(e) => setManual({ ...manual, trx_date: e.target.value })} className={cn(inputCls, "w-full")} />
          </label>
          <label className="space-y-1">Tgl cair
            <input type="date" value={manual.settle_date} onChange={(e) => setManual({ ...manual, settle_date: e.target.value })} className={cn(inputCls, "w-full")} />
          </label>
          <label className="space-y-1">Bruto
            <input type="number" value={manual.gross} onChange={(e) => setManual({ ...manual, gross: e.target.value })} className={cn(inputCls, "w-full text-right")} />
          </label>
          <label className="space-y-1">MDR
            <input type="number" value={manual.mdr} onChange={(e) => setManual({ ...manual, mdr: e.target.value })} className={cn(inputCls, "w-full text-right")} />
          </label>
          <label className="space-y-1">Neto
            <input type="number" value={manual.net} onChange={(e) => setManual({ ...manual, net: e.target.value })} placeholder="atau isi MDR" className={cn(inputCls, "w-full text-right")} />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" onClick={saveManual} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700">Simpan</button>
            <button type="button" onClick={() => setManual(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600">Batal</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
        <label className="flex items-center gap-1.5">Transaksi dari:
          <input type="date" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className={inputCls} />
        </label>
        <label className="flex items-center gap-1.5">sampai:
          <input type="date" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className={inputCls} />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Cair</th>
                <th className="px-3 py-3">Penyedia</th>
                <th className="px-3 py-3">Transaksi</th>
                <th className="px-3 py-3">Cabang</th>
                <th className="px-3 py-3 text-right">Bruto</th>
                <th className="px-3 py-3 text-right">MDR</th>
                <th className="px-3 py-3 text-right">Neto</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">Memuat...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">Belum ada data settlement pada rentang ini.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 tabular-nums text-slate-600">{r.settle_date ? fmtDate(r.settle_date) : "-"}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{r.provider}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-600">{fmtDate(r.trx_date)}</td>
                    <td className="px-3 py-3">{r.outlet_name}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{rupiah(r.gross)}</td>
                    <td className={cn("px-3 py-3 text-right tabular-nums", r.mdr_warn ? "font-bold text-rose-600" : "text-slate-600")} title={r.mdr_warn ? `Tidak sesuai tarif: seharusnya ± Rp ${rupiah(r.mdr_expected)}` : undefined}>
                      {rupiah(r.mdr)}
                      {r.mdr_warn && <span className="ml-1 text-[9px]">≠ tarif</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{rupiah(r.net)}</td>
                    <td className="px-3 py-3">
                      <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold", r.locked ? "border-emerald-200 bg-emerald-50 text-emerald-700" : (STATUS[r.match_status] || STATUS.BELUM).cls)} title={r.match_status === "SELISIH" ? `POS Rp ${rupiah(r.pos_amount)} · settlement Rp ${rupiah(r.group_gross)}` : undefined}>
                        {r.locked ? "Dikunci" : (STATUS[r.match_status] || STATUS.BELUM).label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {!r.locked && (
                        <button type="button" onClick={() => setToDelete(r)} title="Hapus" className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupiah(totals.gross)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupiah(totals.mdr)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupiah(totals.net)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════ HALAMAN ══════════════════════════════════
const TABS = [
  { id: "harian", label: "Harian", title: "Harian", desc: "Selisih per metode bayar terlihat dan diselesaikan, lalu hari dikunci." },
  { id: "settlement", label: "Impor settlement", title: "Impor settlement", desc: "Laporan QRIS dan EDC dicocokkan dengan POS." },
  { id: "setoran", label: "Setoran kas", title: "Setoran kas", desc: "Setiap setoran tunai punya bukti dan pembanding." },
  { id: "bank", label: "Bank", title: "Bank", desc: "Mutasi rekening dicocokkan dengan catatan sistem." },
];

export default function Rekonsiliasi() {
  const [params] = useSearchParams(); // ?date=&outlet= dari penelusuran jurnal
  const [tab, setTab] = useState(TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "harian");
  const qd = params.get("date");
  const [date, setDate] = useState(qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : localDate(-1));
  const [focusOutlet, setFocusOutlet] = useState(params.get("outlet") ? Number(params.get("outlet")) : null);
  const [range, setRange] = useState({ from: localDate(-13), to: localDate(0) });

  useEffect(() => {
    document.title = "Rekonsiliasi | HO Finance";
  }, []);

  // "Lanjut ke rekonsiliasi" dari tab Setoran kas
  const openDay = (d, outletId) => {
    setDate(d);
    setFocusOutlet(outletId);
    setTab("harian");
  };

  const active = TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div>
        <p className="text-[11px] font-semibold text-slate-400">Rekonsiliasi</p>
        <div className="mt-0.5 flex items-center gap-2">
          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700">
            <HiOutlineScale className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-800">{active.title}</h1>
        </div>
        <p className="mt-1 text-xs text-slate-500">{active.desc}</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-xs font-bold transition",
              tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "harian" && <Harian key={`${date}-${focusOutlet}`} date={date} setDate={setDate} onGoto={setTab} initialOutlet={focusOutlet} />}
      {tab === "settlement" && <Settlement range={range} setRange={setRange} />}
      {tab === "setoran" && <Setoran range={range} setRange={setRange} onOpenDay={openDay} />}
      {tab === "bank" && <BankRekon />}
    </div>
  );
}
