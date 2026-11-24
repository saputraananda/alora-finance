import { myWaschenPool, getOutlets } from "../../db/pool.js";

// ════════════════════════════════════════════════════════════════════════════
// CUSTOMER — daftar pelanggan (read-only dari POS)
// ════════════════════════════════════════════════════════════════════════════

// GET /customers?search=&outlet=&page=&limit=
// Keterangan tempat di bawah nama = alamat + blok + nomor rumah (sama dengan daftar pelanggan di my-waschen)
function placeLabel({ address, block, house_number }) {
  const street = String(address || "").trim();
  const blk = String(block || "").trim();
  const house = String(house_number || "").trim();
  const parts = [];
  if (street && street !== "-") parts.push(street);
  if (blk && !street.toLowerCase().includes(blk.toLowerCase())) parts.push(/^blok/i.test(blk) ? blk : `Blok ${blk}`);
  if (house && !street.toLowerCase().includes(house.toLowerCase())) parts.push(/^no.?/i.test(house) ? house : `No. ${house}`);
  return parts.join(", ");
}

export async function listCustomers(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 25));
    const search = String(req.query.search || "").trim();
    const outletId = req.query.outlet ? Number(req.query.outlet) : null;

    const where = ["c.is_active = 1"];
    const params = [];
    if (outletId) { where.push("c.preferred_outlet_id = ?"); params.push(outletId); }
    if (search) {
      where.push("(c.name LIKE ? OR c.phone LIKE ? OR c.customer_code LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const w = `WHERE ${where.join(" AND ")}`;

    const [[{ n }]] = await myWaschenPool.query(`SELECT COUNT(*) AS n FROM mst_customer c ${w}`, params);
    const [rows] = await myWaschenPool.query(
      `SELECT c.id, c.customer_code, c.name, c.phone, c.preferred_outlet_id, c.home_branch,
              c.address, c.block, c.house_number,
              t.name AS tier, p.name AS member_package, m.status AS member_status,
              c.total_orders, c.deposit_balance,
              DATE_FORMAT(c.created_at, '%Y-%m-%d') AS registered_at,
              DATE_FORMAT(c.last_transaction_at, '%Y-%m-%d') AS last_tx
       FROM mst_customer c
       LEFT JOIN mst_customer_tier t ON t.id = c.spending_tier_id
       LEFT JOIN tr_membership m ON m.id = c.active_membership_id
       LEFT JOIN mst_membership_package p ON p.id = m.package_id
       ${w}
       ORDER BY c.last_transaction_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const outlets = await getOutlets();
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));
    return res.json({
      rows: rows.map((r) => ({
        id: Number(r.id),
        code: r.customer_code,
        name: r.name,
        phone: r.phone,
        area: placeLabel(r) || null,
        outlet_name: r.preferred_outlet_id ? nameOf.get(Number(r.preferred_outlet_id)) || r.home_branch || "-" : r.home_branch || "-",
        tier: r.tier,
        member: r.member_package && r.member_status === "Active" ? r.member_package : null,
        total_orders: Number(r.total_orders) || 0,
        deposit_balance: Number(r.deposit_balance) || 0,
        registered_at: r.registered_at,
        last_tx: r.last_tx,
      })),
      outlets: outlets.map((o) => ({ id: o.id, name: o.name })),
      pagination: { page, limit, total: Number(n), totalPages: Math.max(1, Math.ceil(Number(n) / limit)) },
    });
  } catch (err) {
    console.error("[listCustomers]", err);
    return res.status(500).json({ message: "Gagal memuat daftar customer", error: err.message });
  }
}
