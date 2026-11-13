import { pool } from "../../db/pool.js";

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD — TAMPILAN WIDGET PER PENGGUNA
// Disimpan sebagai daftar id widget berurutan di mst_dashboard_layout (satu baris per pengguna).
// Katalog widget ada di frontend; server hanya memastikan bentuk datanya wajar.
// ════════════════════════════════════════════════════════════════════════════

const MAX_WIDGETS = 30;
const userIdOf = (req) => Number(req.user?.id) || 0;

// GET /dashboard/layout → { layout: string[] | null }  (null = pakai tampilan bawaan)
export async function getLayout(req, res) {
  try {
    const uid = userIdOf(req);
    if (!uid) return res.json({ layout: null });
    const [[row]] = await pool.query(`SELECT layout FROM mst_dashboard_layout WHERE user_id = ?`, [uid]).then(([r]) => [r.length ? r : [null]]);
    if (!row) return res.json({ layout: null });
    let layout = null;
    try {
      const parsed = typeof row.layout === "string" ? JSON.parse(row.layout) : row.layout;
      if (Array.isArray(parsed)) layout = parsed.filter((x) => typeof x === "string");
    } catch {
      layout = null;
    }
    return res.json({ layout });
  } catch (err) {
    // Tabel belum dibuat (migrasi 002 belum dijalankan): dashboard tetap jalan dengan tampilan bawaan
    console.error("[dashboard.getLayout]", err.message);
    return res.json({ layout: null });
  }
}

// PUT /dashboard/layout  body: { layout: string[] }
export async function saveLayout(req, res) {
  try {
    const uid = userIdOf(req);
    if (!uid) return res.status(401).json({ message: "Pengguna tidak dikenali." });
    const raw = req.body?.layout;
    if (!Array.isArray(raw)) return res.status(422).json({ message: "Format tampilan tidak valid." });
    const layout = [...new Set(raw.filter((x) => typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x)))].slice(0, MAX_WIDGETS);
    await pool.query(
      `INSERT INTO mst_dashboard_layout (user_id, layout) VALUES (?, ?) ON DUPLICATE KEY UPDATE layout = VALUES(layout)`,
      [uid, JSON.stringify(layout)]
    );
    return res.json({ layout });
  } catch (err) {
    console.error("[dashboard.saveLayout]", err);
    return res.status(500).json({ message: "Gagal menyimpan tampilan dashboard. Pastikan migrasi 002 sudah dijalankan.", error: err.message });
  }
}

// DELETE /dashboard/layout → kembali ke tampilan bawaan
export async function resetLayout(req, res) {
  try {
    const uid = userIdOf(req);
    if (uid) await pool.query(`DELETE FROM mst_dashboard_layout WHERE user_id = ?`, [uid]);
    return res.json({ layout: null });
  } catch (err) {
    console.error("[dashboard.resetLayout]", err);
    return res.status(500).json({ message: "Gagal mengembalikan tampilan bawaan.", error: err.message });
  }
}
