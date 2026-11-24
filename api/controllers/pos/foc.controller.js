import ExcelJS from "exceljs";
import { pool, myWaschenPool } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { employeeNames } from "./nota.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// FRONT OFFICE CASHIER — riwayat transaksi POS untuk tim Finance (BACA SAJA).
// Isinya sama seperti menu Riwayat di my-waschen: Transaksi · Refund · Void.
// ════════════════════════════════════════════════════════════════════════════

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const list = (v) => (v == null || v === "" ? [] : String(v).split(",").map((x) => x.trim()).filter(Boolean));
const nums = (v) => list(v).map(Number).filter((n) => Number.isFinite(n) && n > 0);

// Metode bayar di filter = awalan nama metode di POS (mis. "Transfer" mencakup "Transfer Bank (BCA ...)")
const METHOD_PREFIX = { TUNAI: "Tunai", TRANSFER: "Transfer", QRIS: "QRIS", EDC: "EDC", DEPOSIT: "Potong Saldo" };
const methodClass = (m = "") => {
  const s = String(m).trim().toLowerCase();
  if (s.startsWith("tunai")) return "TUNAI";
  if (s.startsWith("transfer")) return "TRANSFER BANK";
  if (s.startsWith("qris")) return "QRIS";
  if (s.startsWith("edc")) return "EDC";
  if (s.startsWith("potong saldo")) return "POTONG SALDO";
  return s ? s.toUpperCase() : "-";
};

// Status transaksi (sama dengan filter di my-waschen) dari work_status & picked_up_at
const STATUS_SQL = {
  belum: "(t.work_status < 90)",
  order: "(t.work_status <= 10)",
  proses: "(t.work_status > 10 AND t.work_status < 90)",
  selesai_belum: "(t.work_status >= 90 AND t.work_status < 100 AND t.picked_up_at IS NULL)",
  selesai_sudah: "(t.picked_up_at IS NOT NULL OR t.work_status >= 100)",
};

function buildWhere(q, { voids = false } = {}) {
  const where = [voids ? "t.is_delete_requested = 1" : "t.is_delete_requested = 0"];
  const p = [];
  const col = q.basis === "paid" ? "t.paid_at" : "t.order_date";
  if (isDate(q.from)) { where.push(`${col} >= ?`); p.push(q.from); }
  if (isDate(q.to)) { where.push(`${col} < DATE_ADD(?, INTERVAL 1 DAY)`); p.push(q.to); }
  const outlets = nums(q.outlets);
  if (outlets.length) { where.push("t.outlet_id IN (?)"); p.push(outlets); }
  const cashiers = nums(q.cashiers);
  if (cashiers.length) { where.push("t.cashier_employee_id IN (?)"); p.push(cashiers); }
  const cats = list(q.categories).filter((c) => ["Kiloan", "Satuan", "Campuran"].includes(c));
  if (cats.length) { where.push("t.order_category IN (?)"); p.push(cats); }
  const st = list(q.status).map((s) => STATUS_SQL[s]).filter(Boolean);
  if (st.length) where.push(`(${st.join(" OR ")})`);
  // Status bayar nota saat ini (Outstanding = belum dibayar sama sekali)
  const ps = list(q.paystatus).filter((x) => ["Lunas", "DP", "Outstanding"].includes(x));
  if (ps.length) { where.push("t.payment_status IN (?)"); p.push(ps); }
  const pay = list(q.pay).filter((x) => ["Lunas", "DP", "Pelunasan"].includes(x));
  if (pay.length) { where.push("EXISTS (SELECT 1 FROM tr_payment_log l WHERE l.transaction_id = t.id AND l.log_type IN (?))"); p.push(pay); }
  const methods = list(q.methods).map((m) => METHOD_PREFIX[m]).filter(Boolean);
  if (methods.length) {
    where.push(`EXISTS (SELECT 1 FROM tr_payment_log l WHERE l.transaction_id = t.id AND (${methods.map(() => "l.payment_method LIKE ?").join(" OR ")}))`);
    methods.forEach((m) => p.push(`${m}%`));
  }
  const s = String(q.search || "").trim();
  if (s) {
    where.push("(t.order_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)");
    p.push(`%${s}%`, `%${s}%`, `%${s}%`);
  }
  return { sql: where.join(" AND "), params: p };
}

const ORDER = {
  terbaru: "t.order_date DESC, t.id DESC",
  terlama: "t.order_date ASC, t.id ASC",
  tertinggi: "t.grand_total DESC, t.id DESC",
  terendah: "t.grand_total ASC, t.id ASC",
};

async function outletMap() {
  const [rows] = await myWaschenPool.query("SELECT id, name, outlet_code FROM mst_outlet ORDER BY id");
  return new Map(rows.map((o) => [Number(o.id), { name: o.name, code: o.outlet_code }]));
}

const FROM = "FROM tr_transaction t LEFT JOIN mst_customer c ON c.id = t.customer_id";

// ── GET /pos/foc/meta?from=&to= : pilihan filter (cabang, pembuat nota) ─────
export async function getFocMeta(req, res) {
  try {
    const om = await outletMap();
    const w = [];
    const p = [];
    if (isDate(req.query.from)) { w.push("order_date >= ?"); p.push(req.query.from); }
    if (isDate(req.query.to)) { w.push("order_date < DATE_ADD(?, INTERVAL 1 DAY)"); p.push(req.query.to); }
    const [ids] = await myWaschenPool.query(`SELECT DISTINCT cashier_employee_id AS id FROM tr_transaction ${w.length ? `WHERE ${w.join(" AND ")}` : ""} LIMIT 500`, p);
    const names = await employeeNames(ids.map((r) => r.id));
    const cashiers = [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ outlets: [...om.entries()].map(([id, o]) => ({ id, name: o.name, code: o.code })), cashiers });
  } catch (err) {
    console.error("[getFocMeta]", err);
    return res.status(500).json({ message: "Gagal memuat pilihan filter", error: err.message });
  }
}

// ── GET /pos/transactions ───────────────────────────────────────────────────
export async function getTransactions(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 25));
    const w = buildWhere(req.query);
    const [[sum]] = await myWaschenPool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.grand_total), 0) AS total, COALESCE(SUM(t.paid_amount), 0) AS paid ${FROM} WHERE ${w.sql}`,
      w.params
    );
    const [rows] = await myWaschenPool.query(
      `SELECT t.id, t.order_no, t.order_date, t.outlet_id, t.cashier_employee_id, t.order_category, t.work_status, t.picked_up_at,
              t.grand_total, t.paid_amount, t.payment_status, t.payment_method,
              c.name AS customer_name, c.phone AS customer_phone,
              (SELECT GROUP_CONCAT(DISTINCT l.payment_method SEPARATOR ', ') FROM tr_payment_log l WHERE l.transaction_id = t.id AND l.log_type IN ('DP','Lunas','Pelunasan')) AS methods
       ${FROM} WHERE ${w.sql} ORDER BY ${ORDER[req.query.sort] || ORDER.terbaru} LIMIT ? OFFSET ?`,
      [...w.params, limit, (page - 1) * limit]
    );
    const om = await outletMap();
    const names = await employeeNames(rows.map((r) => r.cashier_employee_id));
    return res.json({
      rows: rows.map((r) => ({
        id: Number(r.id),
        order_no: r.order_no,
        order_date: r.order_date,
        outlet_name: om.get(Number(r.outlet_id))?.name || `Outlet #${r.outlet_id}`,
        outlet_code: om.get(Number(r.outlet_id))?.code || null,
        cashier: names.get(Number(r.cashier_employee_id)) || null,
        category: r.order_category,
        customer_name: r.customer_name || "-",
        customer_phone: r.customer_phone || null,
        work_status: Number(r.work_status) || 0,
        picked_up: Boolean(r.picked_up_at) || Number(r.work_status) >= 100,
        grand_total: toFixed2(r.grand_total),
        paid_amount: toFixed2(r.paid_amount),
        payment_status: r.payment_status,
        methods: r.methods || r.payment_method || null,
      })),
      summary: { count: Number(sum.n), total: toFixed2(sum.total), paid: toFixed2(sum.paid) },
      pagination: { page, limit, total: Number(sum.n), totalPages: Math.max(1, Math.ceil(Number(sum.n) / limit)) },
    });
  } catch (err) {
    console.error("[getTransactions]", err);
    return res.status(500).json({ message: "Gagal memuat transaksi POS", error: err.message });
  }
}

// ── GET /pos/voids ──────────────────────────────────────────────────────────
export async function getVoids(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 25;
    const w = buildWhere(req.query, { voids: true });
    const [[sum]] = await myWaschenPool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(t.grand_total), 0) AS total ${FROM} WHERE ${w.sql}`, w.params);
    const [rows] = await myWaschenPool.query(
      `SELECT t.id, t.order_no, t.order_date, t.outlet_id, t.cashier_employee_id, t.grand_total, t.payment_status,
              t.delete_reason, t.delete_approval_status, t.delete_requested_at, c.name AS customer_name
       ${FROM} WHERE ${w.sql} ORDER BY t.order_date DESC, t.id DESC LIMIT ? OFFSET ?`,
      [...w.params, limit, (page - 1) * limit]
    );
    const om = await outletMap();
    const names = await employeeNames(rows.map((r) => r.cashier_employee_id));
    return res.json({
      rows: rows.map((r) => ({
        id: Number(r.id), order_no: r.order_no, order_date: r.order_date, outlet_name: om.get(Number(r.outlet_id))?.name || "-",
        cashier: names.get(Number(r.cashier_employee_id)) || null, customer_name: r.customer_name || "-",
        grand_total: toFixed2(r.grand_total), payment_status: r.payment_status, reason: r.delete_reason, approval: r.delete_approval_status, requested_at: r.delete_requested_at,
      })),
      summary: { count: Number(sum.n), total: toFixed2(sum.total) },
      pagination: { page, limit, total: Number(sum.n), totalPages: Math.max(1, Math.ceil(Number(sum.n) / limit)) },
    });
  } catch (err) {
    console.error("[getVoids]", err);
    return res.status(500).json({ message: "Gagal memuat void", error: err.message });
  }
}

// ── GET /pos/refunds ────────────────────────────────────────────────────────
export async function getRefunds(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 25;
    const where = ["1=1"];
    const p = [];
    if (isDate(req.query.from)) { where.push("r.requested_at >= ?"); p.push(req.query.from); }
    if (isDate(req.query.to)) { where.push("r.requested_at < DATE_ADD(?, INTERVAL 1 DAY)"); p.push(req.query.to); }
    const outlets = nums(req.query.outlets);
    if (outlets.length) { where.push("t.outlet_id IN (?)"); p.push(outlets); }
    const s = String(req.query.search || "").trim();
    if (s) { where.push("(t.order_no LIKE ? OR c.name LIKE ?)"); p.push(`%${s}%`, `%${s}%`); }
    const base = `FROM tr_transaction_refund r JOIN tr_transaction t ON t.id = r.transaction_id LEFT JOIN mst_customer c ON c.id = t.customer_id WHERE ${where.join(" AND ")}`;
    const [[sum]] = await myWaschenPool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(r.amount), 0) AS total ${base}`, p);
    const [rows] = await myWaschenPool.query(
      `SELECT r.id, r.transaction_id, t.order_no, t.outlet_id, c.name AS customer_name, r.refund_type, r.source, r.amount, r.reason, r.status,
              r.requested_by_employee_id, r.requested_at, r.reviewed_by_employee_id, r.reviewed_at
       ${base} ORDER BY r.requested_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit]
    );
    const om = await outletMap();
    const names = await employeeNames(rows.flatMap((r) => [r.requested_by_employee_id, r.reviewed_by_employee_id]));
    return res.json({
      rows: rows.map((r) => ({
        id: Number(r.id), transaction_id: Number(r.transaction_id), order_no: r.order_no, outlet_name: om.get(Number(r.outlet_id))?.name || "-",
        customer_name: r.customer_name || "-", refund_type: r.refund_type, source: r.source, amount: toFixed2(r.amount), reason: r.reason, status: r.status,
        requested_by: names.get(Number(r.requested_by_employee_id)) || null, requested_at: r.requested_at,
        reviewed_by: names.get(Number(r.reviewed_by_employee_id)) || null, reviewed_at: r.reviewed_at,
      })),
      summary: { count: Number(sum.n), total: toFixed2(sum.total) },
      pagination: { page, limit, total: Number(sum.n), totalPages: Math.max(1, Math.ceil(Number(sum.n) / limit)) },
    });
  } catch (err) {
    console.error("[getRefunds]", err);
    return res.status(500).json({ message: "Gagal memuat refund", error: err.message });
  }
}

// ── GET /pos/transactions/export — Excel (kolom kiri & kanan seperti contoh "Pendapatan Cleanox") ──
const EXPORT_MAX = 20000;
export async function exportTransactions(req, res) {
  try {
    const w = buildWhere(req.query);
    const [rows] = await myWaschenPool.query(
      `SELECT t.id, t.order_no, t.order_date, t.outlet_id, t.grand_total, t.paid_amount, t.payment_method, c.name AS customer_name
       ${FROM} WHERE ${w.sql} ORDER BY t.order_date ASC, t.id ASC LIMIT ${EXPORT_MAX + 1}`,
      w.params
    );
    const truncated = rows.length > EXPORT_MAX;
    const data = truncated ? rows.slice(0, EXPORT_MAX) : rows;
    const om = await outletMap();

    // Pembayaran per nota → data tunai / non tunai
    const payBy = new Map();
    for (let i = 0; i < data.length; i += 2000) {
      const ids = data.slice(i, i + 2000).map((r) => r.id);
      if (!ids.length) continue;
      const [pays] = await myWaschenPool.query(
        "SELECT transaction_id, payment_method, SUM(amount) AS amt FROM tr_payment_log WHERE transaction_id IN (?) AND log_type IN ('DP','Lunas','Pelunasan') GROUP BY transaction_id, payment_method",
        [ids]
      );
      pays.forEach((p) => {
        const k = Number(p.transaction_id);
        const cur = payBy.get(k) || { tunai: 0, non: 0, methods: new Set() };
        if (methodClass(p.payment_method) === "TUNAI") cur.tunai += Number(p.amt) || 0;
        else cur.non += Number(p.amt) || 0;
        cur.methods.add(methodClass(p.payment_method));
        payBy.set(k, cur);
      });
    }
    // Tanggal rekonsiliasi harian (hari yang sudah disetujui)
    const recon = new Map();
    const [rd] = await pool.query("SELECT outlet_id, DATE_FORMAT(rec_date,'%Y-%m-%d') AS d FROM tr_recon_daily WHERE status = 'APPROVED'");
    rd.forEach((r) => recon.set(`${r.outlet_id}|${r.d}`, r.d));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Transaksi");
    const NAVY = "FF0F1F3D";
    const GRAY = "FFB8BCC2";
    const cols = [
      { h: "NO", w: 6 }, { h: "TGL OMZET", w: 13 }, { h: "KODE", w: 8 }, { h: "NO NOTA", w: 26 }, { h: "NAMA", w: 26 }, { h: "KATEGORI", w: 18 }, { h: "NOMINAL", w: 14 },
      { h: "REKONSILIASI", w: 14 }, { h: "DATA TUNAI", w: 14 }, { h: "DATA NON TUNAI", w: 16 }, { h: "GAP", w: 12 },
    ];
    ws.columns = cols.map((c) => ({ width: c.w }));
    const fmtD = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "");
    const ymd = (d) => (d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : String(d).slice(0, 10));
    ws.mergeCells("A1:K1");
    ws.getCell("A1").value = "Transaksi POS — Front Office Cashier";
    ws.getCell("A1").font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    ws.getCell("A1").alignment = { horizontal: "center" };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    const info = [`Periode: ${req.query.from || "-"} – ${req.query.to || "-"}`, `Total baris: ${data.length}${truncated ? ` (dibatasi ${EXPORT_MAX})` : ""}`, `Diekspor: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`];
    info.forEach((t, i) => { ws.mergeCells(`A${i + 2}:G${i + 2}`); ws.getCell(`A${i + 2}`).value = t; ws.getCell(`A${i + 2}`).font = { italic: true, size: 10 }; });
    [1, 2, 3, 4].forEach((r) => { for (let c = 1; c <= 7; c++) if (r > 1) ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY } }; });
    const hr = 6;
    cols.forEach((c, i) => {
      const cell = ws.getCell(hr, i + 1);
      cell.value = c.h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    });
    data.forEach((r, i) => {
      const od = ymd(r.order_date);
      const pay = payBy.get(Number(r.id)) || { tunai: 0, non: 0, methods: new Set() };
      const kategori = pay.methods.size ? [...pay.methods].join(" + ") : methodClass(r.payment_method);
      const nominal = toFixed2(r.grand_total);
      const rk = recon.get(`${r.outlet_id}|${od}`);
      const row = ws.addRow([
        i + 1, fmtD(od), om.get(Number(r.outlet_id))?.code || "", r.order_no, r.customer_name || "-", kategori, nominal,
        rk ? fmtD(rk) : "", rk ? toFixed2(pay.tunai) : "", rk ? toFixed2(pay.non) : "", rk ? toFixed2(nominal - pay.tunai - pay.non) : "",
      ]);
      for (let c = 1; c <= 7; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY } };
      for (let c = 8; c <= 11; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY } };
      [7, 9, 10, 11].forEach((c) => { row.getCell(c).numFmt = "#,##0"; });
    });
    ws.views = [{ state: "frozen", ySplit: hr }];

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="transaksi-pos-${req.query.from || "semua"}_${req.query.to || ""}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error("[exportTransactions]", err);
    return res.status(500).json({ message: "Gagal membuat file Excel", error: err.message });
  }
}
