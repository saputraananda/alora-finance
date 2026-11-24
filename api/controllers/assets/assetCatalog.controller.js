import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, mainPool, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { LIVE_POSTED, monthlyOf, assetPayload } from "./assets.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// DAFTAR ASET = Manajemen Aset SuperApp (hanya baca). Alfi hanya menambah data penyusutan per kode aset.
// ════════════════════════════════════════════════════════════════════════════
const KONDISI = ["Baik", "Rusak Ringan", "Rusak Berat", "Dalam Perbaikan", "Tidak Layak Pakai"];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const photoUrl = (p) => (p ? `/api/finance-ho/assets/photo/${encodeURIComponent(path.basename(String(p)))}` : null);

// Data penyusutan alfi untuk daftar kode aset: Map(kode → ringkasan)
async function financeByCode(codes) {
  if (!codes.length) return new Map();
  const [rows] = await pool.query(
    `SELECT a.id, a.code, a.cost, a.salvage, a.opening_accum, a.life_months, a.status,
            a.opening_accum + COALESCE(SUM(CASE WHEN ${LIVE_POSTED} THEN d.amount END), 0) AS accum
     FROM mst_asset a LEFT JOIN tr_depreciation d ON d.asset_id = a.id LEFT JOIN tr_journal_entries je ON je.id = d.journal_id
     WHERE a.code IN (?) GROUP BY a.id`,
    [codes]
  );
  return new Map(rows.map((r) => [r.code, { id: r.id, cost: toFixed2(r.cost), accum: toFixed2(r.accum), book_value: toFixed2(Number(r.cost) - Number(r.accum)), monthly: monthlyOf(r), status: r.status }]));
}

// Kategori aset dari alfi (Pengaturan › Kategori Aset): Map(kode → {id, name})
async function categoryByCode(codes) {
  if (!codes.length) return new Map();
  const [rows] = await pool.query(`SELECT m.kode_aset, c.id, c.name FROM mst_asset_category_map m JOIN mst_asset_category c ON c.id = m.category_id WHERE m.kode_aset IN (?)`, [codes]);
  return new Map(rows.map((r) => [r.kode_aset, { id: r.id, name: r.name }]));
}

// ── GET /assets?search=&sub_kategori=&outlet_id=&kondisi=&page=&limit= ──────────
export async function getAssets(req, res) {
  try {
    const { search = "", category_id = "", outlet_id = "", kondisi = "" } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 24));
    let where = "a.is_deleted = 0 AND a.is_active = 1";
    const params = [];
    if (search.trim()) {
      where += " AND (a.kode_aset LIKE ? OR a.nama_aset LIKE ? OR a.brand LIKE ? OR a.no_seri LIKE ?)";
      const t = `%${search.trim()}%`;
      params.push(t, t, t, t);
    }
    if (category_id) {
      // category_id = id kategori alfi, atau "none" = belum dikategorikan
      const [m] = category_id === "none"
        ? await pool.query("SELECT kode_aset FROM mst_asset_category_map")
        : await pool.query("SELECT kode_aset FROM mst_asset_category_map WHERE category_id = ?", [Number(category_id)]);
      const codes = m.map((r) => r.kode_aset);
      if (category_id === "none") { if (codes.length) { where += " AND a.kode_aset NOT IN (?)"; params.push(codes); } }
      else if (codes.length) { where += " AND a.kode_aset IN (?)"; params.push(codes); }
      else where += " AND 1 = 0";
    }
    if (kondisi) { where += " AND a.kondisi = ?"; params.push(kondisi); }
    if (outlet_id === "none") where += " AND a.outlet_id IS NULL";
    else if (outlet_id) { where += " AND a.outlet_id = ?"; params.push(Number(outlet_id)); }
    const [[{ total }]] = await mainPool.query(`SELECT COUNT(*) AS total FROM mst_aset a WHERE ${where}`, params);
    const [rows] = await mainPool.query(
      `SELECT a.id, a.kode_aset, a.nama_aset, a.sub_kategori, a.brand, a.model, a.no_seri, a.jumlah, a.satuan, a.kondisi, a.outlet_id, a.lokasi_nama,
              (SELECT photo_path FROM tr_aset_photos ph WHERE ph.aset_id = a.id ORDER BY ph.created_at LIMIT 1) AS photo
       FROM mst_aset a WHERE ${where} ORDER BY a.outlet_id IS NULL, a.outlet_id, a.kode_aset LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const [outlets, fin, cats, [catList]] = await Promise.all([getOutlets(), financeByCode(rows.map((r) => r.kode_aset)), categoryByCode(rows.map((r) => r.kode_aset)), pool.query("SELECT id, name FROM mst_asset_category WHERE is_active = 1 ORDER BY sort_order, name")]);
    const nameOf = new Map(outlets.map((o) => [Number(o.id), o.name]));
    return res.json({
      data: rows.map((r) => ({
        id: r.id, code: r.kode_aset, name: r.nama_aset, category: cats.get(r.kode_aset)?.name || null, category_id: cats.get(r.kode_aset)?.id || null, brand: r.brand, model: r.model, serial: r.no_seri,
        qty: r.jumlah, unit: r.satuan, condition: r.kondisi, outlet_id: r.outlet_id,
        outlet_name: r.outlet_id ? nameOf.get(Number(r.outlet_id)) || `Outlet #${r.outlet_id}` : r.lokasi_nama || "Pusat",
        photo: photoUrl(r.photo), finance: fin.get(r.kode_aset) || null,
      })),
      total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
      meta: { outlets: outlets.map((o) => ({ id: o.id, name: o.name })), categories: catList, conditions: KONDISI },
    });
  } catch (err) {
    console.error("[getAssets]", err);
    return res.status(500).json({ message: "Gagal memuat daftar aset", error: err.message });
  }
}

// ── GET /assets/:id/detail — detail + foto + riwayat maintenance + data penyusutan ──────
export async function getAssetDetail(req, res) {
  try {
    const [[a]] = await mainPool.query(
      `SELECT a.*, c.company_name, e.full_name AS pic_name FROM mst_aset a LEFT JOIN mst_company c ON c.company_id = a.company_id LEFT JOIN mst_employee e ON e.employee_id = a.pic_employee_id
       WHERE a.id = ? AND a.is_deleted = 0`,
      [req.params.id]
    ).then(([r]) => [r]);
    if (!a) return res.status(404).json({ message: "Aset tidak ditemukan." });
    const [[photos], [maint], outlets] = await Promise.all([
      mainPool.query(`SELECT id, photo_path, caption FROM tr_aset_photos WHERE aset_id = ? ORDER BY created_at`, [a.id]),
      mainPool.query(
        `SELECT m.id, m.tipe, m.deskripsi, DATE_FORMAT(m.tanggal_mulai,'%Y-%m-%d') AS start, DATE_FORMAT(m.tanggal_selesai,'%Y-%m-%d') AS finish, m.biaya, m.vendor, m.status, m.catatan, e.full_name AS by_name
         FROM tr_aset_maintenance m LEFT JOIN mst_employee e ON e.employee_id = m.created_by WHERE m.aset_id = ? ORDER BY m.tanggal_mulai DESC, m.id DESC`,
        [a.id]
      ),
      getOutlets(),
    ]);
    const [[f]] = await pool.query(
      `SELECT a.*, DATE_FORMAT(a.acquisition_date,'%Y-%m-%d') AS acq, a.opening_accum + COALESCE(SUM(CASE WHEN ${LIVE_POSTED} THEN d.amount END), 0) AS accum,
              COUNT(CASE WHEN ${LIVE_POSTED} THEN 1 END) AS months_done
       FROM mst_asset a LEFT JOIN tr_depreciation d ON d.asset_id = a.id LEFT JOIN tr_journal_entries je ON je.id = d.journal_id WHERE a.code = ? GROUP BY a.id`,
      [a.kode_aset]
    ).then(([r]) => [r.length ? r : [null]]);
    const outlet = outlets.find((o) => Number(o.id) === Number(a.outlet_id));
    const myCat = (await categoryByCode([a.kode_aset])).get(a.kode_aset);
    return res.json({
      asset: {
        id: a.id, code: a.kode_aset, name: a.nama_aset, category: myCat?.name || null, category_id: myCat?.id || null, brand: a.brand, model: a.model, serial: a.no_seri, qty: a.jumlah, unit: a.satuan,
        condition: a.kondisi, company: a.company_name, pic: a.pic_name, location: a.lokasi_nama, outlet_id: a.outlet_id, outlet_name: outlet?.name || null,
        photos: photos.map((p) => ({ id: p.id, url: photoUrl(p.photo_path), caption: p.caption })),
        maintenance: maint.map((m) => ({ ...m, biaya: toFixed2(m.biaya) })),
        maintenance_total: toFixed2(maint.filter((m) => m.status !== "dibatalkan").reduce((s, m) => s + Number(m.biaya || 0), 0)),
        finance: f ? {
          acquisition_date: f.acq, cost: toFixed2(f.cost), salvage: toFixed2(f.salvage), opening_accum: toFixed2(f.opening_accum), life_months: f.life_months,
          accum: toFixed2(f.accum), book_value: toFixed2(Number(f.cost) - Number(f.accum)), monthly: monthlyOf(f), months_done: Number(f.months_done),
          status: f.status, disposed_at: f.disposed_at ? String(f.disposed_at).slice(0, 10) : null, locked: Number(f.months_done) > 0,
        } : null,
      },
    });
  } catch (err) {
    console.error("[getAssetDetail]", err);
    return res.status(500).json({ message: "Gagal memuat detail aset", error: err.message });
  }
}

// ── PUT /assets/finance/:kode {acquisition_date, cost, salvage, opening_accum, life_months} — data penyusutan per kode aset ─────
export async function saveAssetFinance(req, res) {
  try {
    const code = String(req.params.kode || "").trim();
    const [[a]] = await mainPool.query(`SELECT kode_aset, nama_aset, sub_kategori, outlet_id FROM mst_aset WHERE kode_aset = ? AND is_deleted = 0`, [code]).then(([r]) => [r]);
    if (!a) return res.status(404).json({ message: "Aset tidak ditemukan di Manajemen Aset." });
    const p = assetPayload({ ...req.body, code: a.kode_aset, name: a.nama_aset, category: a.sub_kategori, outlet_id: a.outlet_id });
    if (p.error) return res.status(422).json({ message: p.error });
    const v = p.value;
    const [[ex]] = await pool.query(
      `SELECT a.*, DATE_FORMAT(a.acquisition_date,'%Y-%m-%d') AS acq,
              (SELECT COUNT(*) FROM tr_depreciation d JOIN tr_journal_entries je ON je.id = d.journal_id WHERE d.asset_id = a.id AND ${LIVE_POSTED}) AS deps
       FROM mst_asset a WHERE a.code = ?`,
      [code]
    ).then(([r]) => [r.length ? r : [null]]);
    if (!ex) {
      await pool.query(
        `INSERT INTO mst_asset (code, name, category, outlet_id, acquisition_date, cost, salvage, opening_accum, life_months, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [v.code, v.name, v.category, v.outlet_id, v.acquisition_date, v.cost, v.salvage, v.opening_accum, v.life_months, v.notes, req.user?.id || null]
      );
      return res.status(201).json({ message: `Data penyusutan ${code} disimpan.` });
    }
    const changed = toFixed2(ex.cost) !== v.cost || toFixed2(ex.salvage) !== v.salvage || toFixed2(ex.opening_accum) !== v.opening_accum || Number(ex.life_months) !== v.life_months || ex.acq !== v.acquisition_date;
    if (ex.deps > 0 && changed) return res.status(422).json({ message: "Harga, nilai sisa, umur, dan tanggal perolehan tidak bisa diubah setelah ada penyusutan." });
    await pool.query(`UPDATE mst_asset SET name=?, category=?, outlet_id=?, acquisition_date=?, cost=?, salvage=?, opening_accum=?, life_months=? WHERE id=?`, [v.name, v.category, v.outlet_id, v.acquisition_date, v.cost, v.salvage, v.opening_accum, v.life_months, ex.id]);
    return res.json({ message: `Data penyusutan ${code} diperbarui.` });
  } catch (err) {
    console.error("[saveAssetFinance]", err);
    return res.status(500).json({ message: "Gagal menyimpan data penyusutan", error: err.message });
  }
}

// ── GET /assets/photo/:file?thumb=1 — foto dari folder assets SuperApp (tanpa token agar bisa dipakai <img>; nama file acak) ─────
export async function getAssetPhoto(req, res) {
  try {
    const base = process.env.SUPERAPP_ASSETS_DIR;
    const file = path.basename(String(req.params.file || ""));
    if (!/^[\w\-. ]+$/.test(file)) return res.status(404).end();
    const orig = base ? path.join(base, "aset_photos", file) : null;
    if (!orig || !fs.existsSync(orig)) {
      // File tidak ada di folder lokal (mis. di komputer dev) → ambil dari server SuperApp (SUPERAPP_ASSET_BASE_URL)
      const remote = String(process.env.SUPERAPP_ASSET_BASE_URL || "").replace(/\/+$/, "");
      if (!remote) return res.status(404).end();
      const f = encodeURIComponent(file);
      return res.redirect(302, req.query.thumb ? `${remote}/aset/thumb/${f}` : `${remote}/assets/aset_photos/${f}`);
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (req.query.thumb) {
      const dir = path.join(__dirname, "..", "..", "..", "storage", "aset-thumbs");
      const thumb = path.join(dir, `${file.replace(/\.[^.]+$/, "")}_thumb.webp`);
      try {
        if (!fs.existsSync(thumb)) {
          fs.mkdirSync(dir, { recursive: true });
          const { default: sharp } = await import("sharp");
          sharp.concurrency(1);
          await sharp(orig).resize(420, 315, { fit: "cover", withoutEnlargement: true }).webp({ quality: 70 }).toFile(thumb);
        }
        res.setHeader("Content-Type", "image/webp");
        return res.sendFile(thumb);
      } catch (e) {
        console.warn("[getAssetPhoto] thumb gagal, kirim asli:", e.message);
      }
    }
    return res.sendFile(orig);
  } catch (err) {
    return res.status(500).end();
  }
}

// ════════════════ Kategori aset (Pengaturan › Kategori Aset) ════════════════
// GET /assets/categories → semua kategori + jumlah aset di tiap kategori
export async function listAssetCategories(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.sort_order, c.is_active, COUNT(m.kode_aset) AS asset_count
       FROM mst_asset_category c LEFT JOIN mst_asset_category_map m ON m.category_id = c.id GROUP BY c.id ORDER BY c.sort_order, c.name`
    );
    const [[{ mapped }]] = await pool.query("SELECT COUNT(*) AS mapped FROM mst_asset_category_map");
    const [[{ total }]] = await mainPool.query("SELECT COUNT(*) AS total FROM mst_aset WHERE is_deleted = 0 AND is_active = 1");
    return res.json({ data: rows.map((r) => ({ ...r, is_active: Number(r.is_active) === 1, asset_count: Number(r.asset_count) })), uncategorized: Math.max(0, Number(total) - Number(mapped)) });
  } catch (err) {
    console.error("[listAssetCategories]", err);
    return res.status(500).json({ message: "Gagal memuat kategori aset", error: err.message });
  }
}

const cleanName = (v) => String(v || "").trim().replace(/\s+/g, " ");

// POST /assets/categories {name}
export async function createAssetCategory(req, res) {
  try {
    const name = cleanName(req.body.name);
    if (!name) return res.status(422).json({ message: "Nama kategori wajib diisi." });
    if (name.length > 100) return res.status(422).json({ message: "Nama kategori maksimal 100 karakter." });
    const [dup] = await pool.query("SELECT id FROM mst_asset_category WHERE name = ?", [name]);
    if (dup.length) return res.status(422).json({ message: `Kategori "${name}" sudah ada.` });
    const [[{ mx }]] = await pool.query("SELECT COALESCE(MAX(sort_order), 0) AS mx FROM mst_asset_category");
    const [r] = await pool.query("INSERT INTO mst_asset_category (name, sort_order) VALUES (?, ?)", [name, Number(mx) + 1]);
    return res.status(201).json({ message: "Kategori ditambahkan.", id: r.insertId });
  } catch (err) {
    console.error("[createAssetCategory]", err);
    return res.status(500).json({ message: "Gagal menambah kategori", error: err.message });
  }
}

// PUT /assets/categories/:id {name?, is_active?, sort_order?}
export async function updateAssetCategory(req, res) {
  try {
    const id = Number(req.params.id);
    const [cur] = await pool.query("SELECT * FROM mst_asset_category WHERE id = ?", [id]);
    if (!cur.length) return res.status(404).json({ message: "Kategori tidak ditemukan." });
    const name = req.body.name !== undefined ? cleanName(req.body.name) : cur[0].name;
    if (!name) return res.status(422).json({ message: "Nama kategori wajib diisi." });
    if (name.length > 100) return res.status(422).json({ message: "Nama kategori maksimal 100 karakter." });
    const [dup] = await pool.query("SELECT id FROM mst_asset_category WHERE name = ? AND id <> ?", [name, id]);
    if (dup.length) return res.status(422).json({ message: `Kategori "${name}" sudah ada.` });
    const isActive = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : cur[0].is_active;
    const sort = req.body.sort_order !== undefined ? Number(req.body.sort_order) || 0 : cur[0].sort_order;
    await pool.query("UPDATE mst_asset_category SET name = ?, is_active = ?, sort_order = ? WHERE id = ?", [name, isActive, sort, id]);
    return res.json({ message: "Kategori disimpan." });
  } catch (err) {
    console.error("[updateAssetCategory]", err);
    return res.status(500).json({ message: "Gagal menyimpan kategori", error: err.message });
  }
}

// DELETE /assets/categories/:id — hanya bila belum dipakai aset mana pun (kalau sudah, nonaktifkan saja)
export async function deleteAssetCategory(req, res) {
  try {
    const id = Number(req.params.id);
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM mst_asset_category_map WHERE category_id = ?", [id]);
    if (Number(n) > 0) return res.status(422).json({ message: `Kategori masih dipakai ${n} aset. Nonaktifkan saja, atau pindahkan asetnya dulu.` });
    await pool.query("DELETE FROM mst_asset_category WHERE id = ?", [id]);
    return res.json({ message: "Kategori dihapus." });
  } catch (err) {
    console.error("[deleteAssetCategory]", err);
    return res.status(500).json({ message: "Gagal menghapus kategori", error: err.message });
  }
}

// PUT /assets/category/:kode {category_id | null} — tempatkan satu aset ke kategori (null = lepas)
export async function setAssetCategory(req, res) {
  try {
    const kode = String(req.params.kode || "");
    const [a] = await mainPool.query("SELECT kode_aset FROM mst_aset WHERE kode_aset = ? AND is_deleted = 0", [kode]);
    if (!a.length) return res.status(404).json({ message: "Aset tidak ditemukan." });
    const cid = req.body.category_id;
    if (cid === null || cid === "" || cid === undefined) {
      await pool.query("DELETE FROM mst_asset_category_map WHERE kode_aset = ?", [kode]);
      return res.json({ message: "Kategori aset dilepas." });
    }
    const [c] = await pool.query("SELECT id, is_active FROM mst_asset_category WHERE id = ?", [Number(cid)]);
    if (!c.length) return res.status(422).json({ message: "Kategori tidak ditemukan." });
    if (!Number(c[0].is_active)) return res.status(422).json({ message: "Kategori ini nonaktif." });
    await pool.query(
      "INSERT INTO mst_asset_category_map (kode_aset, category_id, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), updated_by = VALUES(updated_by)",
      [kode, c[0].id, req.user?.id || null]
    );
    return res.json({ message: "Kategori aset disimpan." });
  } catch (err) {
    console.error("[setAssetCategory]", err);
    return res.status(500).json({ message: "Gagal menyimpan kategori aset", error: err.message });
  }
}
