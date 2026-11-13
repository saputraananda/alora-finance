import { pool, mainPool, myWaschenPool, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { resolveRange } from "./dashboard.controller.js";
import { COND_ANTREAN, COND_BAYAR, COND_KREDIT, AMOUNT_SQL, PAID_SQL, FROM_SQL } from "../purchasing/pengajuan.controller.js";
import { computeDay, loadBatches, statusOf } from "../pos/pos.controller.js";
import { IS_CLEANOX, UNIT_SHARE_JOIN, parseUnit, unitShareExpr } from "../../utils/unit.js";

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD — DATA WIDGET (satu endpoint per sumber data)
//  • sales          : penjualan POS per unit (Waschen / Cleanox) per hari
//  • payment-methods: pembayaran POS per metode bayar
//  • cashflow       : uang masuk/keluar rekening bank dari jurnal
//  • purchasing     : ringkasan Biaya & Pembayaran (data Pengajuan SuperApp)
// ════════════════════════════════════════════════════════════════════════════

const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const outletParam = (req) => (req.query.outlet ? Number(req.query.outlet) : null);
const fail = (res, tag, err, msg) => {
  console.error(`[dashboard.${tag}]`, err);
  return res.status(500).json({ message: msg, error: err.message });
};

const MAX_DAYS = 93;

const SYNC_LABEL = { DIPOSTING: "Diposting", VALID: "Siap posting", GAGAL: "Gagal validasi", BERUBAH: "Berubah", TERKUNCI: "Terkunci", DIBALIK: "Dibalik" };
const SYNC_WORST_FIRST = ["GAGAL", "BERUBAH", "TERKUNCI", "DIBALIK", "VALID", "DIPOSTING"];

// GET /dashboard/pos-sync?from&to&unit&outlet — status posting POS hari lengkap terakhir dalam rentang
export async function getPosSync(req, res) {
  try {
    const range = resolveRange(req.query);
    const unit = parseUnit(req.query);
    const outletId = outletParam(req);
    const yesterday = addDays(todayWib(), -1);
    const date = range.to < yesterday ? range.to : yesterday;

    const [rows, batches] = await Promise.all([computeDay(date), loadBatches(date)]);
    const [clxRows] = await myWaschenPool.query(
      `SELECT t.outlet_id, COALESCE(SUM(d.subtotal), 0) AS amount
       FROM tr_transaction_detail d JOIN tr_transaction t ON t.id = d.transaction_id
       WHERE t.order_date >= ? AND t.order_date < DATE_ADD(?, INTERVAL 1 DAY) AND t.is_delete_requested = 0 AND ${IS_CLEANOX}
       GROUP BY t.outlet_id`,
      [date, date]
    );
    const clx = new Map(clxRows.map((r) => [Number(r.outlet_id), Number(r.amount)]));
    const [syncRows] = await pool.query(
      `SELECT outlet_id, DATE_FORMAT(MAX(last_synced_at), '%H.%i') AS t FROM tr_pos_sync_log WHERE sync_date = ? GROUP BY outlet_id`,
      [date]
    );
    const synced = new Map(syncRows.map((r) => [Number(r.outlet_id), r.t]));

    // Cabang yang punya transaksi hari itu; Cleanox ditampilkan sebagai baris sendiri (seperti referensi)
    const active = rows.filter((r) => (!outletId || r.outlet_id === outletId) && (r.revenue !== 0 || r.payments_total !== 0 || r.issues.length || r.unmapped.length));
    const items = [];
    let clxTotal = 0;
    const clxStatuses = [];
    for (const r of active) {
      const status = statusOf(r, batches.get(r.outlet_id));
      const c = clx.get(r.outlet_id) || 0;
      if (c > 0) {
        clxTotal += c;
        clxStatuses.push(status);
      }
      const amount = toFixed2(Math.max(0, r.revenue - c));
      if (unit !== "cleanox" && amount > 0) items.push({ name: r.outlet_name, amount, status, label: SYNC_LABEL[status] || status });
    }
    if (unit !== "waschen" && clxTotal > 0) {
      const status = SYNC_WORST_FIRST.find((s) => clxStatuses.includes(s)) || "VALID";
      items.push({ name: "Cleanox", amount: toFixed2(clxTotal), status, label: SYNC_LABEL[status] || status });
    }
    const sentIds = active.filter((r) => synced.has(r.outlet_id));
    return res.json({
      data: {
        date,
        items,
        total: toFixed2(items.reduce((s, i) => s + i.amount, 0)),
        sent: sentIds.length,
        outlets: active.length,
        synced_at: sentIds.map((r) => synced.get(r.outlet_id)).sort().pop() || null,
      },
    });
  } catch (err) {
    return fail(res, "pos-sync", err, "Gagal memuat sinkronisasi POS");
  }
}

// GET /dashboard/outlets — daftar cabang untuk filter (tidak bergantung pada widget yang tampil)
export async function getOutletList(_req, res) {
  const outlets = await getOutlets();
  return res.json({ data: outlets.map((o) => ({ id: o.id, name: o.name })) });
}

// GET /dashboard/sales?from&to&outlet
export async function getSales(req, res) {
  try {
    const range = resolveRange(req.query);
    const outletId = outletParam(req);
    const today = todayWib();
    const to = range.to < today ? range.to : today; // hari ke depan belum ada data
    let from = range.from;
    if (dayDiff(to, from) + 1 > MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1));

    const [rows] = await myWaschenPool.query(
      `SELECT DATE_FORMAT(t.order_date, '%Y-%m-%d') AS d,
              COALESCE(SUM(CASE WHEN ${IS_CLEANOX} THEN 0 ELSE d.subtotal END), 0) AS waschen,
              COALESCE(SUM(CASE WHEN ${IS_CLEANOX} THEN d.subtotal ELSE 0 END), 0) AS cleanox
       FROM tr_transaction_detail d
       JOIN tr_transaction t ON t.id = d.transaction_id
       WHERE t.order_date >= ? AND t.order_date < DATE_ADD(?, INTERVAL 1 DAY) AND t.is_delete_requested = 0
         ${outletId ? "AND t.outlet_id = ?" : ""}
       GROUP BY d`,
      outletId ? [from, to, outletId] : [from, to]
    );
    const byDate = new Map(rows.map((r) => [r.d, r]));
    const days = [];
    let waschen = 0;
    let cleanox = 0;
    if (from <= to) {
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const r = byDate.get(d);
        const w = toFixed2(r?.waschen || 0);
        const c = toFixed2(r?.cleanox || 0);
        waschen += w;
        cleanox += c;
        days.push({ date: d, waschen: w, cleanox: c });
      }
    }
    const yd = days.find((x) => x.date === addDays(today, -1)) || null;
    return res.json({
      data: {
        from,
        to,
        days,
        totals: { waschen: toFixed2(waschen), cleanox: toFixed2(cleanox), total: toFixed2(waschen + cleanox) },
        yesterday: yd,
        incomplete_today: to === today,
      },
    });
  } catch (err) {
    return fail(res, "sales", err, "Gagal memuat tren pendapatan");
  }
}

// Metode bayar POS → kelompok tampilan (urutan tetap)
const METHOD_ORDER = ["Tunai", "QRIS", "EDC", "Transfer Bank", "Deposit", "Lainnya"];

// GET /dashboard/payment-methods?from&to&outlet
export async function getPaymentMethods(req, res) {
  try {
    const range = resolveRange(req.query);
    const outletId = outletParam(req);
    const unit = parseUnit(req.query);
    // Filter unit: pembayaran satu nota dibagi sesuai porsi nilai layanan unit itu
    const [rows] = await myWaschenPool.query(
      `SELECT CASE
                WHEN l.payment_method LIKE 'Tunai%' THEN 'Tunai'
                WHEN l.payment_method LIKE 'QRIS%' THEN 'QRIS'
                WHEN l.payment_method LIKE 'EDC%' THEN 'EDC'
                WHEN l.payment_method LIKE 'Transfer%' THEN 'Transfer Bank'
                WHEN l.payment_method LIKE 'Potong Saldo%' THEN 'Deposit'
                ELSE 'Lainnya' END AS method,
              COALESCE(SUM(l.amount * ${unitShareExpr(unit)}), 0) AS amount
       FROM tr_payment_log l
       JOIN tr_transaction t ON t.id = l.transaction_id
       ${unit === "all" ? "" : UNIT_SHARE_JOIN}
       WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND l.log_type IN ('DP','Lunas','Pelunasan') AND t.is_delete_requested = 0
         ${outletId ? "AND t.outlet_id = ?" : ""}
       GROUP BY method`,
      outletId ? [range.from, range.to, outletId] : [range.from, range.to]
    );
    const amountOf = new Map(rows.map((r) => [r.method, toFixed2(r.amount)]));
    const items = METHOD_ORDER.filter((m) => m !== "Lainnya" || amountOf.get(m) > 0).map((m) => ({ method: m, amount: amountOf.get(m) || 0 }));
    return res.json({ data: { from: range.from, to: range.to, items, total: toFixed2(items.reduce((s, i) => s + i.amount, 0)) } });
  } catch (err) {
    return fail(res, "payment-methods", err, "Gagal memuat penjualan per metode bayar");
  }
}

// Akun rekening bank: peran BANK + akun yang terpasang di rekening bank aktif
async function bankAccountIds() {
  const [[map], [banks]] = await Promise.all([
    pool.query(`SELECT account_id FROM mst_account_map WHERE role = 'BANK' AND account_id IS NOT NULL`),
    pool.query(`SELECT DISTINCT account_id FROM mst_bank_account WHERE is_active = 1 AND account_id IS NOT NULL`),
  ]);
  return [...new Set([...map, ...banks].map((r) => Number(r.account_id)))];
}

// GET /dashboard/cashflow?from&to&outlet  — 7 hari terakhir sampai akhir rentang
export async function getCashflow(req, res) {
  try {
    const range = resolveRange(req.query);
    const outletId = outletParam(req);
    const today = todayWib();
    const to = range.to < today ? range.to : today;
    const from = addDays(to, -6);
    const ids = await bankAccountIds();
    if (!ids.length) {
      return res.json({ data: { mapped: false, days: [], balance: 0, from, to } });
    }
    const oc = outletId ? " AND jl.outlet_id = ?" : "";
    const op = outletId ? [outletId] : [];
    // Saldo awal ikut saldo tetapi bukan "uang masuk" hari itu
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(je.entry_date, '%Y-%m-%d') AS d, COALESCE(SUM(jl.debit), 0) AS masuk, COALESCE(SUM(jl.credit), 0) AS keluar
       FROM tr_journal_lines jl
       JOIN tr_journal_entries je ON je.id = jl.entry_id
       WHERE je.status IN ('POSTED','REVERSED') AND jl.account_id IN (?) AND je.source_type <> 'SALDO_AWAL'
         AND je.entry_date BETWEEN ? AND ?${oc}
       GROUP BY d`,
      [ids, from, to, ...op]
    );
    const byDate = new Map(rows.map((r) => [r.d, r]));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      return { date: d, masuk: toFixed2(byDate.get(d)?.masuk || 0), keluar: toFixed2(byDate.get(d)?.keluar || 0) };
    });
    const [[bal]] = await pool.query(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
       FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id
       WHERE je.status IN ('POSTED','REVERSED') AND jl.account_id IN (?) AND je.entry_date <= ?${oc}`,
      [ids, to, ...op]
    );
    return res.json({ data: { mapped: true, from, to, days, balance: toFixed2(bal.balance), incomplete_today: to === today } });
  } catch (err) {
    return fail(res, "cashflow", err, "Gagal memuat arus kas");
  }
}

// GET /dashboard/purchasing?from&to  — Biaya & Pembayaran (data Pengajuan di SuperApp)
export async function getPurchasing(req, res) {
  try {
    const range = resolveRange(req.query);
    const today = todayWib();
    const unit = parseUnit(req.query);
    const q = async (sql, params = []) => (await mainPool.query(sql, params))[0];
    // Filter unit: perusahaan pengajuan dikenali dari namanya di mst_company ("Cleanox" / "Waschen")
    const co = `SELECT company_id FROM mst_company WHERE company_name LIKE ?`;
    const unitCond = unit === "all" ? "" : ` AND (pr.company_id IN (${co}) OR EXISTS (SELECT 1 FROM tr_purchase_request_scope prs WHERE prs.pr_id = pr.pr_id AND prs.company_id IN (${co})))`;
    const unitParams = unit === "all" ? [] : [`%${unit}%`, `%${unit}%`];
    const [row] = await q(
      `SELECT
         SUM(CASE WHEN ${COND_ANTREAN} THEN 1 ELSE 0 END) AS antrean_count,
         SUM(CASE WHEN ${COND_ANTREAN} THEN ${AMOUNT_SQL} ELSE 0 END) AS antrean_amount,
         SUM(CASE WHEN ${COND_BAYAR} THEN 1 ELSE 0 END) AS bayar_count,
         SUM(CASE WHEN ${COND_BAYAR} THEN ${AMOUNT_SQL} ELSE 0 END) AS bayar_amount
       ${FROM_SQL} WHERE pr.is_deleted = 0${unitCond}`,
      unitParams
    );
    // Hutang kredit: sisa belum dibayar, dipisah menurut jatuh tempo (tanpa jatuh tempo = belum jatuh tempo)
    const kredit = await q(
      `SELECT ${AMOUNT_SQL} AS target, ${PAID_SQL} AS paid, pr.jatuh_tempo ${FROM_SQL} WHERE pr.is_deleted = 0 AND ${COND_KREDIT}${unitCond}`,
      unitParams
    );
    const hutang = { belum: { count: 0, amount: 0 }, lewat: { count: 0, amount: 0 } };
    for (const k of kredit) {
      const sisa = Math.max(0, Number(k.target) - Number(k.paid));
      if (sisa <= 0) continue;
      const due = k.jatuh_tempo ? new Date(k.jatuh_tempo).toISOString().slice(0, 10) : null;
      const bucket = due && due < today ? hutang.lewat : hutang.belum;
      bucket.count += 1;
      bucket.amount += sisa;
    }
    const [paid] = await q(
      `SELECT COALESCE(SUM(p.nominal_bayar), 0) AS amount
       FROM tr_purchase_request_payment p JOIN tr_purchase_request pr ON pr.pr_id = p.pr_id
       WHERE pr.is_deleted = 0 AND p.paid_at >= ? AND p.paid_at < DATE_ADD(?, INTERVAL 1 DAY)${unitCond}`,
      [range.from, range.to, ...unitParams]
    );
    const n = (v) => Number(v) || 0;
    return res.json({
      data: {
        from: range.from,
        to: range.to,
        antrean: { count: n(row.antrean_count), amount: n(row.antrean_amount) },
        bayar: { count: n(row.bayar_count), amount: n(row.bayar_amount) },
        hutang_belum: { count: hutang.belum.count, amount: toFixed2(hutang.belum.amount) },
        hutang_lewat: { count: hutang.lewat.count, amount: toFixed2(hutang.lewat.amount) },
        paid_in_range: toFixed2(paid.amount),
      },
    });
  } catch (err) {
    return fail(res, "purchasing", err, "Gagal memuat ringkasan biaya & pembayaran");
  }
}
