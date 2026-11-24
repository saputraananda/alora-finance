import { myWaschenPool, mainPool, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";

// ════════════════════════════════════════════════════════════════════════════
// RINCIAN NOTA (read-only dari POS) — dipakai Front Office Cashier, Customer, dan Account Receivable.
// Bukti pembayaran disimpan POS sebagai path (/uploads/...). Alamat lengkapnya = POS_ASSET_BASE_URL + path.
// ════════════════════════════════════════════════════════════════════════════

const assetUrl = (p) => {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(process.env.POS_ASSET_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}${p.startsWith("/") ? "" : "/"}${p}` : null;
};

export async function employeeNames(ids) {
  const uniq = [...new Set(ids.map(Number).filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;
  try {
    const [rows] = await mainPool.query("SELECT employee_id, full_name FROM mst_employee WHERE employee_id IN (?)", [uniq]);
    rows.forEach((r) => map.set(Number(r.employee_id), r.full_name));
  } catch (err) {
    console.error("[nota] nama pegawai gagal dibaca:", err.message);
  }
  return map;
}

// GET /pos/nota/:id  (id transaksi POS) atau ?order_no=
export async function getNota(req, res) {
  try {
    const byNo = String(req.query.order_no || "").trim();
    const id = Number(req.params.id) || 0;
    const [tx] = await myWaschenPool.query(
      byNo
        ? "SELECT t.*, c.name AS customer_name, c.phone AS customer_phone FROM tr_transaction t LEFT JOIN mst_customer c ON c.id = t.customer_id WHERE t.order_no = ? LIMIT 1"
        : "SELECT t.*, c.name AS customer_name, c.phone AS customer_phone FROM tr_transaction t LEFT JOIN mst_customer c ON c.id = t.customer_id WHERE t.id = ? LIMIT 1",
      [byNo || id]
    );
    const t = tx[0];
    if (!t) return res.status(404).json({ message: "Nota tidak ditemukan." });

    const [items] = await myWaschenPool.query(
      "SELECT service_name, qty, unit, unit_price, subtotal, is_cleanox FROM tr_transaction_detail WHERE transaction_id = ? ORDER BY id",
      [t.id]
    );
    const [pays] = await myWaschenPool.query(
      "SELECT id, log_type, amount, payment_method, payment_proof_url, notes, cashier_employee_id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS at FROM tr_payment_log WHERE transaction_id = ? ORDER BY id",
      [t.id]
    );
    const outlets = await getOutlets();
    const names = await employeeNames([t.cashier_employee_id, ...pays.map((p) => p.cashier_employee_id)]);

    const proofs = [];
    if (t.payment_proof_url) proofs.push({ label: `Pembayaran ${t.payment_method || ""}`.trim(), path: t.payment_proof_url, url: assetUrl(t.payment_proof_url) });
    pays.forEach((p) => {
      if (p.payment_proof_url && !proofs.some((x) => x.path === p.payment_proof_url)) proofs.push({ label: `${p.payment_method || "Pembayaran"} · ${p.at}`, path: p.payment_proof_url, url: assetUrl(p.payment_proof_url) });
    });

    return res.json({
      nota: {
        id: Number(t.id),
        order_no: t.order_no,
        outlet_name: outlets.find((o) => o.id === Number(t.outlet_id))?.name || `Outlet #${t.outlet_id}`,
        customer_name: t.customer_name || "-",
        customer_phone: t.customer_phone || null,
        cashier: names.get(Number(t.cashier_employee_id)) || t.legacy_cashier_name || null,
        order_date: t.order_date,
        paid_at: t.paid_at,
        order_category: t.order_category,
        speed_name: t.speed_name,
        total_weight_kg: Number(t.total_weight_kg) || 0,
        total_pcs: Number(t.total_pcs) || 0,
        subtotal: toFixed2(t.subtotal),
        speed_surcharge: toFixed2(t.speed_surcharge),
        discount_amount: toFixed2(t.discount_amount),
        discount_notes: t.discount_notes,
        grand_total: toFixed2(t.grand_total),
        paid_amount: toFixed2(t.paid_amount),
        payment_status: t.payment_status,
        payment_method: t.payment_method,
        work_status: t.work_status,
        special_notes: t.special_notes,
        is_void: Number(t.is_delete_requested) === 1,
      },
      items: items.map((i) => ({ ...i, qty: Number(i.qty), unit_price: toFixed2(i.unit_price), subtotal: toFixed2(i.subtotal), is_cleanox: Number(i.is_cleanox) === 1 })),
      payments: pays.map((p) => ({ ...p, amount: toFixed2(p.amount), cashier: names.get(Number(p.cashier_employee_id)) || null })),
      proofs,
      proof_base_configured: Boolean(process.env.POS_ASSET_BASE_URL),
    });
  } catch (err) {
    console.error("[getNota]", err);
    return res.status(500).json({ message: "Gagal memuat rincian nota", error: err.message });
  }
}
