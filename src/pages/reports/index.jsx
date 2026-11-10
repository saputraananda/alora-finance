import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineArrowPath, HiOutlineDocumentChartBar, HiOutlinePrinter, HiOutlineTableCells } from "react-icons/hi2";
import { api } from "../../lib/api";
import { currentCutoffKey, cutoffMonthLabel, cutoffRangeLabel } from "../../lib/cutoff";
import PeriodFilter, { periodText } from "../../components/ui/PeriodFilter";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const rpMinus = (n) => (Number(n) < 0 ? `(${rp(Math.abs(n))})` : rp(n));
const pct = (n) => (n == null ? "-" : `${String(n).replace(".", ",")}%`);
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");

const REPORTS = [
  { id: "profit-loss", label: "Laba rugi", sub: "Per cabang dan total" },
  { id: "balance-sheet", label: "Neraca", sub: "Posisi keuangan akhir periode" },
  { id: "trial-balance", label: "Neraca saldo", sub: "Saldo awal, mutasi, saldo akhir" },
  { id: "aging", label: "Aging piutang", sub: "Nota belum lunas" },
  { id: "cash-diff", label: "Rekap selisih kas", sub: "Dari rekonsiliasi harian" },
  { id: "mdr", label: "Rekap MDR", sub: "Dari settlement QRIS/EDC" },
  { id: "cash-flow", label: "Arus kas", sub: "Belum tersedia", disabled: true },
  { id: "ap-aging", label: "Aging hutang", sub: "Menunggu modul Pembelian", disabled: true },
];

const selectCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

function downloadCsv(name, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ═════════════════════════ LABA RUGI ═════════════════════════════════════
function ProfitLoss({ d, compare, glLink }) {
  const cols = d.columns;
  const showCols = cols.length > 1;
  const section = (type, title) => {
    const list = d.accounts.filter((a) => a.type === type);
    const tot = type === "PENDAPATAN" ? d.totals.revenue : d.totals.expense;
    return (
      <>
        <tr className="bg-slate-50"><td colSpan={cols.length + 3} className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{title}</td></tr>
        {list.length === 0 && <tr><td colSpan={cols.length + 3} className="px-3 py-3 text-xs text-slate-400">Tidak ada transaksi.</td></tr>}
        {list.map((a) => (
          <tr key={a.id} className="hover:bg-slate-50/60">
            <td className="px-3 py-2">
              <Link to={glLink(a.id)} className="hover:text-emerald-700 hover:underline" title="Telusuri di Buku Besar">
                <span className="font-mono text-slate-400">{a.code}</span> <span className="font-semibold text-slate-800">{a.name}</span>
              </Link>
            </td>
            {showCols && cols.map((c) => <td key={c.key} className="px-3 py-2 text-right tabular-nums text-slate-600">{a.byOutlet[c.key] ? rpMinus(a.byOutlet[c.key]) : "-"}</td>)}
            <td className="px-3 py-2 text-right font-semibold tabular-nums">{rpMinus(a.total)}</td>
            {compare && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{a.prev_total ? rpMinus(a.prev_total) : "-"}</td>}
          </tr>
        ))}
        <tr className="border-t border-slate-200 font-bold">
          <td className="px-3 py-2">Total {title.toLowerCase()}</td>
          {showCols && cols.map((c) => <td key={c.key} className="px-3 py-2 text-right tabular-nums">{rpMinus(tot[c.key])}</td>)}
          <td className="px-3 py-2 text-right tabular-nums">{rpMinus(tot.total)}</td>
          {compare && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{rpMinus(tot.prev)}</td>}
        </tr>
      </>
    );
  };
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-100 bg-slate-50">
          <tr>
            <th className={th}>Rp</th>
            {showCols && cols.map((c) => <th key={c.key} className={cn(th, "text-right")}>{c.name}</th>)}
            <th className={cn(th, "text-right")}>Total</th>
            {compare && <th className={cn(th, "text-right")}>Periode lalu</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {section("PENDAPATAN", "Pendapatan")}
          {section("BEBAN", "Beban")}
          <tr className="border-t-2 border-slate-300 bg-emerald-50/50 font-extrabold">
            <td className="px-3 py-3">Laba (rugi) bersih</td>
            {showCols && cols.map((c) => <td key={c.key} className={cn("px-3 py-3 text-right tabular-nums", d.totals.profit[c.key] < 0 && "text-rose-600")}>{rpMinus(d.totals.profit[c.key])}</td>)}
            <td className={cn("px-3 py-3 text-right tabular-nums", d.totals.profit.total < 0 && "text-rose-600")}>{rpMinus(d.totals.profit.total)}</td>
            {compare && <td className="px-3 py-3 text-right tabular-nums text-slate-500">{rpMinus(d.totals.profit.prev)}</td>}
          </tr>
          <tr className="text-slate-500">
            <td className="px-3 py-2">Margin</td>
            {showCols && cols.map((c) => <td key={c.key} className="px-3 py-2 text-right tabular-nums">{pct(d.totals.margin[c.key])}</td>)}
            <td className="px-3 py-2 text-right tabular-nums">{pct(d.totals.margin.total)}</td>
            {compare && <td className="px-3 py-2 text-right tabular-nums">{pct(d.totals.margin.prev)}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ═════════════════════════ NERACA ════════════════════════════════════════
function BalanceSheet({ d }) {
  const block = (title, list, total, extra) => (
    <div>
      <p className="bg-slate-50 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{title}</p>
      <table className="w-full text-xs">
        <tbody className="divide-y divide-slate-100">
          {list.map((r) => (
            <tr key={r.id}><td className="px-3 py-2"><span className="font-mono text-slate-400">{r.code}</span> <span className="font-semibold text-slate-800">{r.name}</span></td><td className="px-3 py-2 text-right tabular-nums">{rpMinus(r.amount)}</td></tr>
          ))}
          {extra}
          {list.length === 0 && !extra && <tr><td className="px-3 py-2 text-slate-400" colSpan={2}>Tidak ada saldo.</td></tr>}
          <tr className="border-t border-slate-200 font-bold"><td className="px-3 py-2">Total {title.toLowerCase()}</td><td className="px-3 py-2 text-right tabular-nums">{rpMinus(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{block("Aset", d.aset, d.totals.aset)}</div>
        <div className="space-y-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {block("Kewajiban", d.kewajiban, d.totals.kewajiban)}
          {block(
            "Ekuitas",
            d.ekuitas,
            toNum(d.totals.ekuitas + d.current_profit),
            <tr><td className="px-3 py-2 text-slate-600">Laba (rugi) berjalan</td><td className="px-3 py-2 text-right tabular-nums">{rpMinus(d.current_profit)}</td></tr>
          )}
          <div className="flex justify-between border-t-2 border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-extrabold"><span>Total kewajiban + ekuitas</span><span className="tabular-nums">{rpMinus(d.totals.pasiva)}</span></div>
        </div>
      </div>
      <p className={cn("rounded-xl border p-3 text-xs font-semibold", d.balanced ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
        {d.balanced ? "Neraca seimbang: total aset sama dengan kewajiban + ekuitas." : `Neraca tidak seimbang (selisih Rp ${rp(Math.abs(d.totals.aset - d.totals.pasiva))}).`} {d.note}
      </p>
    </div>
  );
}
const toNum = (n) => Math.round(Number(n) * 100) / 100;

// ═════════════════════════ NERACA SALDO ══════════════════════════════════
function TrialBalance({ d }) {
  const t = d.totals;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-100 bg-slate-50">
          <tr>
            <th className={th} rowSpan={2}>Akun</th>
            <th className={cn(th, "text-center")} colSpan={2}>Saldo awal</th>
            <th className={cn(th, "text-center")} colSpan={2}>Mutasi</th>
            <th className={cn(th, "text-center")} colSpan={2}>Saldo akhir</th>
          </tr>
          <tr>{["Debit", "Kredit", "Debit", "Kredit", "Debit", "Kredit"].map((h, i) => <th key={i} className={cn(th, "text-right")}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {d.accounts.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Belum ada jurnal sampai akhir periode.</td></tr>}
          {d.accounts.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50/60">
              <td className="px-3 py-2"><span className="font-mono text-slate-400">{a.code}</span> <span className="font-semibold text-slate-800">{a.name}</span></td>
              {[a.opening.d, a.opening.k, a.debit, a.credit, a.closing.d, a.closing.k].map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums text-slate-600">{v ? rp(v) : "-"}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-extrabold">
          <tr>
            <td className="px-3 py-2.5">Total</td>
            {[t.opening_d, t.opening_k, t.debit, t.credit, t.closing_d, t.closing_k].map((v, i) => <td key={i} className="px-3 py-2.5 text-right tabular-nums">{rp(v)}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ═════════════════════════ AGING PIUTANG ═════════════════════════════════
function Aging({ d }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total piutang</p><p className="mt-1 text-lg font-extrabold">Rp {rp(d.total)}</p><p className="text-[11px] text-slate-400">{rp(d.count)} nota</p></div>
        {d.buckets.map((b) => (
          <div key={b.key} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{b.label}</p><p className="mt-1 text-lg font-extrabold">{rp(b.amount)}</p><p className="text-[11px] text-slate-400">{rp(b.count)} nota</p></div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-100 bg-slate-50"><tr><th className={th}>Pelanggan</th>{d.buckets.map((b) => <th key={b.key} className={cn(th, "text-right")}>{b.label}</th>)}<th className={cn(th, "text-right")}>Total</th><th className={cn(th, "text-right")}>Tertua</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {d.top_customers.map((c, i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="px-3 py-2 font-semibold text-slate-800">{c.customer} <span className="font-normal text-slate-400">· {c.count} nota</span></td>
                {c.buckets.map((v, k) => <td key={k} className="px-3 py-2 text-right tabular-nums text-slate-600">{v ? rp(v) : "-"}</td>)}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{rp(c.amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{rp(c.oldest)} hari</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500">Menampilkan 50 pelanggan dengan sisa terbesar. Umur dihitung sejak nota dibuat (belum ada kebijakan jatuh tempo). Dibaca dari POS per {dmy(d.as_of)}.</p>
      </div>
    </div>
  );
}

// ═════════════════════════ SELISIH KAS & MDR ═════════════════════════════
function CashDiff({ d }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Kejadian", rp(d.totals.events)], ["Kas kurang", rpMinus(d.totals.shortage)], ["Kas lebih", rpMinus(d.totals.surplus)], ["Selisih bersih", rpMinus(d.totals.net)]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p><p className="mt-1 text-lg font-extrabold">{v}</p></div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-100 bg-slate-50"><tr><th className={th}>Tanggal</th><th className={th}>Cabang</th><th className={cn(th, "text-right")}>Seharusnya</th><th className={cn(th, "text-right")}>Disetor</th><th className={cn(th, "text-right")}>Selisih</th><th className={th}>Penjelasan</th><th className={th}>Perlakuan</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {d.rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Tidak ada selisih kas pada hari yang sudah dikunci.</td></tr>}
            {d.rows.map((r, i) => (
              <tr key={i}><td className="px-3 py-2 tabular-nums">{dmy(r.date)}</td><td className="px-3 py-2 font-semibold">{r.outlet_name}</td><td className="px-3 py-2 text-right tabular-nums">{rp(r.pos)}</td><td className="px-3 py-2 text-right tabular-nums">{rp(r.deposited)}</td><td className={cn("px-3 py-2 text-right font-semibold tabular-nums", r.diff < 0 && "text-rose-600")}>{rpMinus(r.diff)}</td><td className="px-3 py-2 text-slate-600">{r.explanation || "-"}</td><td className="px-3 py-2 text-slate-500">{r.diff < 0 ? (r.treatment === "PIUTANG_KARYAWAN" ? "Piutang Karyawan" : "Selisih Kas") : "Pendapatan Lain"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Mdr({ d }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-100 bg-slate-50"><tr><th className={th}>Cabang</th><th className={th}>Penyedia</th><th className={cn(th, "text-right")}>Baris</th><th className={cn(th, "text-right")}>Bruto</th><th className={cn(th, "text-right")}>MDR</th><th className={cn(th, "text-right")}>Neto</th><th className={cn(th, "text-right")}>Tarif efektif</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {d.rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Belum ada data settlement pada periode ini.</td></tr>}
          {d.rows.map((r, i) => (
            <tr key={i}><td className="px-3 py-2 font-semibold">{r.outlet_name}</td><td className="px-3 py-2">{r.provider}</td><td className="px-3 py-2 text-right tabular-nums">{r.count}</td><td className="px-3 py-2 text-right tabular-nums">{rp(r.gross)}</td><td className="px-3 py-2 text-right tabular-nums">{rp(r.mdr)}</td><td className="px-3 py-2 text-right tabular-nums">{rp(r.net)}</td><td className="px-3 py-2 text-right tabular-nums">{pct(r.rate)}</td></tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-extrabold"><tr><td className="px-3 py-2.5" colSpan={3}>Total</td><td className="px-3 py-2.5 text-right tabular-nums">{rp(d.totals.gross)}</td><td className="px-3 py-2.5 text-right tabular-nums">{rp(d.totals.mdr)}</td><td className="px-3 py-2.5 text-right tabular-nums">{rp(d.totals.net)}</td><td className="px-3 py-2.5 text-right tabular-nums">{pct(d.totals.rate)}</td></tr></tfoot>
      </table>
    </div>
  );
}

// ═════════════════════════ Baris untuk ekspor Excel ══════════════════════
function toRows(type, d, compare) {
  if (type === "profit-loss") {
    const head = ["Akun", ...d.columns.map((c) => c.name), "Total", ...(compare ? ["Periode lalu"] : [])];
    const line = (a) => [`${a.code} ${a.name}`, ...d.columns.map((c) => a.byOutlet[c.key] || 0), a.total, ...(compare ? [a.prev_total] : [])];
    const tot = (label, t) => [label, ...d.columns.map((c) => t[c.key]), t.total, ...(compare ? [t.prev] : [])];
    return [head, ...d.accounts.filter((a) => a.type === "PENDAPATAN").map(line), tot("Total pendapatan", d.totals.revenue), ...d.accounts.filter((a) => a.type === "BEBAN").map(line), tot("Total beban", d.totals.expense), tot("Laba (rugi) bersih", d.totals.profit)];
  }
  if (type === "balance-sheet") {
    return [["Kelompok", "Akun", "Jumlah"], ...d.aset.map((r) => ["Aset", `${r.code} ${r.name}`, r.amount]), ["Aset", "TOTAL", d.totals.aset], ...d.kewajiban.map((r) => ["Kewajiban", `${r.code} ${r.name}`, r.amount]), ...d.ekuitas.map((r) => ["Ekuitas", `${r.code} ${r.name}`, r.amount]), ["Ekuitas", "Laba (rugi) berjalan", d.current_profit], ["Kewajiban + Ekuitas", "TOTAL", d.totals.pasiva]];
  }
  if (type === "trial-balance") {
    return [["Akun", "Awal Debit", "Awal Kredit", "Mutasi Debit", "Mutasi Kredit", "Akhir Debit", "Akhir Kredit"], ...d.accounts.map((a) => [`${a.code} ${a.name}`, a.opening.d, a.opening.k, a.debit, a.credit, a.closing.d, a.closing.k]), ["Total", d.totals.opening_d, d.totals.opening_k, d.totals.debit, d.totals.credit, d.totals.closing_d, d.totals.closing_k]];
  }
  if (type === "aging") {
    return [["Pelanggan", ...d.buckets.map((b) => b.label), "Total", "Tertua (hari)"], ...d.top_customers.map((c) => [c.customer, ...c.buckets, c.amount, c.oldest])];
  }
  if (type === "cash-diff") {
    return [["Tanggal", "Cabang", "Seharusnya", "Disetor", "Selisih", "Penjelasan", "Perlakuan"], ...d.rows.map((r) => [r.date, r.outlet_name, r.pos, r.deposited, r.diff, r.explanation, r.treatment])];
  }
  return [["Cabang", "Penyedia", "Baris", "Bruto", "MDR", "Neto", "Tarif efektif %"], ...d.rows.map((r) => [r.outlet_name, r.provider, r.count, r.gross, r.mdr, r.net, r.rate])];
}

// ═════════════════════════ HALAMAN ═══════════════════════════════════════
export default function LaporanKeuangan() {
  const [type, setType] = useState("profit-loss");
  const [period, setPeriod] = useState({ custom: false, month: currentCutoffKey(), from: "", to: "" });
  const month = period.month;
  const [outlet, setOutlet] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [compare, setCompare] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Laporan Keuangan | HO Finance";
    api("/finance-ho/journals/meta").then((r) => setOutlets(r.outlets || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [y, m] = month.split("-");
      const qs = new URLSearchParams({ year: String(Number(y)), month: String(Number(m)) });
      if (period.custom && period.from && period.to) {
        qs.set("from", period.from);
        qs.set("to", period.to);
      }
      if (outlet) qs.set("outlet", outlet);
      setData(await api(`/finance-ho/reports/${type}?${qs}`));
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [type, period, outlet]);

  useEffect(() => {
    load();
  }, [load]);

  const range = useMemo(() => (data?.period ? { from: data.period.from, to: data.period.to } : null), [data]);
  const glLink = (accountId) => {
    const qs = new URLSearchParams({ account_id: String(accountId), from: range?.from || "", to: range?.to || "" });
    if (outlet) qs.set("outlet", outlet);
    return `/finance-ho/buku-besar?${qs}`;
  };

  const active = REPORTS.find((r) => r.id === type);
  const outletName = outlet === "PUSAT" ? "Pusat" : outlets.find((o) => String(o.id) === outlet)?.name || "Semua cabang";

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <style>{`@media print { aside, nav, header { display: none !important; } .no-print { display: none !important; } }`}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">Laporan</p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700"><HiOutlineDocumentChartBar className="h-5 w-5" /></div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Laporan keuangan</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">Semua laporan dibaca dari jurnal yang sama. Klik akun di Laba rugi untuk menelusuri ke Buku Besar.</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Cabang:
            <select value={outlet} onChange={(e) => setOutlet(e.target.value)} className={selectCls}>
              <option value="">Semua</option>
              <option value="PUSAT">Pusat</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <nav className="no-print space-y-1">
          {REPORTS.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={r.disabled}
              onClick={() => setType(r.id)}
              className={cn(
                "w-full rounded-xl border px-3 py-2.5 text-left transition",
                type === r.id ? "border-emerald-500 bg-emerald-50/60" : "border-slate-200 bg-white hover:border-emerald-300",
                r.disabled && "cursor-not-allowed opacity-50 hover:border-slate-200"
              )}
            >
              <p className="text-xs font-bold text-slate-800">{r.label}</p>
              <p className="text-[10px] text-slate-400">{r.sub}</p>
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">{active.label}</h2>
              <p className="text-[11px] text-slate-400">
                {outletName} · {type === "balance-sheet" || type === "aging" ? `per ${dmy(type === "aging" ? data?.as_of : data?.as_of)}` : period.custom ? periodText(period) : `${cutoffMonthLabel(month)} (${cutoffRangeLabel(month)})`}
              </p>
            </div>
            <div className="no-print flex items-center gap-2">
              {type === "profit-loss" && (
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Bandingkan periode lalu
                </label>
              )}
              <button type="button" onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
                <HiOutlineArrowPath className={cn("h-4 w-4", loading && "animate-spin")} /> Muat ulang
              </button>
              <button type="button" disabled={!data} onClick={() => downloadCsv(`${type}-${month}.csv`, toRows(type, data, compare))} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40">
                <HiOutlineTableCells className="h-4 w-4" /> Excel
              </button>
              <button type="button" disabled={!data} onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40">
                <HiOutlinePrinter className="h-4 w-4" /> PDF
              </button>
            </div>
          </div>

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
          {loading && !data && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">Menyusun laporan...</div>}
          {data && (
            <div className={cn(loading && "opacity-60 transition")}>
              {type === "profit-loss" && <ProfitLoss d={data} compare={compare} glLink={glLink} />}
              {type === "balance-sheet" && <BalanceSheet d={data} />}
              {type === "trial-balance" && <TrialBalance d={data} />}
              {type === "aging" && <Aging d={data} />}
              {type === "cash-diff" && <CashDiff d={data} />}
              {type === "mdr" && <Mdr d={data} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
