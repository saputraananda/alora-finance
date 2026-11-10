import { pool, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { computeAging } from "../../utils/aging.js";
import { cutoffRange, currentCutoffMonth, shiftMonth } from "../dashboard/dashboard.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// LAPORAN KEUANGAN — semua dibaca dari jurnal (status POSTED + REVERSED, agar
// jurnal asal dan jurnal baliknya saling meniadakan).
// Periode mengikuti cutoff Waschen (26 bulan lalu → 25 bulan berjalan).
// ════════════════════════════════════════════════════════════════════════════

const LIVE = "je.status IN ('POSTED','REVERSED')";
const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

function parsePeriod(q) {
  const cur = currentCutoffMonth();
  const year = parseInt(q.year, 10) || cur.year;
  const month = parseInt(q.month, 10) || cur.month;
  // Tanggal kustom (StrukturCode §12) menimpa periode cutoff bila diisi lengkap
  const isD = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  const custom = isD(q.from) && isD(q.to) && q.from <= q.to;
  const { start, end } = custom ? { start: q.from, end: q.to } : cutoffRange(year, month);
  const outletId = q.outlet === "PUSAT" ? "PUSAT" : q.outlet ? Number(q.outlet) : null;
  return { year, month, start, end, outletId, custom };
}

// fragmen filter cabang pada baris jurnal (alias jl)
function outletClause(outletId) {
  if (outletId === "PUSAT") return { sql: " AND jl.outlet_id IS NULL", params: [] };
  if (outletId) return { sql: " AND jl.outlet_id = ?", params: [outletId] };
  return { sql: "", params: [] };
}

const fail = (res, tag, err) => {
  console.error(`[${tag}]`, err);
  return res.status(500).json({ message: "Gagal menyusun laporan", error: err.message });
};

// ── Laba rugi (per cabang + total, bandingkan periode lalu) ─────────────
export async function getProfitLoss(req, res) {
  try {
    const p = parsePeriod(req.query);
    const oc = outletClause(p.outletId);
    const sql = `
      SELECT a.id, a.code, a.name, a.type, jl.outlet_id,
             SUM(CASE WHEN a.type = 'PENDAPATAN' THEN jl.credit - jl.debit ELSE jl.debit - jl.credit END) AS amount
      FROM tr_journal_lines jl
      JOIN tr_journal_entries je ON je.id = jl.entry_id
      JOIN mst_coa a ON a.id = jl.account_id
      WHERE ${LIVE} AND a.type IN ('PENDAPATAN','BEBAN') AND je.entry_date BETWEEN ? AND ?${oc.sql}
      GROUP BY a.id, a.code, a.name, a.type, jl.outlet_id`;
    const [rows] = await pool.query(sql, [p.start, p.end, ...oc.params]);

    // Pembanding: periode cutoff sebelumnya, atau rentang sepanjang sama tepat sebelum tanggal kustom
    let prev;
    if (p.custom) {
      const days = Math.round((Date.parse(`${p.end}T00:00:00Z`) - Date.parse(`${p.start}T00:00:00Z`)) / 86400000) + 1;
      const e = new Date(`${p.start}T00:00:00Z`);
      e.setUTCDate(e.getUTCDate() - 1);
      const st = new Date(e);
      st.setUTCDate(st.getUTCDate() - (days - 1));
      prev = { start: st.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
    } else {
      const [py, pm] = shiftMonth(p.year, p.month, -1);
      prev = cutoffRange(py, pm);
    }
    const [prevRows] = await pool.query(sql, [prev.start, prev.end, ...oc.params]);
    const prevBy = new Map();
    prevRows.forEach((r) => prevBy.set(Number(r.id), toFixed2((prevBy.get(Number(r.id)) || 0) + Number(r.amount))));

    const outlets = await getOutlets();
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));
    const colKeys = [...new Set(rows.map((r) => (r.outlet_id ? Number(r.outlet_id) : 0)))].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
    const columns = colKeys.map((k) => ({ key: k, name: k === 0 ? "Pusat" : nameOf.get(k) || `Outlet #${k}` }));

    const accMap = new Map();
    rows.forEach((r) => {
      const id = Number(r.id);
      if (!accMap.has(id)) accMap.set(id, { id, code: r.code, name: r.name, type: r.type, byOutlet: {}, total: 0 });
      const a = accMap.get(id);
      const k = r.outlet_id ? Number(r.outlet_id) : 0;
      a.byOutlet[k] = toFixed2((a.byOutlet[k] || 0) + Number(r.amount));
      a.total = toFixed2(a.total + Number(r.amount));
    });
    // akun yang hanya ada di periode lalu tetap ditampilkan (nilai 0 periode ini)
    prevRows.forEach((r) => {
      const id = Number(r.id);
      if (!accMap.has(id)) accMap.set(id, { id, code: r.code, name: r.name, type: r.type, byOutlet: {}, total: 0 });
    });
    const accounts = [...accMap.values()]
      .map((a) => ({ ...a, prev_total: prevBy.get(a.id) || 0 }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const sumBy = (type, key) =>
      toFixed2(accounts.filter((a) => a.type === type).reduce((s, a) => s + (key === "total" ? a.total : key === "prev" ? a.prev_total : a.byOutlet[key] || 0), 0));
    const totals = { revenue: {}, expense: {}, profit: {}, margin: {} };
    [...colKeys, "total", "prev"].forEach((k) => {
      totals.revenue[k] = sumBy("PENDAPATAN", k);
      totals.expense[k] = sumBy("BEBAN", k);
      totals.profit[k] = toFixed2(totals.revenue[k] - totals.expense[k]);
      totals.margin[k] = totals.revenue[k] > 0 ? toFixed2((totals.profit[k] / totals.revenue[k]) * 100) : null;
    });

    return res.json({ period: { year: p.year, month: p.month, from: p.start, to: p.end, prev_from: prev.start, prev_to: prev.end }, columns, accounts, totals });
  } catch (err) {
    return fail(res, "getProfitLoss", err);
  }
}

// ── Neraca saldo ────────────────────────────────────────────────────────
export async function getTrialBalance(req, res) {
  try {
    const p = parsePeriod(req.query);
    const oc = outletClause(p.outletId);
    const [rows] = await pool.query(
      `SELECT a.id, a.code, a.name, a.type,
              SUM(CASE WHEN je.entry_date < ? THEN jl.debit - jl.credit ELSE 0 END) AS opening,
              SUM(CASE WHEN je.entry_date BETWEEN ? AND ? THEN jl.debit ELSE 0 END) AS debit,
              SUM(CASE WHEN je.entry_date BETWEEN ? AND ? THEN jl.credit ELSE 0 END) AS credit
       FROM tr_journal_lines jl
       JOIN tr_journal_entries je ON je.id = jl.entry_id
       JOIN mst_coa a ON a.id = jl.account_id
       WHERE ${LIVE} AND je.entry_date <= ?${oc.sql}
       GROUP BY a.id, a.code, a.name, a.type
       ORDER BY a.code`,
      [p.start, p.start, p.end, p.start, p.end, p.end, ...oc.params]
    );
    const split = (net) => ({ d: net > 0 ? toFixed2(net) : 0, k: net < 0 ? toFixed2(-net) : 0 });
    const data = rows
      .map((r) => {
        const opening = toFixed2(r.opening);
        const debit = toFixed2(r.debit);
        const credit = toFixed2(r.credit);
        const closing = toFixed2(opening + debit - credit);
        return { id: r.id, code: r.code, name: r.name, type: r.type, opening: split(opening), debit, credit, closing: split(closing) };
      })
      .filter((r) => r.opening.d || r.opening.k || r.debit || r.credit || r.closing.d || r.closing.k);
    const sum = (f) => toFixed2(data.reduce((s, r) => s + f(r), 0));
    return res.json({
      period: { from: p.start, to: p.end },
      accounts: data,
      totals: {
        opening_d: sum((r) => r.opening.d), opening_k: sum((r) => r.opening.k),
        debit: sum((r) => r.debit), credit: sum((r) => r.credit),
        closing_d: sum((r) => r.closing.d), closing_k: sum((r) => r.closing.k),
      },
    });
  } catch (err) {
    return fail(res, "getTrialBalance", err);
  }
}

// ── Neraca (posisi keuangan per akhir periode) ──────────────────────────
export async function getBalanceSheet(req, res) {
  try {
    const p = parsePeriod(req.query);
    const oc = outletClause(p.outletId);
    const [rows] = await pool.query(
      `SELECT a.id, a.code, a.name, a.type, SUM(jl.debit - jl.credit) AS net
       FROM tr_journal_lines jl
       JOIN tr_journal_entries je ON je.id = jl.entry_id
       JOIN mst_coa a ON a.id = jl.account_id
       WHERE ${LIVE} AND je.entry_date <= ?${oc.sql}
       GROUP BY a.id, a.code, a.name, a.type
       ORDER BY a.code`,
      [p.end, ...oc.params]
    );
    const bal = (type) =>
      rows
        .filter((r) => r.type === type)
        .map((r) => ({ id: r.id, code: r.code, name: r.name, amount: toFixed2(type === "ASET" ? r.net : -r.net) }))
        .filter((r) => r.amount !== 0);
    const aset = bal("ASET");
    const kewajiban = bal("KEWAJIBAN");
    const ekuitas = bal("EKUITAS");
    // laba (rugi) berjalan = semua pendapatan − beban sampai akhir periode
    const profit = toFixed2(
      rows.filter((r) => r.type === "PENDAPATAN").reduce((s, r) => s - Number(r.net), 0) -
        rows.filter((r) => r.type === "BEBAN").reduce((s, r) => s + Number(r.net), 0)
    );
    const total = (list) => toFixed2(list.reduce((s, r) => s + r.amount, 0));
    const totalAset = total(aset);
    const totalPasiva = toFixed2(total(kewajiban) + total(ekuitas) + profit);
    return res.json({
      as_of: p.end,
      aset, kewajiban, ekuitas,
      current_profit: profit,
      totals: { aset: totalAset, kewajiban: total(kewajiban), ekuitas: total(ekuitas), pasiva: totalPasiva },
      balanced: Math.abs(totalAset - totalPasiva) < 1,
      note: p.outletId ? "Neraca per cabang bisa tidak seimbang karena jurnal manual boleh memuat beberapa cabang." : null,
    });
  } catch (err) {
    return fail(res, "getBalanceSheet", err);
  }
}

// ── Rekap selisih kas (dari rekonsiliasi harian yang sudah dikunci) ─────
export async function getCashDiffReport(req, res) {
  try {
    const p = parsePeriod(req.query);
    const [rows] = await pool.query(
      `SELECT outlet_id, DATE_FORMAT(rec_date,'%Y-%m-%d') AS d, explanation, treatment, snapshot
       FROM tr_recon_daily WHERE status = 'APPROVED' AND rec_date BETWEEN ? AND ?${p.outletId && p.outletId !== "PUSAT" ? " AND outlet_id = ?" : ""}
       ORDER BY rec_date, outlet_id`,
      p.outletId && p.outletId !== "PUSAT" ? [p.start, p.end, p.outletId] : [p.start, p.end]
    );
    const outlets = await getOutlets();
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));
    const data = rows
      .map((r) => {
        let t = null;
        try {
          const snap = typeof r.snapshot === "string" ? JSON.parse(r.snapshot) : r.snapshot;
          t = snap?.methods?.find((m) => m.key === "TUNAI") || null;
        } catch {
          t = null;
        }
        return {
          date: r.d,
          outlet_name: nameOf.get(Number(r.outlet_id)) || `Outlet #${r.outlet_id}`,
          pos: toFixed2(t?.pos || 0),
          deposited: toFixed2(t?.bank || 0),
          diff: toFixed2(t?.diff || 0),
          explanation: r.explanation || "",
          treatment: r.treatment,
        };
      })
      .filter((r) => Math.abs(r.diff) > 0);
    return res.json({
      period: { from: p.start, to: p.end },
      rows: data,
      totals: {
        events: data.length,
        shortage: toFixed2(data.filter((r) => r.diff < 0).reduce((s, r) => s + r.diff, 0)),
        surplus: toFixed2(data.filter((r) => r.diff > 0).reduce((s, r) => s + r.diff, 0)),
        net: toFixed2(data.reduce((s, r) => s + r.diff, 0)),
      },
    });
  } catch (err) {
    return fail(res, "getCashDiffReport", err);
  }
}

// ── Rekap MDR (dari settlement QRIS/EDC) ────────────────────────────────
export async function getMdrReport(req, res) {
  try {
    const p = parsePeriod(req.query);
    const useOutlet = p.outletId && p.outletId !== "PUSAT";
    const [rows] = await pool.query(
      `SELECT outlet_id, provider, COUNT(*) AS n, SUM(gross) AS gross, SUM(mdr) AS mdr, SUM(net) AS net
       FROM tr_settlement WHERE trx_date BETWEEN ? AND ?${useOutlet ? " AND outlet_id = ?" : ""}
       GROUP BY outlet_id, provider ORDER BY outlet_id, provider`,
      useOutlet ? [p.start, p.end, p.outletId] : [p.start, p.end]
    );
    const outlets = await getOutlets();
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));
    const data = rows.map((r) => ({
      outlet_name: nameOf.get(Number(r.outlet_id)) || `Outlet #${r.outlet_id}`,
      provider: r.provider,
      count: Number(r.n),
      gross: toFixed2(r.gross),
      mdr: toFixed2(r.mdr),
      net: toFixed2(r.net),
      rate: Number(r.gross) > 0 ? toFixed2((Number(r.mdr) / Number(r.gross)) * 100) : 0,
    }));
    const gross = toFixed2(data.reduce((s, r) => s + r.gross, 0));
    const mdr = toFixed2(data.reduce((s, r) => s + r.mdr, 0));
    return res.json({
      period: { from: p.start, to: p.end },
      rows: data,
      totals: { gross, mdr, net: toFixed2(data.reduce((s, r) => s + r.net, 0)), rate: gross > 0 ? toFixed2((mdr / gross) * 100) : 0 },
    });
  } catch (err) {
    return fail(res, "getMdrReport", err);
  }
}

// ── Aging piutang ritel ─────────────────────────────────────────────────
export async function getAgingReport(req, res) {
  try {
    const outletId = req.query.outlet && req.query.outlet !== "PUSAT" ? Number(req.query.outlet) : null;
    return res.json(await computeAging(outletId, todayWib(), 50));
  } catch (err) {
    return fail(res, "getAgingReport", err);
  }
}
