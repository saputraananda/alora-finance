import { pool, getOutlets } from "../db/pool.js";

// ════════════════════════════════════════════════════════════════════════════
// KUNCI HARI
// Sebuah hari dikunci per cabang saat Rekonsiliasi harian "Setujui & kunci hari".
// Setelah itu tidak ada jurnal (POS maupun manual) yang boleh masuk ke tanggal itu
// untuk cabang tersebut. Koreksi dibuat sebagai jurnal baru di hari berjalan
// (mis. jurnal balik) — sesuai aturan "Refund setelah hari dikunci" di dokumen konsep.
// ════════════════════════════════════════════════════════════════════════════

/** Dari daftar id cabang, kembalikan id yang hari `date`-nya sudah dikunci. */
export async function lockedOutlets(date, outletIds = []) {
  const ids = [...new Set(outletIds.filter(Boolean).map(Number))];
  if (!ids.length) return [];
  const [rows] = await pool.query(
    `SELECT outlet_id FROM tr_recon_daily WHERE rec_date = ? AND status = 'APPROVED' AND outlet_id IN (?)`,
    [String(date).slice(0, 10), ids]
  );
  return rows.map((r) => Number(r.outlet_id));
}

export async function isDayLocked(outletId, date) {
  return (await lockedOutlets(date, [outletId])).length > 0;
}

/** Pesan galat bila ada cabang yang harinya terkunci; null bila aman. */
export async function dayLockMessage(date, outletIds = []) {
  const locked = await lockedOutlets(date, outletIds);
  if (!locked.length) return null;
  const outlets = await getOutlets();
  const names = locked.map((id) => outlets.find((o) => o.id === id)?.name || `Outlet #${id}`);
  const d = String(date).slice(0, 10);
  return `Tanggal ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} sudah dikunci untuk ${names.join(", ")}. Gunakan tanggal hari berjalan untuk koreksi.`;
}
