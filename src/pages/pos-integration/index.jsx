import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineChevronDown,
  HiOutlineComputerDesktop,
  HiOutlineExclamationTriangle,
  HiOutlineLockClosed,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import { todayWib } from "../../lib/cutoff";

const cn = (...c) => c.filter(Boolean).join(" ");
const rupiah = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const fmtDateFull = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const fmtTime = (ts) => (ts ? String(ts).slice(11, 16).replace(":", ".") : "");

// Status sama di semua menu (Komponen standar referensi)
const STATUS = {
  VALID: { label: "Valid", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  DIPOSTING: { label: "Diposting", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  GAGAL: { label: "Gagal validasi", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  BERUBAH: { label: "Data POS berubah", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  DIBALIK: { label: "Jurnal dibalik", cls: "bg-slate-100 text-slate-600 border-slate-300" },
  TERKUNCI: { label: "Dikunci", cls: "bg-slate-100 text-slate-600 border-slate-300" },
  KOSONG: { label: "Tidak ada transaksi", cls: "bg-slate-50 text-slate-400 border-slate-200" },
  BELUM_MULAI: { label: "Sebelum go-live", cls: "bg-slate-50 text-slate-400 border-slate-200" },
};

const Badge = ({ status }) => {
  const s = STATUS[status] || STATUS.KOSONG;
  return <span className={cn("whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold", s.cls)}>{s.label}</span>;
};

function SummaryCard({ label, value, hint, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-extrabold tracking-tight", tone || "text-slate-800")}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

// ═════════════════════ DETAIL BATCH (sampai ke setiap nota) ═════════════════
function DetailBatch({ date, row, onBack, onPosted }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("nota");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showJournal, setShowJournal] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api(`/finance-ho/pos/detail?date=${date}&outlet_id=${row.outlet_id}`)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date, row.outlet_id]);

  const TABS = [
    { id: "nota", label: "Nota", rows: data?.nota },
    { id: "pembayaran", label: "Pembayaran", rows: data?.pembayaran },
    { id: "deposit", label: "Deposit", rows: data?.deposit },
    { id: "void", label: "Void", rows: data?.void },
  ];
  const active = TABS.find((t) => t.id === tab);

  const download = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const defs = {
      nota: [["No. nota", "order_no"], ["Jam", "jam"], ["Pelanggan", "customer"], ["Layanan", "layanan"], ["Kg", "total_weight_kg"], ["Pcs", "total_pcs"], ["Neto", "grand_total"], ["Bayar", "payment_method"], ["Status", "payment_status"]],
      pembayaran: [["Jam", "jam"], ["No. nota", "order_no"], ["Jenis", "log_type"], ["Metode", "payment_method"], ["Jumlah", "amount"]],
      deposit: [["Jam", "jam"], ["Member", "customer"], ["Jenis", "type"], ["Jumlah", "amount"], ["Metode", "payment_method"], ["Catatan", "notes"]],
      void: [["No. nota", "order_no"], ["Jam", "jam"], ["Neto", "grand_total"], ["Alasan", "delete_reason"]],
    }[tab];
    const body = (active.rows || []).map((r) => defs.map(([, k]) => esc(r[k])).join(";"));
    const csv = "﻿" + [defs.map(([h]) => esc(h)).join(";"), ...body].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.batch_code}-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalNeto = (data?.nota || []).reduce((s, n) => s + n.grand_total, 0);
  const totalKg = (data?.nota || []).reduce((s, n) => s + n.total_weight_kg, 0);
  const totalPcs = (data?.nota || []).reduce((s, n) => s + n.total_pcs, 0);
  const totalBayar = (data?.pembayaran || []).reduce((s, p) => s + p.amount, 0);
  const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={onBack} className="mb-2 flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-emerald-700">
          <HiOutlineArrowLeft className="h-3.5 w-3.5" /> Sinkronisasi harian
        </button>
        <p className="text-[11px] font-semibold text-slate-400">Integrasi POS</p>
        <h1 className="text-lg font-extrabold tracking-tight text-slate-800">
          Detail batch <span className="font-semibold text-slate-400">· {row.outlet_name} {fmtDateFull(date)}</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500">Jurnal harian bisa ditelusuri sampai ke setiap nota.</p>
      </div>

      {/* Info batch */}
      <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
        {[
          ["Batch", <span className="font-mono">{row.batch_code}</span>],
          ["Diposting", row.posted_at ? `${fmtDateFull(String(row.posted_at).slice(0, 10))} · ${fmtTime(row.posted_at)}` : "Belum"],
          ["Status", <Badge status={row.status} />],
          ["Jurnal", row.journal_no ? <span className="font-mono">{row.journal_no}</span> : "-"],
        ].map(([k, v]) => (
          <div key={k} className="bg-white p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p>
            <div className="mt-1 text-xs font-semibold text-slate-800">{v}</div>
          </div>
        ))}
      </div>

      {row.issues.length > 0 && (
        <div className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <p className="flex items-center gap-1.5 font-bold">
            <HiOutlineExclamationTriangle className="h-4 w-4" /> Gagal validasi
          </p>
          <ul className="list-disc pl-5">
            {row.issues.map((i, k) => (
              <li key={k}>{i.text}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Pratinjau jurnal */}
      {row.lines.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <button type="button" onClick={() => setShowJournal((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-xs font-bold text-slate-700">
            {row.journal_no ? "Jurnal yang diposting" : "Pratinjau jurnal sebelum posting"}
            <HiOutlineChevronDown className={cn("h-4 w-4 text-slate-400 transition", showJournal && "rotate-180")} />
          </button>
          {showJournal && (
            <table className="w-full border-t border-slate-100 text-[11px]">
              <tbody>
                {row.lines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className={cn("px-4 py-1.5", l.credit > 0 && "pl-8")}>
                      <span className="font-semibold text-slate-700">{l.account_code} {l.account_name}</span>
                      <span className="ml-2 text-slate-400">{l.memo}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.debit > 0 ? rupiah(l.debit) : ""}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{l.credit > 0 ? rupiah(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab rincian */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex gap-1 border-b border-slate-100 px-3 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-xs font-bold transition",
                tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              {t.label} ({t.rows ? t.rows.length : "…"})
            </button>
          ))}
        </div>

        {error ? (
          <p className="p-6 text-center text-xs text-rose-600">{error}</p>
        ) : loading ? (
          <p className="p-10 text-center text-xs text-slate-400">Memuat rincian...</p>
        ) : (active.rows || []).length === 0 ? (
          <p className="p-10 text-center text-xs text-slate-400">Tidak ada data {active.label.toLowerCase()} pada hari ini.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50">
                {tab === "nota" && (
                  <tr><th className={th}>No. nota</th><th className={th}>Jam</th><th className={th}>Pelanggan</th><th className={th}>Layanan</th><th className={cn(th, "text-right")}>Kg / qty</th><th className={cn(th, "text-right")}>Neto</th><th className={th}>Bayar</th></tr>
                )}
                {tab === "pembayaran" && (
                  <tr><th className={th}>Jam</th><th className={th}>No. nota</th><th className={th}>Jenis</th><th className={th}>Metode</th><th className={cn(th, "text-right")}>Jumlah</th></tr>
                )}
                {tab === "deposit" && (
                  <tr><th className={th}>Jam</th><th className={th}>Member</th><th className={th}>Jenis</th><th className={th}>Metode</th><th className={cn(th, "text-right")}>Jumlah</th></tr>
                )}
                {tab === "void" && (
                  <tr><th className={th}>No. nota</th><th className={th}>Jam</th><th className={th}>Alasan</th><th className={cn(th, "text-right")}>Neto</th></tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tab === "nota" && data.nota.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{n.order_no}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{n.jam?.replace(":", ".")}</td>
                    <td className="px-3 py-2">{n.customer || "Umum"}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-slate-600" title={n.layanan}>{n.layanan || n.order_category}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{n.total_weight_kg > 0 ? `${n.total_weight_kg} kg` : `${n.total_pcs} pcs`}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupiah(n.grand_total)}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {n.payment_method || <span className="font-semibold text-rose-600">tidak ada</span>}
                      {n.payment_status !== "Lunas" && <span className="ml-1.5 rounded bg-amber-50 px-1.5 text-[9px] font-bold text-amber-700">{n.payment_status}</span>}
                    </td>
                  </tr>
                ))}
                {tab === "pembayaran" && data.pembayaran.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 tabular-nums text-slate-500">{p.jam?.replace(":", ".")}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{p.order_no}</td>
                    <td className="px-3 py-2 text-slate-600">{p.log_type}</td>
                    <td className="px-3 py-2">{p.payment_method || <span className="font-semibold text-rose-600">tidak ada</span>}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupiah(p.amount)}</td>
                  </tr>
                ))}
                {tab === "deposit" && data.deposit.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 tabular-nums text-slate-500">{d.jam?.replace(":", ".")}</td>
                    <td className="px-3 py-2">{d.customer || "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{d.type}</td>
                    <td className="px-3 py-2 text-slate-600">{d.payment_method || "-"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupiah(d.amount)}</td>
                  </tr>
                ))}
                {tab === "void" && data.void.map((v, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{v.order_no}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{v.jam?.replace(":", ".")}</td>
                    <td className="px-3 py-2 text-slate-600">{v.delete_reason || "-"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupiah(v.grand_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
                {tab === "nota" && (
                  <tr><td colSpan={4} className="px-3 py-2.5">Total {data.nota.length} nota</td><td className="px-3 py-2.5 text-right tabular-nums">{totalKg > 0 ? `${Math.round(totalKg * 10) / 10} kg` : ""}{totalKg > 0 && totalPcs > 0 ? " · " : ""}{totalPcs > 0 ? `${totalPcs} pcs` : ""}</td><td className="px-3 py-2.5 text-right tabular-nums">{rupiah(totalNeto)}</td><td /></tr>
                )}
                {tab === "pembayaran" && (
                  <tr><td colSpan={4} className="px-3 py-2.5">Total {data.pembayaran.length} pembayaran</td><td className="px-3 py-2.5 text-right tabular-nums">{rupiah(totalBayar)}</td></tr>
                )}
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <button type="button" onClick={download} disabled={!(active.rows || []).length} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40">
            Unduh Excel
          </button>
          <p className="text-[11px] text-slate-400">Data POS hanya bisa dibaca, tidak bisa diubah di sini</p>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════ SINKRONISASI HARIAN ══════════════════════════════
export default function PosIntegration() {
  const [params] = useSearchParams(); // ?date=&outlet= dari penelusuran jurnal
  const [date, setDate] = useState(() => {
    const qd = params.get("date");
    if (qd && /^\d{4}-\d{2}-\d{2}$/.test(qd)) return qd;
    const [y, m, d] = todayWib().split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - 1));
    return dt.toISOString().slice(0, 10); // default: kemarin (hari yang sudah lengkap)
  });
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [detail, setDetail] = useState(params.get("outlet") ? Number(params.get("outlet")) : null);
  const [showMap, setShowMap] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    document.title = "Integrasi POS | HO Finance";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/finance-ho/pos/day?date=${date}`);
      setRows(res.data || []);
      setMapping(res.mapping || []);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (path, body, key) => {
    setBusy(key);
    setMsg(null);
    try {
      const res = await api(path, { method: "POST", body: JSON.stringify(body) });
      const failed = (res.results || []).filter((r) => !r.ok);
      setMsg({
        type: failed.length ? "error" : "ok",
        text: failed.length ? `${res.message} Gagal: ${failed.map((f) => `${f.outlet_name} (${f.message})`).join("; ")}` : res.message,
      });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const stats = useMemo(() => {
    const withData = rows.filter((r) => r.status !== "KOSONG");
    const relevant = rows.filter((r) => r.status !== "KOSONG" || !r.is_event);
    return {
      sent: withData.length,
      total: relevant.length,
      posted: rows.filter((r) => r.status === "DIPOSTING" || r.status === "BERUBAH").length,
      ready: rows.filter((r) => r.status === "VALID" || r.status === "DIBALIK").length,
      check: rows.filter((r) => r.status === "GAGAL" || r.status === "BERUBAH").length,
    };
  }, [rows]);

  const problems = rows.filter((r) => r.status === "GAGAL");
  const mapMissing = mapping.filter((m) => !m.account_code);
  const current = detail ? rows.find((r) => r.outlet_id === detail) : null;

  if (current) {
    return (
      <div className="p-4 sm:p-6">
        <DetailBatch date={date} row={current} onBack={() => setDetail(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">Integrasi POS</p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="rounded-xl bg-sky-50 p-2 text-sky-700">
              <HiOutlineComputerDesktop className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Sinkronisasi harian</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">Status data POS dari setiap cabang. Cek, lalu posting menjadi jurnal (1 jurnal per cabang per hari).</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          Tanggal:
          <input
            type="date"
            value={date}
            max={todayWib()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
          />
        </label>
      </div>

      {msg && (
        <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs font-medium", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {msg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {mapMissing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Pemetaan akun belum lengkap: {mapMissing.map((m) => m.label).join(", ")}. Lengkapi di <Link to="/finance-ho/pengaturan?tab=akun" className="font-bold underline">Pengaturan › Pemetaan akun</Link>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Cabang terkirim" value={`${stats.sent} / ${stats.total}`} hint="cabang yang punya transaksi" />
        <SummaryCard label="Diposting" value={stats.posted} tone="text-emerald-700" />
        <SummaryCard label="Siap posting" value={stats.ready} tone="text-sky-700" />
        <SummaryCard label="Perlu dicek" value={stats.check} tone={stats.check ? "text-rose-600" : undefined} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Cabang</th>
                <th className="px-3 py-3 text-right">Nota</th>
                <th className="px-3 py-3 text-right">Penjualan neto</th>
                <th className="px-3 py-3 text-right">Pembayaran</th>
                <th className="px-3 py-3">Diterima</th>
                <th className="px-3 py-3">Diposting</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Jurnal</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">Menarik data POS...</td></tr>
              ) : (
                rows.map((r) => {
                  const canPost = (r.status === "VALID" || r.status === "DIBALIK") && r.missing_roles.length === 0;
                  return (
                    <tr key={r.outlet_id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => r.status !== "KOSONG" && setDetail(r.outlet_id)} className={cn("flex items-center gap-1.5 font-bold text-slate-800", r.status !== "KOSONG" && "hover:text-emerald-700")}>
                          {r.locked && <HiOutlineLockClosed className="h-3.5 w-3.5 text-emerald-600" title="Hari dikunci" />}
                          {r.outlet_name}
                          {r.is_event && <span className="rounded bg-violet-50 px-1.5 text-[9px] text-violet-700">Event</span>}
                        </button>
                        <p className="font-mono text-[10px] text-slate-400">{r.batch_code}</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.notes_count || "-"}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{r.revenue ? rupiah(r.revenue) : "-"}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{r.payments_total ? rupiah(r.payments_total) : "-"}</td>
                      <td className="px-3 py-3 tabular-nums text-slate-500" title={r.synced_at ? `Terakhir ditarik ${r.synced_at}` : ""}>{r.received_at ? `${String(r.received_at).slice(8, 10)}/${String(r.received_at).slice(5, 7)} · ${fmtTime(r.received_at)}` : "-"}</td>
                      <td className="px-3 py-3 tabular-nums text-slate-500">{r.posted_at ? `${String(r.posted_at).slice(8, 10)}/${String(r.posted_at).slice(5, 7)} · ${fmtTime(r.posted_at)}` : "-"}</td>
                      <td className="px-3 py-3" title={r.start_note || undefined}><Badge status={r.status} /></td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600">{r.journal_no || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        {r.status !== "KOSONG" && (
                          <button type="button" onClick={() => setDetail(r.outlet_id)} className="mr-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
                            Lihat nota
                          </button>
                        )}
                        {canPost && (
                          <button type="button" disabled={busy !== null} onClick={() => run("/finance-ho/pos/post", { date, outlet_id: r.outlet_id }, r.outlet_id)} className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                            {busy === r.outlet_id ? "..." : "Posting"}
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

      {problems.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
          {problems.map((r) => (
            <div key={r.outlet_id} className="flex flex-wrap items-start justify-between gap-2 text-xs text-rose-800">
              <div>
                <span className="font-bold">{r.outlet_name}:</span> {r.issues.slice(0, 3).map((i) => i.text).join("; ")}
                {r.issues.length > 3 && ` (+${r.issues.length - 3} lainnya)`}
              </div>
              <button type="button" onClick={() => setDetail(r.outlet_id)} className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100">
                Lihat nota
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("sync");
            setMsg(null);
            try {
              const res = await api("/finance-ho/pos/sync", { method: "POST", body: JSON.stringify({ date }) });
              setMsg({ type: "ok", text: res.message });
              await load();
            } catch (e) {
              setMsg({ type: "error", text: e.message });
            } finally {
              setBusy(null);
            }
          }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
        >
          <HiOutlineArrowPath className={cn("h-4 w-4", (loading || busy === "sync") && "animate-spin")} />
          Tarik ulang data
        </button>
        <button
          type="button"
          disabled={busy !== null || stats.ready === 0}
          onClick={() => run("/finance-ho/pos/post-all", { date }, "all")}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {busy === "all" ? "Memposting..." : `Posting yang valid (${stats.ready})`}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white">
        <button type="button" onClick={() => setShowMap((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-xs font-bold text-slate-700">
          Pemetaan akun yang dipakai
          <HiOutlineChevronDown className={cn("h-4 w-4 text-slate-400 transition", showMap && "rotate-180")} />
        </button>
        {showMap && (
          <p className="border-t border-slate-100 px-4 pt-3 text-[11px] text-slate-500">
            Ubah pemetaan layanan dan metode bayar di{" "}
            <Link to="/finance-ho/pengaturan?tab=akun" className="font-bold text-emerald-700 hover:underline">Pengaturan › Pemetaan akun</Link>.
          </p>
        )}
        {showMap && (
          <div className="grid gap-x-6 gap-y-1 px-4 py-3 text-xs sm:grid-cols-2">
            {mapping.map((m) => (
              <div key={m.role} className="flex justify-between gap-3 py-1">
                <span className="text-slate-500">{m.label}</span>
                <span className="font-semibold text-slate-800">{m.account_code ? `${m.account_code} ${m.account_name}` : "— belum ada —"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
