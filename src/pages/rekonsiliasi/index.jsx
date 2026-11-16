import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { rekonTabOf } from "../../lib/tabs";
import BankRekon from "./components/BankRekon";
import ImportMutasi from "./components/ImportMutasi";
import Workspace from "./components/Workspace";
import Riwayat from "./components/Riwayat";
import {
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineLockClosed,
  HiOutlineScale,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api } from "../../lib/api";

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
};

const inputCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";

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
                  {d.methods.some((m) => m.status === "BELUM" || (m.key !== "TUNAI" && m.status === "SELISIH")) && (
                    <button type="button" onClick={() => onGoto("transaksi")} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100">
                      Cocokkan di Rekonsiliasi Transaksi
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

// ═════════════════════════════ HALAMAN ══════════════════════════════════
const TABS = [
  { id: "transaksi", label: "Rekonsiliasi transaksi", title: "Rekonsiliasi transaksi", desc: "Cocokkan transaksi internal (kiri) dengan mutasi bank (kanan), sampai uang benar-benar masuk atau keluar rekening." },
  { id: "import", label: "Import data", title: "Import data", desc: "Unggah rekening koran (uang yang benar-benar masuk/keluar bank). Setelah itu cocokkan di Rekonsiliasi transaksi." },
  { id: "harian", label: "Rekonsiliasi harian", title: "Rekonsiliasi harian", desc: "Selisih per metode bayar terlihat dan diselesaikan, lalu hari dikunci." },
  { id: "riwayat", label: "Riwayat", title: "Riwayat", desc: "Catatan import, pencocokan, pembatalan, dan perubahan status." },
  { id: "bank", label: "Jurnal bank", title: "Jurnal bank", desc: "Pencocokan mutasi ke baris jurnal di akun bank, saldo rekening koran, dan jurnal biaya admin." },
];

export default function Rekonsiliasi() {
  // Satu tab aplikasi; sub-halaman (Transaksi, Import, Harian, ...) dipilih lewat strip di bawah judul.
  // ?tab=&date=&outlet= datang dari tautan lain (mis. penelusuran jurnal).
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const [tab, setTab] = useState(() => rekonTabOf(search));
  const qd = params.get("date");
  const [date, setDate] = useState(qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : localDate(-1));
  const [focusOutlet, setFocusOutlet] = useState(params.get("outlet") ? Number(params.get("outlet")) : null);

  useEffect(() => {
    document.title = "Rekonsiliasi | HO Finance";
  }, []);

  const goto = (t) => setTab(t);

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

      {tab === "harian" && <Harian key={`${date}-${focusOutlet}`} date={date} setDate={setDate} onGoto={goto} initialOutlet={focusOutlet} />}
      {tab === "transaksi" && <Workspace onGoImport={() => setTab("import")} />}
      {tab === "import" && <ImportMutasi onDone={() => setTab("transaksi")} />}
      {tab === "riwayat" && <Riwayat />}
      {tab === "bank" && <BankRekon />}
    </div>
  );
}
