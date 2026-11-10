import { pool } from "../db/pool.js";

// ════════════════════════════════════════════════════════════════════════════
// Tanggal mulai (go-live) per cabang — Konsep hal. 28 "Fase 7: satu cabang dulu".
// Hari sebelum tanggal mulai cabang tidak diposting, tidak direkonsiliasi, dan tidak
// muncul di Perlu tindakan / Checklist. Cabang tanpa tanggal mulai = semua hari dihitung.
// ════════════════════════════════════════════════════════════════════════════

export async function loadStartDates() {
  const [rows] = await pool
    .query(`SELECT outlet_id, DATE_FORMAT(start_date,'%Y-%m-%d') AS d FROM mst_cabang_setting WHERE start_date IS NOT NULL`)
    .catch(() => [[]]);
  return new Map(rows.map((r) => [Number(r.outlet_id), r.d]));
}

/** true bila `date` berada sebelum tanggal mulai cabang. */
export function beforeStart(starts, outletId, date) {
  const s = starts.get(Number(outletId));
  return Boolean(s && String(date).slice(0, 10) < s);
}

export function startMessage(starts, outletId, outletName) {
  const s = starts.get(Number(outletId));
  return s ? `${outletName || "Cabang ini"} mulai memakai alfi tanggal ${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}. Tanggal sebelumnya tidak diproses.` : null;
}
