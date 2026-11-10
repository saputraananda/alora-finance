import { pool, myWaschenPool, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { cutoffRange, currentCutoffMonth } from "../dashboard/dashboard.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// PELANGGAN > DEPOSIT MEMBER
// "Saldo deposit di POS selalu sama dengan akun" — Konsep hal. 10:
//   saldo semua member di POS  =  saldo akun Deposit Member (kewajiban) di jurnal.
// Catatan sumber data POS:
//   • Saldo member           : mst_customer.deposit_balance (saldo SAAT INI).
//   • Top-up                 : tr_customer_deposit (type Topup; selisih balance_after−balance_before−amount = bonus).
//   • Pemakaian saldo        : pembayaran bermetode "Potong Saldo Member" (tidak tercatat di tr_customer_deposit).
// ════════════════════════════════════════════════════════════════════════════

const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const addMonths = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
};

async function accountBalance(asOf) {
  const [m] = await pool.query(`SELECT m.account_id, a.code, a.name FROM mst_account_map m JOIN mst_coa a ON a.id = m.account_id WHERE m.role = 'DEPOSIT_MEMBER'`);
  if (!m[0]) return { account: null, balance: 0 };
  const [r] = await pool.query(
    `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS bal
     FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id
     WHERE je.status IN ('POSTED','REVERSED') AND jl.account_id = ? AND je.entry_date <= ?`,
    [m[0].account_id, asOf]
  );
  return { account: `${m[0].code} ${m[0].name}`, balance: toFixed2(r[0].bal) };
}

// ── GET /customers/deposit ──────────────────────────────────────────────
export async function getDepositOverview(req, res) {
  try {
    const cur = currentCutoffMonth();
    const year = parseInt(req.query.year, 10) || cur.year;
    const month = parseInt(req.query.month, 10) || cur.month;
    const outletId = req.query.outlet ? Number(req.query.outlet) : null;
    const search = String(req.query.search || "").trim().toLowerCase();
    const dormantOnly = req.query.dormant === "1";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 25));

    const { start, end } = cutoffRange(year, month);
    const today = todayWib();
    const dormantBefore = addMonths(today, -12);

    const [members] = await myWaschenPool.query(
      `SELECT c.id, c.name, c.phone, c.preferred_outlet_id, c.deposit_balance,
              DATE_FORMAT(c.last_transaction_at, '%Y-%m-%d') AS last_tx
       FROM mst_customer c
       WHERE c.deposit_balance <> 0 OR c.id IN (SELECT DISTINCT customer_id FROM tr_customer_deposit)${outletId ? " AND 1=1" : ""}`
    );
    const [topups] = await myWaschenPool.query(
      `SELECT customer_id, SUM(amount) AS amt, SUM(balance_after - balance_before - amount) AS bonus
       FROM tr_customer_deposit
       WHERE type = 'Topup' AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY customer_id`,
      [start, end]
    );
    const [used] = await myWaschenPool.query(
      `SELECT t.customer_id, SUM(l.amount) AS amt
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
       WHERE l.payment_method LIKE 'Potong Saldo%' AND t.is_delete_requested = 0
         AND l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY t.customer_id`,
      [start, end]
    );
    const topBy = new Map(topups.map((r) => [Number(r.customer_id), r]));
    const usedBy = new Map(used.map((r) => [Number(r.customer_id), Number(r.amt)]));
    const outlets = await getOutlets();
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));

    const all = members
      .map((m) => {
        const balance = toFixed2(m.deposit_balance);
        const dormant = balance > 0 && (!m.last_tx || m.last_tx < dormantBefore);
        const t = topBy.get(Number(m.id));
        return {
          id: Number(m.id),
          name: m.name,
          phone: m.phone,
          outlet_id: m.preferred_outlet_id ? Number(m.preferred_outlet_id) : null,
          outlet_name: m.preferred_outlet_id ? nameOf.get(Number(m.preferred_outlet_id)) || `Outlet #${m.preferred_outlet_id}` : "-",
          topup: toFixed2(t?.amt || 0),
          bonus: toFixed2(t?.bonus || 0),
          used: toFixed2(usedBy.get(Number(m.id)) || 0),
          balance,
          last_tx: m.last_tx,
          dormant,
        };
      })
      .filter((m) => !outletId || m.outlet_id === outletId);

    // KPI selalu dari seluruh member (cabang yang dipilih hanya menyaring tabel & ringkasan periode)
    const posBalance = toFixed2(all.reduce((s, m) => s + m.balance, 0));
    const acc = await accountBalance(end < today ? end : today);
    const diff = toFixed2(posBalance - acc.balance);
    const dormantList = all.filter((m) => m.dormant);

    let rows = all.filter((m) => m.balance !== 0 || m.topup || m.used);
    if (search) rows = rows.filter((m) => `${m.name} ${m.phone || ""}`.toLowerCase().includes(search));
    if (dormantOnly) rows = rows.filter((m) => m.dormant);
    rows.sort((a, b) => b.balance - a.balance);
    const total = rows.length;

    return res.json({
      period: { year, month, from: start, to: end },
      kpis: {
        pos_balance: posBalance,
        account: acc.account,
        account_balance: acc.balance,
        diff,
        matched: Math.abs(diff) < 1,
        active_members: all.filter((m) => m.balance > 0 && !m.dormant).length,
        members_with_balance: all.filter((m) => m.balance > 0).length,
        dormant_count: dormantList.length,
        dormant_amount: toFixed2(dormantList.reduce((s, m) => s + m.balance, 0)),
        topup_period: toFixed2(all.reduce((s, m) => s + m.topup, 0)),
        bonus_period: toFixed2(all.reduce((s, m) => s + m.bonus, 0)),
        used_period: toFixed2(all.reduce((s, m) => s + m.used, 0)),
      },
      outlets: outlets.map((o) => ({ id: o.id, name: o.name })),
      rows: rows.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    console.error("[getDepositOverview]", err);
    return res.status(500).json({ message: "Gagal memuat deposit member", error: err.message });
  }
}

// ── GET /customers/deposit/:id — mutasi satu member ─────────────────────
export async function getMemberMutations(req, res) {
  try {
    const id = Number(req.params.id);
    const [topups] = await myWaschenPool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS at, 'Top-up' AS jenis, amount,
              (balance_after - balance_before - amount) AS bonus, balance_after, payment_method, notes
       FROM tr_customer_deposit WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200`,
      [id]
    );
    const [usage] = await myWaschenPool.query(
      `SELECT DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i') AS at, 'Pemakaian' AS jenis, l.amount, 0 AS bonus,
              NULL AS balance_after, l.payment_method, CONCAT('Nota ', t.order_no) AS notes
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
       WHERE t.customer_id = ? AND l.payment_method LIKE 'Potong Saldo%' AND t.is_delete_requested = 0
       ORDER BY l.created_at DESC LIMIT 200`,
      [id]
    );
    const [c] = await myWaschenPool.query(`SELECT name, deposit_balance FROM mst_customer WHERE id = ?`, [id]);
    const rows = [...topups, ...usage]
      .map((r) => ({ ...r, amount: toFixed2(r.amount), bonus: toFixed2(r.bonus), balance_after: r.balance_after == null ? null : toFixed2(r.balance_after) }))
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    return res.json({ member: { id, name: c[0]?.name || "-", balance: toFixed2(c[0]?.deposit_balance || 0) }, rows });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat mutasi member", error: err.message });
  }
}
