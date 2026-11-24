import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineDocumentChartBar, HiOutlinePrinter, HiOutlineTableCells } from "react-icons/hi2";
import { api } from "../../lib/api";
import { currentCutoffKey, cutoffMonthLabel, cutoffRangeLabel } from "../../lib/cutoff";
import PeriodFilter, { periodText } from "../../components/ui/PeriodFilter";
import PageHeader, { FieldSelect, PrimaryButton, RefreshButton } from "../../components/ui/PageHeader";
import PrintReport, { PRINT_TITLE } from "./PrintReport";

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
  { id: "mdr", label: "Rekap MDR", sub: "Dari selisih QRIS/EDC yang dijelaskan" },
  { id: "cash-flow", label: "Arus kas", sub: "Uang masuk & keluar kas/bank" },
  { id: "ap-aging", label: "Aging hutang", sub: "Menunggu modul Pembelian", disabled: true },
];

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
          {d.rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Belum ada selisih QRIS/EDC yang dijelaskan sebagai MDR pada periode ini.</td></tr>}
          {d.rows.map((r, i) => (
            <tr key={i}><td className="px-3 py-2 font-semibold">{r.outlet_name}</td><td className="px-3 py-2">{r.provider}</td><td className="px-3 py-2 text-right tabular-nums">{r.count}</td><td className="px-3 py-2 text-right tabular-nums">{rp(r.gross)}</td><td className="px-3 py-2 text-right tabular-nums">{rp(r.mdr)}</td><td className="px-3 py-2 text-right tabular-nums">{rp(r.net)}</td><td className="px-3 py-2 text-right tabular-nums">{pct(r.rate)}</td></tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-extrabold"><tr><td className="px-3 py-2.5" colSpan={3}>Total</td><td className="px-3 py-2.5 text-right tabular-nums">{rp(d.totals.gross)}</td><td className="px-3 py-2.5 text-right tabular-nums">{rp(d.totals.mdr)}</td><td className="px-3 py-2.5 text-right tabular-nums">{rp(d.totals.net)}</td><td className="px-3 py-2.5 text-right tabular-nums">{pct(d.totals.rate)}</td></tr></tfoot>
      </table>
    </div>
  );
}

// ═════════════════════════ ARUS KAS ══════════════════════════════════════
function CashFlow({ d, compare, glLink }) {
  if (!d.mapped) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        Belum ada akun kas atau bank. Atur akun kas cabang dan rekening bank di{" "}
        <Link to="/finance-ho/pengaturan/rekening-bank" className="font-bold underline">Pengaturan</Link>, atau pilih kelompok "Kas &amp; bank" pada akun di{" "}
        <Link to="/finance-ho/coa" className="font-bold underline">Master COA</Link>.
      </div>
    );
  }
  const totalIn = toNum(d.sections.reduce((s, x) => s + x.total.in, 0) + d.transfer.in);
  const totalOut = toNum(d.sections.reduce((s, x) => s + x.total.out, 0) + d.transfer.out);
  const cols = compare ? 5 : 4;
  const money = (v) => (v ? rp(v) : "-");
  const strong = (label, v, prev, cls = "") => (
    <tr className={cn("font-extrabold", cls)}>
      <td className="px-3 py-2.5" colSpan={3}>{label}</td>
      <td className={cn("px-3 py-2.5 text-right tabular-nums", v < 0 && "text-rose-600")}>{rpMinus(v)}</td>
      {compare && <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{rpMinus(prev)}</td>}
    </tr>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Saldo awal", d.opening], ["Kas masuk", totalIn], ["Kas keluar", totalOut], ["Saldo akhir", d.closing]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p>
            <p className="mt-1 text-lg font-extrabold">{rpMinus(v)}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className={th}>Rp</th>
              <th className={cn(th, "text-right")}>Masuk</th>
              <th className={cn(th, "text-right")}>Keluar</th>
              <th className={cn(th, "text-right")}>Bersih</th>
              {compare && <th className={cn(th, "text-right")}>Periode lalu</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {strong("Saldo kas & bank awal periode", d.opening, d.prev.opening, "bg-slate-50/60")}
            {d.sections.map((s) => (
              <FragmentRows key={s.key}>
                <tr className="bg-slate-50"><td colSpan={cols} className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{s.label}</td></tr>
                {s.rows.length === 0 && <tr><td colSpan={cols} className="px-3 py-2.5 text-slate-400">Tidak ada.</td></tr>}
                {s.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2">
                      <Link to={glLink(r.id)} className="hover:text-emerald-700 hover:underline" title="Telusuri di Buku Besar">
                        <span className="font-mono text-slate-400">{r.code}</span> <span className="font-semibold text-slate-800">{r.name}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{money(r.in)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{money(r.out)}</td>
                    <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", r.net < 0 && "text-rose-600")}>{rpMinus(r.net)}</td>
                    {compare && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.prev_net ? rpMinus(r.prev_net) : "-"}</td>}
                  </tr>
                ))}
                <tr className="border-t border-slate-200 font-bold">
                  <td className="px-3 py-2">Kas bersih dari {s.short.toLowerCase()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(s.total.in)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(s.total.out)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", s.total.net < 0 && "text-rose-600")}>{rpMinus(s.total.net)}</td>
                  {compare && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{rpMinus(s.total.prev)}</td>}
                </tr>
              </FragmentRows>
            ))}
            {(d.transfer.in || d.transfer.out || d.transfer.prev) ? (
              <>
                <tr className="bg-slate-50"><td colSpan={cols} className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Pindahan antar kas/bank</td></tr>
                <tr>
                  <td className="px-3 py-2 text-slate-700">Dari / ke cabang lain atau Pusat <span className="text-slate-400">(di filter Semua cabang saling meniadakan)</span></td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{money(d.transfer.in)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{money(d.transfer.out)}</td>
                  <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", d.transfer.net < 0 && "text-rose-600")}>{rpMinus(d.transfer.net)}</td>
                  {compare && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{rpMinus(d.transfer.prev)}</td>}
                </tr>
              </>
            ) : null}
            {strong("Kenaikan (penurunan) kas bersih", d.net, d.prev.net, "border-t-2 border-slate-300")}
            {strong("Saldo kas & bank akhir periode", d.closing, d.prev.closing, "bg-emerald-50/50")}
          </tbody>
        </table>
      </div>

      <p className={cn("rounded-xl border p-3 text-xs font-semibold", Math.abs(d.check_diff) < 1 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
        {Math.abs(d.check_diff) < 1
          ? `Saldo akhir sama dengan saldo Kas + Bank di Neraca per ${dmy(d.period.to)}.`
          : `Saldo akhir berbeda Rp ${rp(Math.abs(d.check_diff))} dari saldo awal + arus kas. Laporkan ke tim IT.`}
      </p>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Dihitung sebagai kas &amp; bank:{" "}
        {d.cash_accounts.map((a, i) => (
          <span key={a.id}>
            {i > 0 && ", "}
            <span className="font-semibold text-slate-700">{a.code} {a.name}</span> <span className="text-slate-400">({a.reason})</span>
          </span>
        ))}
        . Piutang QRIS/EDC baru dihitung saat uangnya masuk ke rekening. Ubah kelompok akun di{" "}
        <Link to="/finance-ho/coa" className="font-bold text-emerald-700 hover:underline">Master COA</Link>.
      </p>
    </div>
  );
}
const FragmentRows = ({ children }) => <>{children}</>;

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
  if (type === "cash-flow") {
    if (!d.mapped) return [["Belum ada akun kas atau bank"]];
    const head = ["Kelompok", "Akun", "Masuk", "Keluar", "Bersih", ...(compare ? ["Periode lalu"] : [])];
    const out = [head, ["", "Saldo kas & bank awal periode", "", "", d.opening, ...(compare ? [d.prev.opening] : [])]];
    d.sections.forEach((s) => {
      s.rows.forEach((r) => out.push([s.short, `${r.code} ${r.name}`, r.in, r.out, r.net, ...(compare ? [r.prev_net] : [])]));
      out.push([s.short, `Kas bersih dari ${s.short.toLowerCase()}`, s.total.in, s.total.out, s.total.net, ...(compare ? [s.total.prev] : [])]);
    });
    if (d.transfer.in || d.transfer.out) out.push(["Pindahan", "Dari / ke cabang lain atau Pusat", d.transfer.in, d.transfer.out, d.transfer.net, ...(compare ? [d.transfer.prev] : [])]);
    out.push(["", "Kenaikan (penurunan) kas bersih", "", "", d.net, ...(compare ? [d.prev.net] : [])]);
    out.push(["", "Saldo kas & bank akhir periode", "", "", d.closing, ...(compare ? [d.prev.closing] : [])]);
    return out;
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
  // Jenis laporan milik `data`. Tanpa ini, saat jenis diganti data lama (bentuk laporan lain) sempat
  // dirender oleh komponen laporan baru dan membuat halaman putih.
  const [dataType, setDataType] = useState(null);
  const seq = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Laporan Keuangan | HO Finance";
    api("/finance-ho/journals/meta").then((r) => setOutlets(r.outlets || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const reqType = type;
    const my = ++seq.current;
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
      const res = await api(`/finance-ho/reports/${reqType}?${qs}`);
      if (my !== seq.current) return; // jawaban lama, sudah ada permintaan yang lebih baru
      setData(res);
      setDataType(reqType);
    } catch (e) {
      if (my !== seq.current) return;
      setError(e.message);
      setData(null);
      setDataType(null);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [type, period, outlet]);

  useEffect(() => {
    load();
  }, [load]);

  const ready = !!data && dataType === type;

  const range = useMemo(() => (data?.period ? { from: data.period.from, to: data.period.to } : null), [data]);
  const glLink = (accountId) => {
    const qs = new URLSearchParams({ account_id: String(accountId), from: range?.from || "", to: range?.to || "" });
    if (outlet) qs.set("outlet", outlet);
    return `/finance-ho/general-ledger?tab=ledger&${qs}`;
  };

  const active = REPORTS.find((r) => r.id === type);
  const outletName = outlet === "PUSAT" ? "Pusat" : outlets.find((o) => String(o.id) === outlet)?.name || "Semua cabang";

  // PDF: dokumen cetak terpisah (PrintReport), lalu dialog cetak browser
  const [printing, setPrinting] = useState(false);
  const printFrom = data?.period?.from || range?.from;
  const printTo = type === "balance-sheet" || type === "aging" ? data?.as_of : data?.period?.to;
  useEffect(() => {
    if (!printing) return undefined;
    const prevTitle = document.title;
    // judul dokumen = nama file PDF bawaan
    document.title = `${PRINT_TITLE[type]} - ${outletName} - ${printTo || ""}`;
    const done = () => {
      document.title = prevTitle;
      setPrinting(false);
    };
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 80);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printing]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {printing && ready && (
        <PrintReport type={type} data={data} compare={compare} outletName={outletName} from={printFrom} to={printTo} prevFrom={data?.period?.prev_from} prevTo={data?.period?.prev_to} />
      )}

      <div className="no-print">
        <PageHeader crumb="Laporan" icon={HiOutlineDocumentChartBar} tone="bg-cyan-50 text-cyan-700" title="Laporan keuangan" subtitle="Semua laporan dibaca dari jurnal yang sama. Klik akun di Laba rugi untuk menelusuri ke Buku Besar.">
          <FieldSelect label="Cabang" value={outlet} onChange={setOutlet}>
            <option value="">Semua</option>
            <option value="PUSAT">Pusat</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </FieldSelect>
          <PeriodFilter value={period} onChange={setPeriod} />
          <button type="button" disabled={!ready} onClick={() => downloadCsv(`${type}-${month}.csv`, toRows(type, data, compare))} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40">
            <HiOutlineTableCells className="h-4 w-4" /> Excel
          </button>
          <PrimaryButton icon={HiOutlinePrinter} disabled={!ready || printing} onClick={() => setPrinting(true)}>PDF</PrimaryButton>
          <RefreshButton onClick={load} spinning={loading} />
        </PageHeader>
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
                {outletName} · {type === "balance-sheet" || type === "aging" ? `per ${dmy(ready ? data.as_of : null)}` : period.custom ? periodText(period) : `${cutoffMonthLabel(month)} (${cutoffRangeLabel(month)})`}
              </p>
            </div>
            <div className="no-print flex items-center gap-2">
              {(type === "profit-loss" || type === "cash-flow") && (
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Bandingkan periode lalu
                </label>
              )}
            </div>
          </div>

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
          {loading && !ready && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">Menyusun laporan...</div>}
          {ready && (
            <div className={cn(loading && "opacity-60 transition")}>
              {type === "profit-loss" && <ProfitLoss d={data} compare={compare} glLink={glLink} />}
              {type === "balance-sheet" && <BalanceSheet d={data} />}
              {type === "trial-balance" && <TrialBalance d={data} />}
              {type === "aging" && <Aging d={data} />}
              {type === "cash-diff" && <CashDiff d={data} />}
              {type === "mdr" && <Mdr d={data} />}
              {type === "cash-flow" && <CashFlow d={data} compare={compare} glLink={glLink} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
