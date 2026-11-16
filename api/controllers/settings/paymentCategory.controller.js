import { pool } from "../../db/pool.js";

// ════════════════════════════════════════════════════════════════════════════
// PENGATURAN > KATEGORI PAYMENT
// Master "alokasi / kategori" yang dipilih Finance saat mencocokkan mutasi bank. Dikelola sendiri oleh Finance.
// Tidak dihapus, hanya dinonaktifkan (pencocokan lama tetap menampilkan namanya).
// Jenis: IN (uang masuk), OUT (uang keluar), BOTH (keduanya).
// ════════════════════════════════════════════════════════════════════════════

const DIRS = ["IN", "OUT", "BOTH"];
const audit = async (action, id, after, uid) => {
  try {
    await pool.query(`INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('mst_payment_category', ?, ?, ?, ?)`, [id, action, uid || null, JSON.stringify(after)]);
  } catch {
    /* audit tidak menggagalkan */
  }
};

// Kode dibuat otomatis dari nama (huruf besar, angka, garis bawah); bentrok diberi nomor
async function makeCode(label) {
  const base = String(label).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "KATEGORI";
  let code = base;
  for (let i = 2; i < 100; i++) {
    const [r] = await pool.query(`SELECT 1 FROM mst_payment_category WHERE code = ?`, [code]);
    if (!r.length) return code;
    code = `${base}_${i}`;
  }
  return `${base}_${Date.now() % 100000}`;
}

// GET /settings/payment-categories
export async function listPaymentCategories(_req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.label, c.direction, c.note, c.sort_no, c.is_active,
              (SELECT COUNT(*) FROM tr_recon_match_item i WHERE i.side = 'BANK' AND i.category_code = c.code) AS used
       FROM mst_payment_category c ORDER BY c.is_active DESC, c.sort_no, c.label`
    ).catch(async (e) => {
      // tabel pencocokan belum ada (migrasi 004): tetap tampilkan daftar
      if (!/tr_recon_match_item/.test(e.message)) throw e;
      return pool.query(`SELECT id, code, label, direction, note, sort_no, is_active, 0 AS used FROM mst_payment_category ORDER BY is_active DESC, sort_no, label`);
    });
    return res.json({ data: rows.map((r) => ({ ...r, is_active: Number(r.is_active) === 1, used: Number(r.used) })) });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat Kategori Payment", error: err.message });
  }
}

const clean = (b) => ({
  label: String(b?.label || "").trim().slice(0, 120),
  direction: DIRS.includes(b?.direction) ? b.direction : "BOTH",
  note: String(b?.note || "").trim().slice(0, 255) || null,
});

async function labelTaken(label, exceptId = 0) {
  const [r] = await pool.query(`SELECT id FROM mst_payment_category WHERE LOWER(label) = LOWER(?) AND is_active = 1 AND id <> ?`, [label, exceptId]);
  return r.length > 0;
}

// POST /settings/payment-categories {label, direction, note}
export async function createPaymentCategory(req, res) {
  try {
    const v = clean(req.body);
    if (!v.label) return res.status(422).json({ message: "Nama kategori wajib diisi." });
    if (await labelTaken(v.label)) return res.status(422).json({ message: "Sudah ada kategori aktif dengan nama yang sama." });
    const [[mx]] = await pool.query(`SELECT COALESCE(MAX(sort_no), 0) AS m FROM mst_payment_category`).then(([r]) => [r]);
    const code = await makeCode(v.label);
    const [ins] = await pool.query(`INSERT INTO mst_payment_category (code, label, direction, note, sort_no, created_by) VALUES (?, ?, ?, ?, ?, ?)`, [code, v.label, v.direction, v.note, Number(mx.m) + 1, req.user?.id || null]);
    await audit("CREATE", ins.insertId, { code, ...v }, req.user?.id);
    return res.status(201).json({ message: "Kategori ditambahkan.", id: ins.insertId, code });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menambah kategori", error: err.message });
  }
}

// PUT /settings/payment-categories/:id {label, direction, note, sort_no, is_active}
export async function updatePaymentCategory(req, res) {
  try {
    const id = Number(req.params.id);
    const [[cur]] = await pool.query(`SELECT * FROM mst_payment_category WHERE id = ?`, [id]).then(([r]) => [r.length ? r : [null]]);
    if (!cur) return res.status(404).json({ message: "Kategori tidak ditemukan." });
    const v = clean({ ...cur, ...req.body });
    if (!v.label) return res.status(422).json({ message: "Nama kategori wajib diisi." });
    const active = req.body?.is_active === undefined ? Number(cur.is_active) === 1 : Boolean(req.body.is_active);
    if (active && (await labelTaken(v.label, id))) return res.status(422).json({ message: "Sudah ada kategori aktif dengan nama yang sama." });
    // Jenis tidak boleh berubah bila kategori sudah dipakai pencocokan (supaya arah lama tetap konsisten)
    if (v.direction !== cur.direction) {
      const [[u]] = await pool.query(`SELECT COUNT(*) AS n FROM tr_recon_match_item WHERE side = 'BANK' AND category_code = ?`, [cur.code]).then(([r]) => [r]).catch(() => [[{ n: 0 }]]);
      if (Number(u.n) > 0) return res.status(422).json({ message: "Kategori ini sudah dipakai pada pencocokan, jenisnya tidak bisa diubah. Nonaktifkan lalu buat kategori baru." });
    }
    const sort = Number.isFinite(Number(req.body?.sort_no)) ? Number(req.body.sort_no) : cur.sort_no;
    await pool.query(`UPDATE mst_payment_category SET label = ?, direction = ?, note = ?, sort_no = ?, is_active = ? WHERE id = ?`, [v.label, v.direction, v.note, sort, active ? 1 : 0, id]);
    await audit("UPDATE", id, { ...v, sort_no: sort, is_active: active }, req.user?.id);
    return res.json({ message: "Kategori disimpan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan kategori", error: err.message });
  }
}
