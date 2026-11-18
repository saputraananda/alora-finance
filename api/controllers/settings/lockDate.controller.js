import { pool } from "../../db/pool.js";
import { LOCK_DATE_KEY, getLockBeforeDate } from "../../utils/dayLock.js";

// ════════════════════════════════════════════════════════════════════════════
// PENGATURAN > KUNCI TANGGAL
// Satu tanggal batas, diatur Finance sendiri. Jurnal bertanggal s/d tanggal itu (inklusif)
// tidak bisa dibuat, diubah, diposting, atau dibalik ke tanggal itu, untuk semua cabang dan Pusat.
// Disimpan di mst_app_setting (k = lock_before_date). Kosong = tidak ada batas.
// ════════════════════════════════════════════════════════════════════════════

const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

async function state() {
  const [r] = await pool.query(`SELECT v, updated_at FROM mst_app_setting WHERE k = ?`, [LOCK_DATE_KEY]);
  const [log] = await pool
    .query(`SELECT actor_id, changed_at, before_value, after_value FROM tr_audit_logs WHERE entity = 'mst_app_setting' AND entity_id = 0 ORDER BY id DESC LIMIT 5`)
    .catch(() => [[]]);
  return {
    lock_before_date: await getLockBeforeDate(),
    updated_at: r[0]?.updated_at || null,
    today: todayWib(),
    history: log.map((l) => ({
      changed_at: l.changed_at,
      actor_id: l.actor_id,
      before: typeof l.before_value === "string" ? JSON.parse(l.before_value)?.lock_before_date ?? null : l.before_value?.lock_before_date ?? null,
      after: typeof l.after_value === "string" ? JSON.parse(l.after_value)?.lock_before_date ?? null : l.after_value?.lock_before_date ?? null,
    })),
  };
}

// GET /settings/lock-date
export async function getLockDate(_req, res) {
  try {
    return res.json(await state());
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat batas kunci tanggal", error: err.message });
  }
}

// PUT /settings/lock-date {date: 'YYYY-MM-DD' | null}
export async function saveLockDate(req, res) {
  try {
    const raw = req.body?.date;
    const date = raw ? String(raw).slice(0, 10) : null;
    if (date && !isDate(date)) return res.status(422).json({ message: "Tanggal tidak valid." });
    if (date && date >= todayWib()) return res.status(422).json({ message: "Batas kunci harus sebelum hari ini, supaya jurnal hari berjalan tetap bisa dibuat." });

    const before = await getLockBeforeDate();
    if (before === date) return res.json({ message: "Tidak ada perubahan.", ...(await state()) });

    await pool.query(
      `INSERT INTO mst_app_setting (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`,
      [LOCK_DATE_KEY, date]
    );
    await pool
      .query(
        `INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, before_value, after_value) VALUES ('mst_app_setting', 0, 'UPDATE', ?, ?, ?)`,
        [req.user?.id || null, JSON.stringify({ lock_before_date: before }), JSON.stringify({ lock_before_date: date })]
      )
      .catch(() => {});
    const d = (x) => `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}`;
    return res.json({ message: date ? `Batas kunci tanggal diatur ke ${d(date)}.` : "Batas kunci tanggal dihapus.", ...(await state()) });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan batas kunci tanggal", error: err.message });
  }
}
