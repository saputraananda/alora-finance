import { pool, myWaschenPool } from "../../db/pool.js";
import { ACTIVE_MATCH, LOG_WHERE, outletMap } from "./reconWorkspace.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// PENCOCOKAN DEPOSIT (Rekonsiliasi transaksi, mode Deposit)
//   Deposit = pencocokan aktif dengan alloc_type 'DEPOSIT' (bank menerima lebih; nominal = ABS(difference)).
//   Pemakaian = pencocokan MATCHED tanpa mutasi bank, hanya item INTERNAL:
//     POS_DEPOSIT (ref_key = id tr_payment_log "Potong Saldo Member") atau POS_NOTA (ref_key = id tr_transaction, nominal = sisa tagihan),
//   ditambah baris tr_recon_deposit_use yang menautkannya ke deposit sumber.
//   sisa deposit = nominal - SUM(pemakaian dari pencocokan yang belum dibatalkan). POS hanya dibaca.
// ════════════════════════════════════════════════════════════════════════════

const TOL = 0.01;
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const rp = (n) => `Rp ${round2(n).toLocaleString("id-ID")}`;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
export const depositCode = (id) => `DEP-${String(id).padStart(4, "0")}`;

// Deposit aktif beserta sisanya. ids (opsional) membatasi ke deposit tertentu; includeSpent = sertakan yang sisanya nol.
export async function loadDeposits(conn = pool, ids = null, { includeSpent = false } = {}) {
  const [rows] = await conn.query(
    `SELECT m.id, ABS(m.difference) AS amount, m.bank_account_id, m.explanation,
            (SELECT COALESCE(SUM(u.amount), 0) FROM tr_recon_deposit_use u JOIN tr_recon_match c ON c.id = u.match_id AND c.undone_at IS NULL WHERE u.deposit_match_id = m.id) AS used,
            (SELECT MIN(i.outlet_id) FROM tr_recon_match_item i WHERE i.match_id = m.id AND i.side = 'INTERNAL') AS outlet_id
     FROM tr_recon_match m WHERE m.alloc_type = 'DEPOSIT' AND ${ACTIVE_MATCH}${ids ? " AND m.id IN (?)" : ""} ORDER BY m.id`,
    ids ? [ids] : []
  );
  if (!rows.length) return [];
  const [bank] = await conn.query(
    `SELECT i.match_id, DATE_FORMAT(s.trx_date,'%Y-%m-%d') AS d, s.description, ba.bank_name, ba.account_no, mt.recon_code
     FROM tr_recon_match_item i JOIN tr_bank_statement s ON s.id = CAST(i.ref_key AS UNSIGNED)
     LEFT JOIN mst_bank_account ba ON ba.id = s.bank_account_id LEFT JOIN tr_bank_statement_meta mt ON mt.statement_id = s.id
     WHERE i.side = 'BANK' AND i.ref_type = 'BANK' AND i.match_id IN (?) ORDER BY i.id`,
    [rows.map((r) => r.id)]
  );
  const bm = new Map();
  bank.forEach((b) => bm.set(Number(b.match_id), [...(bm.get(Number(b.match_id)) || []), b]));
  const out = rows.map((r) => {
    const bs = bm.get(Number(r.id)) || [];
    const amount = round2(r.amount);
    const used = round2(r.used);
    return {
      deposit_match_id: Number(r.id),
      code: depositCode(r.id),
      date: bs.map((b) => b.d).filter(Boolean).sort().pop() || null,
      recon_code: bs.map((b) => b.recon_code).filter(Boolean).join(", ") || null,
      bank_label: [...new Set(bs.map((b) => (b.bank_name ? `${b.bank_name} ${b.account_no || ""}`.trim() : null)).filter(Boolean))].join(", ") || null,
      bank_description: [...new Set(bs.map((b) => b.description).filter(Boolean))].join(" | ") || null,
      bank_account_id: Number(r.bank_account_id),
      outlet_id: r.outlet_id ? Number(r.outlet_id) : null,
      amount,
      used,
      remaining: round2(amount - used),
      remark: r.explanation || null,
    };
  });
  return includeSpent ? out : out.filter((d) => d.remaining > TOL);
}

// Ringkasan untuk kartu KPI Deposit di ruang kerja (semua deposit aktif, tidak dibatasi periode)
export async function depositRemainingTotal(conn = pool) {
  const list = await loadDeposits(conn);
  return { deposit_remaining: round2(list.reduce((s, d) => s + d.remaining, 0)), deposit_count: list.length };
}

// Pemakaian aktif per item POS (pencocokan konsumsi yang belum dibatalkan): "POS_DEPOSIT:id" / "POS_NOTA:id" -> nominal
async function loadItemUsage(conn = pool) {
  const [rows] = await conn.query(
    `SELECT i.ref_type, i.ref_key, SUM(i.amount) AS used FROM tr_recon_match_item i JOIN tr_recon_match m ON m.id = i.match_id AND ${ACTIVE_MATCH}
     WHERE i.side = 'INTERNAL' AND i.ref_type IN ('POS_DEPOSIT','POS_NOTA') GROUP BY i.ref_type, i.ref_key`
  );
  return new Map(rows.map((r) => [`${r.ref_type}:${r.ref_key}`, round2(r.used)]));
}

// Pembayaran POS "Potong Saldo Member" dan nota belum lunas. Nominal dihitung dari POS (hanya baca) dikurangi pemakaian di alfi.
// logIds / notaIds (opsional) = ambil hanya id tersebut (dipakai saat validasi pencocokan).
async function posCandidates({ from, to, outletId = null, q = "", logIds = null, notaIds = null, limit = 1500 }) {
  const usage = await loadItemUsage();
  const om = await outletMap();
  const oname = (id) => om.get(Number(id))?.name || (id ? `Outlet #${id}` : "Pusat");
  const like = q ? `%${String(q).trim()}%` : null;
  const out = [];

  let dRows = [];
  if (logIds) {
    if (logIds.length) {
      [dRows] = await myWaschenPool.query(
        `SELECT l.id, l.amount, DATE_FORMAT(l.created_at,'%Y-%m-%d') AS d, t.id AS tid, t.order_no, t.outlet_id, c.name AS customer
         FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id LEFT JOIN mst_customer c ON c.id = t.customer_id
         WHERE l.id IN (?) AND l.log_type IN ('DP','Lunas','Pelunasan') AND t.is_delete_requested = 0 AND l.payment_method LIKE 'Potong Saldo%'`,
        [logIds]
      );
    }
  } else {
    [dRows] = await myWaschenPool.query(
      `SELECT l.id, l.amount, DATE_FORMAT(l.created_at,'%Y-%m-%d') AS d, t.id AS tid, t.order_no, t.outlet_id, c.name AS customer
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id LEFT JOIN mst_customer c ON c.id = t.customer_id
       WHERE ${LOG_WHERE} AND l.payment_method LIKE 'Potong Saldo%'${outletId ? " AND t.outlet_id = ?" : ""}${like ? " AND (t.order_no LIKE ? OR c.name LIKE ?)" : ""}
       ORDER BY l.created_at DESC, l.id DESC LIMIT ${Number(limit)}`,
      [from, to, ...(outletId ? [outletId] : []), ...(like ? [like, like] : [])]
    );
  }
  dRows.forEach((r) => {
    if ((usage.get(`POS_DEPOSIT:${r.id}`) || 0) > TOL) return;
    out.push({ ref_type: "POS_DEPOSIT", ref_key: String(r.id), nota: r.order_no, customer: r.customer || null, date: r.d, outlet_id: Number(r.outlet_id), outlet_name: oname(r.outlet_id), amount: round2(r.amount), kind_label: "Dibayar deposit", transaction_id: Number(r.tid) });
  });

  const notaSql = (where, group) =>
    `SELECT t.id, t.order_no, t.outlet_id, DATE_FORMAT(t.order_date,'%Y-%m-%d') AS d, MAX(t.grand_total) AS grand_total, MAX(c.name) AS customer,
            COALESCE(SUM(CASE WHEN l.log_type IN ('DP','Lunas','Pelunasan') THEN l.amount END), 0) AS paid
     FROM tr_transaction t LEFT JOIN mst_customer c ON c.id = t.customer_id LEFT JOIN tr_payment_log l ON l.transaction_id = t.id
     WHERE t.is_delete_requested = 0 AND ${where} ${group}`;
  let nRows = [];
  if (notaIds) {
    if (notaIds.length) [nRows] = await myWaschenPool.query(notaSql("t.id IN (?)", "GROUP BY t.id"), [notaIds]);
  } else {
    [nRows] = await myWaschenPool.query(
      notaSql(
        `t.payment_status <> 'Lunas' AND t.order_date >= ? AND t.order_date < DATE_ADD(?, INTERVAL 1 DAY)${outletId ? " AND t.outlet_id = ?" : ""}${like ? " AND (t.order_no LIKE ? OR c.name LIKE ?)" : ""}`,
        `GROUP BY t.id HAVING MAX(t.grand_total) - paid > 0.5 ORDER BY MAX(t.order_date) DESC, t.id DESC LIMIT ${Number(limit)}`
      ),
      [from, to, ...(outletId ? [outletId] : []), ...(like ? [like, like] : [])]
    );
  }
  nRows.forEach((r) => {
    const outstanding = round2(Number(r.grand_total) - Number(r.paid) - (usage.get(`POS_NOTA:${r.id}`) || 0));
    if (outstanding <= 0.5) return;
    out.push({ ref_type: "POS_NOTA", ref_key: String(r.id), nota: r.order_no, customer: r.customer || null, date: r.d, outlet_id: Number(r.outlet_id), outlet_name: oname(r.outlet_id), amount: outstanding, kind_label: "Belum lunas", transaction_id: Number(r.id) });
  });
  return out;
}

// GET /rekon/deposit?outlet=&from=&to=&q=
export async function getDeposits(req, res) {
  try {
    const to = isDate(req.query.to) ? req.query.to : new Date().toISOString().slice(0, 10);
    const from = isDate(req.query.from) ? req.query.from : addDays(to, -30);
    const outletId = Number(req.query.outlet) || null;
    const q = String(req.query.q || "").trim();
    const om = await outletMap();
    let deposits = await loadDeposits();
    if (outletId) deposits = deposits.filter((d) => !d.outlet_id || d.outlet_id === outletId);
    deposits = deposits.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || b.deposit_match_id - a.deposit_match_id);
    const summary = { deposit_total_remaining: round2(deposits.reduce((s, d) => s + d.remaining, 0)), deposit_count: deposits.length };
    const items = (await posCandidates({ from, to, outletId, q }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.ref_key) - Number(a.ref_key))
      .slice(0, 500);
    return res.json({
      deposits: deposits.map((d) => ({
        deposit_match_id: d.deposit_match_id, code: d.code, date: d.date, recon_code: d.recon_code, bank_label: d.bank_label, bank_description: d.bank_description,
        outlet_id: d.outlet_id, outlet_name: d.outlet_id ? om.get(d.outlet_id)?.name || `Outlet #${d.outlet_id}` : null,
        amount: d.amount, used: d.used, remaining: d.remaining, remark: d.remark,
      })),
      items,
      summary,
    });
  } catch (err) {
    console.error("[getDeposits]", err);
    return res.status(500).json({ message: "Gagal memuat deposit", error: err.message });
  }
}

// POST /rekon/deposit/match { deposit_match_ids:[...], items:[{ref_type, ref_key}] }
export async function createDepositMatch(req, res) {
  const conn = await pool.getConnection();
  try {
    const depIds = [...new Set((Array.isArray(req.body?.deposit_match_ids) ? req.body.deposit_match_ids : []).map(Number).filter(Boolean))];
    const sel = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!depIds.length) return res.status(422).json({ message: "Pilih minimal satu deposit." });
    if (!sel.length) return res.status(422).json({ message: "Pilih minimal satu nota atau pembayaran." });
    const keys = new Set();
    for (const s of sel) {
      if (!["POS_DEPOSIT", "POS_NOTA"].includes(s?.ref_type) || !/^\d+$/.test(String(s?.ref_key ?? ""))) return res.status(422).json({ message: "Item tidak valid." });
      const k = `${s.ref_type}:${s.ref_key}`;
      if (keys.has(k)) return res.status(422).json({ message: "Ada item yang dipilih dua kali." });
      keys.add(k);
    }
    const uid = req.user?.id || null;

    await conn.beginTransaction();
    // Kunci baris deposit agar dua pemakaian bersamaan tidak melebihi sisa
    await conn.query(`SELECT id FROM tr_recon_match WHERE id IN (?) FOR UPDATE`, [depIds]);
    const deps = await loadDeposits(conn, depIds, { includeSpent: true });
    if (deps.length !== depIds.length) { await conn.rollback(); return res.status(422).json({ message: "Ada deposit yang tidak ditemukan atau sudah dibatalkan." }); }
    const spent = deps.find((d) => d.remaining <= TOL);
    if (spent) { await conn.rollback(); return res.status(422).json({ message: `Deposit ${spent.code} sudah tidak punya sisa.` }); }

    // Nominal dihitung ulang dari POS, tidak memakai nominal dari klien
    const logIds = sel.filter((s) => s.ref_type === "POS_DEPOSIT").map((s) => Number(s.ref_key));
    const notaIds = sel.filter((s) => s.ref_type === "POS_NOTA").map((s) => Number(s.ref_key));
    const cand = await posCandidates({ logIds, notaIds });
    const byKey = new Map(cand.map((c) => [`${c.ref_type}:${c.ref_key}`, c]));
    const items = [];
    for (const s of sel) {
      const it = byKey.get(`${s.ref_type}:${s.ref_key}`);
      if (!it) { await conn.rollback(); return res.status(422).json({ message: `${s.ref_type === "POS_NOTA" ? "Nota" : "Pembayaran"} #${s.ref_key} tidak tersedia (sudah lunas, sudah dipakai, atau dihapus).` }); }
      items.push(it);
    }
    const total = round2(items.reduce((s, i) => s + i.amount, 0));
    const available = round2(deps.reduce((s, d) => s + d.remaining, 0));
    if (total > available + TOL) { await conn.rollback(); return res.status(422).json({ message: `Nominal nota (${rp(total)}) lebih besar dari sisa deposit yang dipilih (${rp(available)}).` }); }

    // Alokasi ke deposit, yang tertua dulu
    const order = [...deps].sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")) || a.deposit_match_id - b.deposit_match_id);
    let left = total;
    const uses = [];
    for (const d of order) {
      if (left <= TOL) break;
      const take = round2(Math.min(d.remaining, left));
      uses.push({ deposit_match_id: d.deposit_match_id, amount: take });
      left = round2(left - take);
    }

    const [mh] = await conn.query(`INSERT INTO tr_recon_match (bank_account_id, status, difference, created_by) VALUES (?, 'MATCHED', 0, ?)`, [order[0].bank_account_id, uid]);
    for (const it of items) {
      await conn.query(`INSERT INTO tr_recon_match_item (match_id, side, ref_type, ref_key, outlet_id, amount, counter_amount) VALUES (?, 'INTERNAL', ?, ?, ?, ?, ?)`, [mh.insertId, it.ref_type, it.ref_key, it.outlet_id, it.amount, it.amount]);
    }
    for (const u of uses) {
      await conn.query(`INSERT INTO tr_recon_deposit_use (match_id, deposit_match_id, amount) VALUES (?, ?, ?)`, [mh.insertId, u.deposit_match_id, u.amount]);
    }
    const detail = `${uses.map((u) => depositCode(u.deposit_match_id)).join(", ")} ↔ ${items.map((i) => `${i.nota}${i.kind_label === "Belum lunas" ? " (belum lunas)" : " (dibayar deposit)"}`).join(", ")} · deposit dipakai ${rp(total)}`;
    await conn.query(`INSERT INTO tr_recon_history (action, ref_type, ref_key, detail, user_id) VALUES ('MATCH', 'MATCH', ?, ?, ?)`, [String(mh.insertId), detail.slice(0, 4000), uid]);
    await conn.commit();
    const after = await loadDeposits(pool, depIds, { includeSpent: true });
    return res.status(201).json({ message: "Deposit dipakai.", match_id: mh.insertId, used: total, remaining_after: after.map((d) => ({ deposit_match_id: d.deposit_match_id, remaining: d.remaining })) });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[createDepositMatch]", err);
    return res.status(500).json({ message: "Gagal memakai deposit", error: err.message });
  } finally {
    conn.release();
  }
}
