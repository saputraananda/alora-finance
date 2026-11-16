import { pool } from "../../db/pool.js";
import { bankPrefix } from "../../utils/bankImport.js";
import {
  RESET_LABEL, TYPES, componentsFor, formatSignature, hasScope, normalizeRow, peekCounter, periodKey, reconPeriod, renderNumber, validateConfig,
} from "../../utils/numbering.js";

// ════════════════════════════════════════════════════════════════════════════
// PENGATURAN > PENOMORAN
// Format nomor dokumen per Tipe Transaksi (Jurnal Umum manual, Mutasi Bank). Satu default per tipe.
// Tidak dihapus, hanya dinonaktifkan. Mengubah format tidak mengubah nomor yang sudah terbit.
// ════════════════════════════════════════════════════════════════════════════

const today = () => {
  const n = new Date(Date.now() + 7 * 3600 * 1000); // WIB
  return n.toISOString().slice(0, 10);
};
const audit = async (action, id, after, uid) => {
  try {
    await pool.query(`INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('mst_numbering', ?, ?, ?, ?)`, [id, action, uid || null, JSON.stringify(after)]);
  } catch {
    /* audit tidak menggagalkan */
  }
};

// Contoh nomor berikutnya untuk tampilan (tidak menaikkan counter)
async function preview(cfg, sampleBank) {
  const date = today();
  if (cfg.txn_type === "MUTASI") {
    let counter = 1;
    if (sampleBank) {
      const [[r]] = await pool
        .query(
          `SELECT MAX(m.recon_seq) AS mx FROM tr_bank_statement_meta m JOIN tr_bank_statement s ON s.id = m.statement_id WHERE s.bank_account_id = ? AND m.recon_ym = ?`,
          [sampleBank.id, reconPeriod(cfg.reset_mode, date)]
        )
        .then(([x]) => [x]);
      counter = Number(r?.mx || 0) + 1;
    }
    return { next_number: renderNumber(cfg, { date, bank: sampleBank ? bankPrefix(sampleBank) : "BANK1234", counter }), next_counter: counter, sample_note: sampleBank ? `contoh untuk ${sampleBank.bank_name} ${sampleBank.account_no || ""}`.trim() : "contoh" };
  }
  const counter = await peekCounter(pool, cfg, { date, branch: "HO" });
  return { next_number: renderNumber(cfg, { date, branch: "HO", counter }), next_counter: counter, sample_note: hasScope(cfg) ? "contoh untuk jurnal tanpa cabang (HO)" : null };
}

// GET /settings/numbering
export async function listNumbering(_req, res) {
  try {
    const [rows] = await pool.query(`SELECT * FROM mst_numbering ORDER BY txn_type, is_default DESC, is_active DESC, name`);
    const [[bank]] = await pool.query(`SELECT id, bank_name, account_no FROM mst_bank_account WHERE is_active = 1 ORDER BY id LIMIT 1`).then(([r]) => [r.length ? r : [null]]);
    const data = [];
    for (const r of rows.map(normalizeRow)) data.push({ ...r, ...(await preview(r, bank)), counter_editable: r.txn_type === "JURNAL" && !hasScope(r) });
    return res.json({
      today: today(),
      types: Object.entries(TYPES).map(([key, t]) => ({ key, label: t.label, hint: t.hint, resets: t.resets, components: componentsFor(key), max_length: t.maxLength })),
      reset_labels: RESET_LABEL,
      data,
    });
  } catch (err) {
    if (/mst_numbering/.test(err.message)) return res.status(500).json({ message: "Tabel penomoran belum dibuat. Jalankan migrasi 006_numbering.sql di repo alfi-database." });
    return res.status(500).json({ message: "Gagal memuat penomoran", error: err.message });
  }
}

async function signatureTaken(v, exceptId = 0) {
  const [rows] = await pool.query(`SELECT * FROM mst_numbering WHERE txn_type = ? AND is_active = 1 AND id <> ?`, [v.txn_type, exceptId]);
  return rows.map(normalizeRow).some((r) => formatSignature(r) === formatSignature(v));
}
async function nameTaken(v, exceptId = 0) {
  const [r] = await pool.query(`SELECT id FROM mst_numbering WHERE txn_type = ? AND LOWER(name) = LOWER(?) AND id <> ?`, [v.txn_type, v.name, exceptId]);
  return r.length > 0;
}

// Counter berikutnya (hanya Jurnal Umum tanpa komponen cabang): diatur untuk periode berjalan, tidak boleh mundur
async function applyNextCounter(conn, id, cfg, nextNo) {
  if (nextNo === undefined || nextNo === null || nextNo === "") return null;
  const n = Number(nextNo);
  if (!Number.isInteger(n) || n < 1 || n > 10 ** cfg.digits - 1) return `Counter berikutnya harus 1–${10 ** cfg.digits - 1}.`;
  if (cfg.txn_type !== "JURNAL" || hasScope(cfg)) return null;
  const pk = periodKey(cfg.reset_mode, today());
  const [[cur]] = await conn.query(`SELECT last_no FROM tr_numbering_counter WHERE numbering_id = ? AND period_key = ? AND scope_key = '' FOR UPDATE`, [id, pk]).then(([r]) => [r.length ? r : [null]]);
  const last = Number(cur?.last_no || 0);
  if (n - 1 < last) return `Counter berikutnya tidak boleh lebih kecil dari ${last + 1} (counter periode ini sudah sampai ${last}).`;
  await conn.query(
    `INSERT INTO tr_numbering_counter (numbering_id, period_key, scope_key, last_no) VALUES (?, ?, '', ?) ON DUPLICATE KEY UPDATE last_no = VALUES(last_no)`,
    [id, pk, n - 1]
  );
  return null;
}

// POST /settings/numbering {name, txn_type, reset_mode, digits, components, is_default, is_active, next_no}
export async function createNumbering(req, res) {
  const { errors, value: v } = validateConfig(req.body);
  if (errors.length) return res.status(422).json({ message: errors[0], errors });
  if (await nameTaken(v)) return res.status(422).json({ message: "Nama sudah dipakai untuk tipe transaksi ini." });
  if (await signatureTaken(v)) return res.status(422).json({ message: "Format yang sama sudah ada pada penomoran aktif lain untuk tipe transaksi ini." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[hasDef]] = await conn.query(`SELECT COUNT(*) AS n FROM mst_numbering WHERE txn_type = ? AND is_default = 1 AND is_active = 1 FOR UPDATE`, [v.txn_type]).then(([r]) => [r]);
    const makeDefault = Boolean(req.body?.is_default) || Number(hasDef.n) === 0; // tipe tanpa default → otomatis jadi default
    if (makeDefault) await conn.query(`UPDATE mst_numbering SET is_default = 0 WHERE txn_type = ?`, [v.txn_type]);
    const [ins] = await conn.query(
      `INSERT INTO mst_numbering (name, txn_type, reset_mode, digits, components, is_default, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [v.name, v.txn_type, v.reset_mode, v.digits, JSON.stringify(v.components), makeDefault ? 1 : 0, req.user?.id || null]
    );
    const err = await applyNextCounter(conn, ins.insertId, v, req.body?.next_no);
    if (err) {
      await conn.rollback();
      return res.status(422).json({ message: err });
    }
    await conn.commit();
    await audit("CREATE", ins.insertId, { ...v, is_default: makeDefault }, req.user?.id);
    return res.status(201).json({ message: makeDefault ? "Penomoran disimpan dan dijadikan default." : "Penomoran disimpan.", id: ins.insertId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ message: "Gagal menyimpan penomoran", error: err.message });
  } finally {
    conn.release();
  }
}

// PUT /settings/numbering/:id  (Tipe Transaksi tidak bisa diubah)
export async function updateNumbering(req, res) {
  const id = Number(req.params.id);
  const [[cur0]] = await pool.query(`SELECT * FROM mst_numbering WHERE id = ?`, [id]).then(([r]) => [r.length ? r : [null]]);
  if (!cur0) return res.status(404).json({ message: "Penomoran tidak ditemukan." });
  const cur = normalizeRow(cur0);
  const merged = { name: cur.name, reset_mode: cur.reset_mode, digits: cur.digits, components: cur.components, ...req.body };
  const { errors, value: v } = validateConfig(merged, { lockedType: cur.txn_type });
  if (errors.length) return res.status(422).json({ message: errors[0], errors });
  const active = req.body?.is_active === undefined ? cur.is_active : Boolean(req.body.is_active);
  const wantDefault = req.body?.is_default === undefined ? cur.is_default : Boolean(req.body.is_default);
  if (cur.is_default && (!active || !wantDefault)) {
    return res.status(422).json({ message: "Ini penomoran default. Jadikan penomoran lain sebagai default dulu sebelum menonaktifkan atau melepas default-nya." });
  }
  if (wantDefault && !active) return res.status(422).json({ message: "Penomoran nonaktif tidak bisa dijadikan default." });
  if (await nameTaken(v, id)) return res.status(422).json({ message: "Nama sudah dipakai untuk tipe transaksi ini." });
  if (active && (await signatureTaken(v, id))) return res.status(422).json({ message: "Format yang sama sudah ada pada penomoran aktif lain untuk tipe transaksi ini." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (wantDefault && !cur.is_default) await conn.query(`UPDATE mst_numbering SET is_default = 0 WHERE txn_type = ?`, [cur.txn_type]);
    await conn.query(
      `UPDATE mst_numbering SET name = ?, reset_mode = ?, digits = ?, components = ?, is_default = ?, is_active = ? WHERE id = ?`,
      [v.name, v.reset_mode, v.digits, JSON.stringify(v.components), wantDefault ? 1 : 0, active ? 1 : 0, id]
    );
    const err = await applyNextCounter(conn, id, v, req.body?.next_no);
    if (err) {
      await conn.rollback();
      return res.status(422).json({ message: err });
    }
    await conn.commit();
    await audit("UPDATE", id, { ...v, is_default: wantDefault, is_active: active }, req.user?.id);
    return res.json({ message: "Penomoran disimpan. Berlaku untuk dokumen berikutnya." });
  } catch (err) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ message: "Gagal menyimpan penomoran", error: err.message });
  } finally {
    conn.release();
  }
}
