import { pool } from "../db/pool.js";

// ════════════════════════════════════════════════════════════════════════════
// Penentuan akun per cabang.
// Pemetaan global peran → akun ada di mst_account_map. Dua peran bisa ditimpa per cabang
// lewat Pengaturan > Cabang & metode bayar:
//   KAS  → akun kas cabang itu       (mst_cabang_setting.cash_account_id)
//   BANK → akun bank rekening cabang (mst_bank_account.account_id)
// Bila tidak diatur, dipakai pemetaan global.
// ════════════════════════════════════════════════════════════════════════════

export async function loadOutletOverrides() {
  const [cash] = await pool.query(
    `SELECT s.outlet_id, a.id AS account_id, a.code, a.name
     FROM mst_cabang_setting s JOIN mst_coa a ON a.id = s.cash_account_id
     WHERE s.cash_account_id IS NOT NULL`
  );
  const [banks] = await pool.query(
    `SELECT b.outlet_id, a.id AS account_id, a.code, a.name
     FROM mst_bank_account b JOIN mst_coa a ON a.id = b.account_id
     WHERE b.is_active = 1 AND b.account_id IS NOT NULL AND b.outlet_id IS NOT NULL
     ORDER BY b.id`
  );
  const kas = new Map(cash.map((r) => [Number(r.outlet_id), r]));
  const bank = new Map();
  banks.forEach((r) => {
    if (!bank.has(Number(r.outlet_id))) bank.set(Number(r.outlet_id), r);
  });

  return {
    /** Pemetaan akun untuk satu cabang (global + penimpaan KAS/BANK). */
    forOutlet(outletId, accMap) {
      const oid = Number(outletId);
      const out = { ...accMap };
      if (kas.has(oid)) out.KAS = { role: "KAS", ...kas.get(oid) };
      if (bank.has(oid)) out.BANK = { role: "BANK", ...bank.get(oid) };
      return out;
    },
    cashAccountIds: [...kas.values()].map((r) => Number(r.account_id)),
  };
}
