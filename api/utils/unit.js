import { myWaschenPool } from "../db/pool.js";

// ════════════════════════════════════════════════════════════════════════════
// UNIT USAHA (Waschen / Cleanox) untuk filter dashboard
//  • POS: unit Cleanox = baris layanan yang namanya memuat "Cleanox" (nama baru "Karpet Sedang (Cleanox)",
//    nama lama "Karpet Tebal - Cleanox"). Selain itu dianggap Waschen.
//  • Satu nota bisa berisi layanan dua unit, jadi nilai nota dibagi sesuai porsi nilai layanannya.
//  • Pembelian: unit dikenali dari nama perusahaan di SuperApp (mst_company), bukan id yang ditulis di kode.
//  • Jurnal belum punya dimensi unit: laba/beban per unit dialokasikan sesuai porsi pendapatan POS.
// ════════════════════════════════════════════════════════════════════════════

export const UNITS = ["waschen", "cleanox"];

/** 'waschen' | 'cleanox' | 'all' dari ?unit= */
export const parseUnit = (query = {}) => (UNITS.includes(query.unit) ? query.unit : "all");

/** Kondisi SQL baris layanan Cleanox (alias detail transaksi: d) */
export const IS_CLEANOX = `d.service_name LIKE '%cleanox%'`;

// Gabungan porsi per nota (alias hasil: us; alias nota: t)
export const UNIT_SHARE_JOIN = `LEFT JOIN (
  SELECT d.transaction_id, SUM(d.subtotal) AS total, SUM(CASE WHEN ${IS_CLEANOX} THEN d.subtotal ELSE 0 END) AS clx
  FROM tr_transaction_detail d GROUP BY d.transaction_id
) us ON us.transaction_id = t.id`;

/** Ekspresi porsi unit satu nota (0..1), dipakai bersama UNIT_SHARE_JOIN. 'all' → 1. */
export function unitShareExpr(unit) {
  if (unit === "cleanox") return `IF(us.total > 0, us.clx / us.total, 0)`;
  if (unit === "waschen") return `IF(us.total > 0, 1 - us.clx / us.total, 1)`;
  return "1";
}

/** Porsi unit dari penjualan POS pada rentang tanggal (0..1). 'all' → 1. */
export async function unitShare(unit, from, to, outletId = null) {
  if (unit === "all") return 1;
  const [[r]] = await myWaschenPool.query(
    `SELECT COALESCE(SUM(d.subtotal), 0) AS total, COALESCE(SUM(CASE WHEN ${IS_CLEANOX} THEN d.subtotal ELSE 0 END), 0) AS clx
     FROM tr_transaction_detail d JOIN tr_transaction t ON t.id = d.transaction_id
     WHERE t.order_date >= ? AND t.order_date < DATE_ADD(?, INTERVAL 1 DAY) AND t.is_delete_requested = 0
       ${outletId ? "AND t.outlet_id = ?" : ""}`,
    outletId ? [from, to, outletId] : [from, to]
  );
  const total = Number(r.total);
  if (total <= 0) return 0;
  const clx = Number(r.clx) / total;
  return unit === "cleanox" ? clx : 1 - clx;
}
