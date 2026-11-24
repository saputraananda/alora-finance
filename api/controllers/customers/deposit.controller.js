import { pool, myWaschenPool, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { cutoffRange, currentCutoffMonth } from "../dashboard/dashboard.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// CUSTOMER > RIWAYAT DEPOSIT (deposit transaksi reguler — BUKAN deposit paket member)
// Deposit reguler = baris tr_customer_deposit tanpa membership_id; top-up paket member (membership_id terisi) tidak ikut.
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

    // Rentang tanggal: from/to (YYYY-MM-DD) bila dikirim, selain itu bulan cutoff year/month
    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
    const useRange = isDate(req.query.from) && isDate(req.query.to);
    const { start, end } = useRange ? { start: String(req.query.from), end: String(req.query.to) } : cutoffRange(year, month);
    const today = todayWib();
    const dormantBefore = addMonths(today, -12);

    const [members] = await myWaschenPool.query(
      `SELECT c.id, c.name, c.phone, c.preferred_outlet_id, c.deposit_balance,
              DATE_FORMAT(c.last_transaction_at, '%Y-%m-%d') AS last_tx
       FROM mst_customer c
       WHERE c.id IN (SELECT DISTINCT customer_id FROM tr_customer_deposit WHERE membership_id IS NULL)`
    );
    const [topups] = await myWaschenPool.query(
      `SELECT customer_id, SUM(amount) AS amt, SUM(balance_after - balance_before - amount) AS bonus
       FROM tr_customer_deposit
       WHERE type = 'Topup' AND membership_id IS NULL AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
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

    // Dua kartu: total deposit (top-up reguler pada periode) dan jumlah customer yang pernah deposit
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
        total_customers: all.length,
        customers_period: all.filter((m) => m.topup || m.used).length,
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

// ── GET /customers/deposit/:id — riwayat deposit reguler satu customer (Masuk = top-up, Keluar = dipakai bayar nota) ──
export async function getMemberMutations(req, res) {
  try {
    const id = Number(req.params.id);
    const outlets = await getOutlets();
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));
    const [topups] = await myWaschenPool.query(
      `SELECT id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS at, outlet_id, amount, (balance_after - balance_before - amount) AS bonus,
              balance_after, payment_method, payment_proof_url, notes
       FROM tr_customer_deposit WHERE customer_id = ? AND type = 'Topup' AND membership_id IS NULL ORDER BY created_at DESC LIMIT 200`,
      [id]
    );
    const [usage] = await myWaschenPool.query(
      `SELECT l.id, DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i') AS at, t.outlet_id, l.amount, l.payment_method, l.payment_proof_url,
              t.id AS transaction_id, t.order_no
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
       WHERE t.customer_id = ? AND l.payment_method LIKE 'Potong Saldo%' AND t.is_delete_requested = 0
       ORDER BY l.created_at DESC LIMIT 200`,
      [id]
    );
    const [c] = await myWaschenPool.query(`SELECT name, phone, deposit_balance FROM mst_customer WHERE id = ?`, [id]);
    const base = String(process.env.POS_ASSET_BASE_URL || "").replace(/\/+$/, "");
    const proof = (u) => (!u ? null : /^https?:\/\//i.test(u) ? u : base ? `${base}${u.startsWith("/") ? "" : "/"}${u}` : null);
    const rows = [
      ...topups.map((r) => ({
        key: `t${r.id}`, at: r.at, tipe: "Masuk", kategori: r.bonus > 0 ? "Top-up + bonus" : "Top-up deposit", sumber: r.payment_method || "-",
        keterangan: r.notes || "-", nominal: toFixed2(r.amount), proof: proof(r.payment_proof_url), has_proof: Boolean(r.payment_proof_url),
        outlet_name: nameOf.get(Number(r.outlet_id)) || "-", transaction_id: null, order_no: null,
      })),
      ...usage.map((r) => ({
        key: `u${r.id}`, at: r.at, tipe: "Keluar", kategori: "Pakai saldo", sumber: r.payment_method || "-",
        keterangan: `Nota ${r.order_no}`, nominal: -toFixed2(r.amount), proof: proof(r.payment_proof_url), has_proof: Boolean(r.payment_proof_url),
        outlet_name: nameOf.get(Number(r.outlet_id)) || "-", transaction_id: Number(r.transaction_id), order_no: r.order_no,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));
    return res.json({ member: { id, name: c[0]?.name || "-", phone: c[0]?.phone || null, balance: toFixed2(c[0]?.deposit_balance || 0) }, rows });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat riwayat deposit", error: err.message });
  }
}
