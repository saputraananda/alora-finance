import { createPortal } from "react-dom";
import { COMPANY_NAME } from "../../lib/company";

// ════════════════════════════════════════════════════════════════════════════
// Dokumen cetak laporan (tombol PDF): format laporan akuntansi, terpisah dari tampilan layar.
// Dirender ke <body>; saat mencetak, seluruh aplikasi disembunyikan dan hanya dokumen ini yang tampil.
// ════════════════════════════════════════════════════════════════════════════

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const num = (n) => (Number(n) < 0 ? `(${rp(Math.abs(n))})` : rp(n));
const pct = (n) => (n == null ? "-" : `${String(n).replace(".", ",")}%`);
const longDate = (s) => (s ? `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : "-");
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "-");
const acc = (a) => `${a.code} ${a.name}`;

export const PRINT_TITLE = {
  "profit-loss": "Laporan Laba Rugi",
  "balance-sheet": "Neraca",
  "trial-balance": "Neraca Saldo",
  aging: "Aging Piutang",
  "cash-diff": "Rekap Selisih Kas",
  mdr: "Rekap MDR",
  "cash-flow": "Laporan Arus Kas (Metode Langsung)",
};

// Baris: { kind: "group" | "item" | "total" | "grand" | "note", cells: [label, ...nilai] }
function build(type, d, compare) {
  const R = [];
  const g = (label) => R.push({ kind: "group", cells: [label] });
  const it = (...cells) => R.push({ kind: "item", cells });
  const tot = (...cells) => R.push({ kind: "total", cells });
  const grand = (...cells) => R.push({ kind: "grand", cells });

  if (type === "profit-loss") {
    const c = compare;
    const v = (x, p) => (c ? [num(x), num(p)] : [num(x)]);
    const cols = [{ label: "Keterangan" }, { label: "Nilai", num: true }, ...(c ? [{ label: "Periode lalu", num: true }] : [])];
    g("Pendapatan");
    d.accounts.filter((a) => a.type === "PENDAPATAN").forEach((a) => it(acc(a), ...v(a.total, a.prev_total)));
    tot("Total Pendapatan", ...v(d.totals.revenue.total, d.totals.revenue.prev));
    g("Beban");
    d.accounts.filter((a) => a.type === "BEBAN").forEach((a) => it(acc(a), ...v(a.total, a.prev_total)));
    tot("Total Beban", ...v(d.totals.expense.total, d.totals.expense.prev));
    grand("Laba (Rugi) Bersih", ...v(d.totals.profit.total, d.totals.profit.prev));
    R.push({ kind: "note", cells: ["Margin laba bersih", pct(d.totals.margin.total), ...(c ? [pct(d.totals.margin.prev)] : [])] });
    return { cols, rows: R };
  }

  if (type === "balance-sheet") {
    const cols = [{ label: "Keterangan" }, { label: "Nilai", num: true }];
    g("Aset");
    d.aset.forEach((a) => it(acc(a), num(a.amount)));
    grand("Total Aset", num(d.totals.aset));
    g("Kewajiban");
    d.kewajiban.forEach((a) => it(acc(a), num(a.amount)));
    tot("Total Kewajiban", num(d.totals.kewajiban));
    g("Ekuitas");
    d.ekuitas.forEach((a) => it(acc(a), num(a.amount)));
    it("Laba (rugi) berjalan", num(d.current_profit));
    tot("Total Ekuitas", num(Number(d.totals.ekuitas) + Number(d.current_profit)));
    grand("Total Kewajiban dan Ekuitas", num(d.totals.pasiva));
    const notes = [d.balanced ? null : `Neraca tidak seimbang (selisih Rp ${rp(Math.abs(d.totals.aset - d.totals.pasiva))}).`, d.note].filter(Boolean);
    return { cols, rows: R, notes };
  }

  if (type === "trial-balance") {
    const cols = [{ label: "Akun" }, ...["Awal Debit", "Awal Kredit", "Mutasi Debit", "Mutasi Kredit", "Akhir Debit", "Akhir Kredit"].map((label) => ({ label, num: true }))];
    const z = (x) => (x ? rp(x) : "-");
    d.accounts.forEach((a) => R.push({ kind: "row", cells: [acc(a), z(a.opening.d), z(a.opening.k), z(a.debit), z(a.credit), z(a.closing.d), z(a.closing.k)] }));
    const t = d.totals;
    grand("Total", rp(t.opening_d), rp(t.opening_k), rp(t.debit), rp(t.credit), rp(t.closing_d), rp(t.closing_k));
    return { cols, rows: R, compact: true };
  }

  if (type === "aging") {
    const cols = [{ label: "Pelanggan" }, ...d.buckets.map((b) => ({ label: b.label, num: true })), { label: "Total", num: true }, { label: "Tertua", num: true }];
    d.top_customers.forEach((c) => R.push({ kind: "row", cells: [c.customer, ...c.buckets.map((v) => (v ? rp(v) : "-")), rp(c.amount), `${rp(c.oldest)} hari`] }));
    grand(`Total semua piutang (${rp(d.count)} nota)`, ...d.buckets.map((b) => rp(b.amount)), rp(d.total), "");
    return { cols, rows: R, compact: true, notes: ["Rincian menampilkan 50 pelanggan dengan sisa terbesar; total mencakup semua nota. Umur dihitung sejak nota dibuat. Dibaca dari POS."] };
  }

  if (type === "cash-diff") {
    const cols = [{ label: "Tanggal" }, { label: "Cabang" }, { label: "Seharusnya", num: true }, { label: "Disetor", num: true }, { label: "Selisih", num: true }, { label: "Penjelasan" }];
    d.rows.forEach((r) => R.push({ kind: "row", cells: [dmy(r.date), r.outlet_name, rp(r.pos), rp(r.deposited), num(r.diff), r.explanation || "-"] }));
    tot("Kas kurang", "", "", "", num(d.totals.shortage), "");
    tot("Kas lebih", "", "", "", num(d.totals.surplus), "");
    grand(`Selisih bersih (${rp(d.totals.events)} kejadian)`, "", "", "", num(d.totals.net), "");
    return { cols, rows: R, compact: true, notes: d.rows.length ? [] : ["Tidak ada selisih kas pada hari yang sudah dikunci."] };
  }

  if (type === "mdr") {
    const cols = [{ label: "Cabang" }, { label: "Penyedia" }, { label: "Bruto", num: true }, { label: "MDR", num: true }, { label: "Neto", num: true }, { label: "Tarif efektif", num: true }];
    d.rows.forEach((r) => R.push({ kind: "row", cells: [r.outlet_name, r.provider, rp(r.gross), rp(r.mdr), rp(r.net), pct(r.rate)] }));
    grand("Total", "", rp(d.totals.gross), rp(d.totals.mdr), rp(d.totals.net), pct(d.totals.rate));
    return { cols, rows: R, compact: true };
  }

  if (type === "cash-flow") {
    const cols = [{ label: "Keterangan" }, { label: "Nilai", num: true }, ...(compare ? [{ label: "Periode lalu", num: true }] : [])];
    if (!d.mapped) return { cols, rows: [], notes: ["Belum ada akun kas atau bank."] };
    const v = (x, p) => (compare ? [num(x), num(p)] : [num(x)]);
    d.sections.forEach((s) => {
      g(`Aktivitas ${s.short}`);
      s.rows.forEach((r) => it(acc(r), ...v(r.net, r.prev_net)));
      if (!s.rows.length) it("Tidak ada", ...v(0, 0));
      tot(`Kas bersih dari aktivitas ${s.short.toLowerCase()}`, ...v(s.total.net, s.total.prev));
    });
    if (d.transfer.in || d.transfer.out || d.transfer.prev) {
      g("Pindahan antar kas/bank");
      it("Dari / ke cabang lain atau Pusat", ...v(d.transfer.net, d.transfer.prev));
      tot("Total pindahan", ...v(d.transfer.net, d.transfer.prev));
    }
    tot("Kenaikan (penurunan) kas bersih", ...v(d.net, d.prev.net));
    R.push({ kind: "plain", cells: ["Kas & bank di awal periode", ...v(d.opening, d.prev.opening)] });
    grand("Kas & bank di akhir periode", ...v(d.closing, d.prev.closing));
    return { cols, rows: R, notes: [`Kas & bank: ${d.cash_accounts.map(acc).join(", ")}.`] };
  }
  return { cols: [], rows: [] };
}

const CSS = `
@media screen { .alfi-print-doc { display: none; } }
@media print {
  @page { size: A4 portrait; margin: 14mm 12mm 16mm 12mm;
    @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); font: 8pt Arial, sans-serif; color: #555; } }
  html, body { background: #fff !important; }
  body > *:not(.alfi-print-doc) { display: none !important; }
  .alfi-print-doc { display: block; color: #000; font: 9.5pt/1.35 Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
.alfi-print-doc .pd-head { text-align: center; margin-bottom: 4mm; }
.alfi-print-doc .pd-company { font-size: 10pt; letter-spacing: .3px; }
.alfi-print-doc .pd-title { font-size: 15pt; font-weight: 700; color: #064e3b; margin: 1mm 0; }
.alfi-print-doc .pd-period { font-size: 9.5pt; }
.alfi-print-doc .pd-meta { text-align: right; font-size: 8pt; font-style: italic; margin-bottom: 2mm; }
.alfi-print-doc table { width: 100%; border-collapse: collapse; }
.alfi-print-doc thead { display: table-header-group; }
.alfi-print-doc tr { page-break-inside: avoid; }
.alfi-print-doc th { font-weight: 700; color: #064e3b; text-align: left; padding: 1.2mm 1.5mm; border-bottom: 1px solid #000; }
.alfi-print-doc th.n, .alfi-print-doc td.n { text-align: right; white-space: nowrap; }
.alfi-print-doc td { padding: .9mm 1.5mm; vertical-align: top; }
.alfi-print-doc .compact td, .alfi-print-doc .compact th { font-size: 8.5pt; padding: .7mm 1.2mm; }
.alfi-print-doc tr.group td { font-weight: 700; padding-top: 2.5mm; }
.alfi-print-doc tr.item td:first-child { padding-left: 6mm; }
.alfi-print-doc tr.total td, .alfi-print-doc tr.plain td { font-weight: 700; }
.alfi-print-doc tr.total td.n { border-top: 1px solid #000; }
.alfi-print-doc tr.grand td { font-weight: 700; padding-top: 1.5mm; }
.alfi-print-doc tr.grand td.n { border-top: 1px solid #000; border-bottom: 3px double #000; }
.alfi-print-doc tr.row td { border-bottom: .5px solid #ddd; }
.alfi-print-doc tr.note td { font-style: italic; color: #333; }
.alfi-print-doc .pd-notes { margin-top: 4mm; font-size: 8pt; color: #333; }
.alfi-print-doc .pd-foot { margin-top: 6mm; font-size: 7.5pt; color: #555; border-top: .5px solid #999; padding-top: 1.5mm; }
`;

export default function PrintReport({ type, data, compare, outletName, from, to, prevFrom, prevTo }) {
  const pointInTime = type === "balance-sheet" || type === "aging";
  const { cols, rows, notes = [], compact } = build(type, data, compare);
  const now = new Date();
  const printed = `${dmy(now.toISOString().slice(0, 10))} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return createPortal(
    <div className="alfi-print-doc">
      <style>{CSS}</style>
      <div className="pd-head">
        <div className="pd-company">{COMPANY_NAME}</div>
        <div className="pd-title">{PRINT_TITLE[type]}</div>
        <div className="pd-period">{pointInTime ? `Per ${longDate(to)}` : `Periode ${longDate(from)} s/d ${longDate(to)}`}</div>
      </div>
      <div className="pd-meta">
        Cabang : {outletName}
        {compare && (type === "profit-loss" || type === "cash-flow") && prevFrom ? ` · Periode lalu : ${longDate(prevFrom)} s/d ${longDate(prevTo)}` : ""}
      </div>
      <table className={compact ? "compact" : ""}>
        <thead>
          <tr>{cols.map((c, i) => <th key={i} className={c.num ? "n" : ""}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.kind}>
              {r.kind === "group"
                ? <td colSpan={cols.length}>{r.cells[0]}</td>
                : cols.map((c, k) => <td key={k} className={c.num ? "n" : ""}>{r.cells[k] ?? ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {notes.length > 0 && <div className="pd-notes">{notes.map((n, i) => <p key={i}>{n}</p>)}</div>}
      <div className="pd-foot">Dicetak {printed} · alfi HO Finance · Angka dalam Rupiah; angka dalam kurung = negatif.</div>
    </div>,
    document.body
  );
}
