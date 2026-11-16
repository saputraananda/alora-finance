import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { pool } from "../../db/pool.js";
import { ADAPTERS, FIELD_LABEL, assignReconCodes, bankPrefix, parseStatement, ymOf } from "../../utils/bankImport.js";
import { loadDefault, renderNumber } from "../../utils/numbering.js";

// ════════════════════════════════════════════════════════════════════════════
// REKONSILIASI > IMPORT MUTASI BANK (pratinjau → konfirmasi)
//  • Pratinjau tidak menulis database; file disimpan sementara dengan token.
//  • Konfirmasi: arsipkan file asli, buat satu transaksi bank per baris valid, beri Rekon Code sistem
//    (berurutan sesuai baris Excel), simpan metadata & nilai asli Excel (Rekon Code / Kategori Payment sumber).
//  • Kategori Payment TIDAK ditentukan saat import; baru dialokasikan saat Cocokkan.
//  • File Excel Finance hanya teks: tidak ada ekstraksi gambar.
//  • File arsip disimpan di storage/ (bukan uploads/ yang publik). Tidak ada jurnal yang dibuat di sini.
// ════════════════════════════════════════════════════════════════════════════

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE = path.resolve(__dirname, "../../../storage/rekon");
const TMP_DIR = path.join(STORAGE, "import-tmp");
const FILE_DIR = path.join(STORAGE, "bank-files");
[TMP_DIR, FILE_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    const ok = /\.(csv|xlsx)$/i.test(file.originalname);
    cb(ok ? null : new Error("File rekening koran harus berformat CSV atau XLSX."), ok);
  },
});
export const importFileMiddleware = (req, res, next) =>
  upload.single("file")(req, res, (err) => (err ? res.status(422).json({ message: err.message }) : next()));

const digits = (s) => String(s || "").replace(/\D/g, "");
const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
const safeName = (s) => String(s).replace(/[^\w.\-]+/g, "_").slice(0, 120);

// File sementara >24 jam dibersihkan setiap kali ada pratinjau baru
function cleanTmp() {
  const limit = Date.now() - 24 * 3600 * 1000;
  try {
    for (const f of fs.readdirSync(TMP_DIR)) {
      const p = path.join(TMP_DIR, f);
      if (fs.statSync(p).mtimeMs < limit) fs.rmSync(p, { force: true });
    }
  } catch {
    /* pembersihan tidak boleh menggagalkan */
  }
}

// Hash baris untuk mencegah duplikat. Baris pertama memakai rumus impor lama (kompatibel dengan data lama);
// baris kembar berikutnya dalam satu file diberi penanda urutan; teks panjang/multi-baris ikut membedakan.
const rowHash = (bankId, r) => sha1(`${bankId}|${r.date}|${r.description}|${r.amount}|${r.balance ?? ""}${r.longSig ? `|L${r.longSig}` : ""}${r.occ > 1 ? `|#${r.occ}` : ""}`);

// Urutan terbesar yang sudah terpakai per periode (recon_ym) untuk rekening ini
async function maxSeqByPeriod(conn, bankId) {
  const [rows] = await conn.query(
    `SELECT m.recon_ym AS ym, MAX(m.recon_seq) AS mx FROM tr_bank_statement_meta m JOIN tr_bank_statement s ON s.id = m.statement_id WHERE s.bank_account_id = ? GROUP BY m.recon_ym`,
    [bankId]
  );
  return Object.fromEntries(rows.map((r) => [String(r.ym).trim(), Number(r.mx)]));
}

// Rekon Code untuk baris baru: format dari Pengaturan › Penomoran (Mutasi Bank).
// Kode yang sudah ada (mis. setelah format/tipe penomoran diubah) dilewati, jadi tidak pernah kembar.
async function reconCodesFor(conn, rows, bank) {
  const cfg = await loadDefault(conn, "MUTASI");
  const prefix = bankPrefix(bank);
  const maxSeq = await maxSeqByPeriod(conn, bank.id);
  for (let i = 0; i < 500; i++) {
    const codes = assignReconCodes(rows, { cfg, prefix, maxSeq });
    const list = [...codes.values()].map((c) => c.code);
    if (!list.length) return codes;
    const [ex] = await conn.query(`SELECT recon_code FROM tr_bank_statement_meta WHERE recon_code IN (?)`, [list]);
    if (!ex.length) return codes;
    const hit = new Set(ex.map((r) => r.recon_code));
    for (const c of codes.values()) if (hit.has(c.code)) maxSeq[c.ym] = Math.max(maxSeq[c.ym] || 0, c.seq);
  }
  throw new Error("Rekon Code bentrok terus dengan kode yang sudah ada. Periksa Pengaturan › Penomoran.");
}

// GET /rekon/bank/import/adapters
export async function listAdapters(_req, res) {
  return res.json({
    adapters: Object.entries(ADAPTERS).map(([key, a]) => ({ key, label: a.label, verified: a.verified })),
    fields: FIELD_LABEL,
    code_format: await loadDefault(pool, "MUTASI").then((c) => renderNumber(c, { date: new Date().toISOString().slice(0, 10), bank: "BANK1234", counter: 1 })).catch(() => null),
  });
}

async function existingHashes(hashes) {
  if (!hashes.length) return new Set();
  const [rows] = await pool.query(`SELECT row_hash FROM tr_bank_statement WHERE row_hash IN (?)`, [hashes]);
  return new Set(rows.map((r) => r.row_hash));
}

// POST /rekon/bank/import/preview (multipart: file, adapter?, bank_account_id?, mapping?)
export async function previewImport(req, res) {
  try {
    if (!req.file) return res.status(422).json({ message: "Pilih file rekening koran (CSV atau XLSX)." });
    const adapter = ADAPTERS[req.body?.adapter] ? req.body.adapter : "FINANCE";
    let mapping = null;
    if (req.body?.mapping) {
      try {
        mapping = JSON.parse(req.body.mapping);
      } catch {
        return res.status(422).json({ message: "Pemetaan kolom tidak valid." });
      }
    }
    const parsed = await parseStatement(req.file.buffer, req.file.originalname, { adapter, mapping });
    if (parsed.error) return res.status(422).json({ message: parsed.error, needs_mapping: Boolean(parsed.needsMapping), sample: parsed.sample || null });

    const [banks] = await pool.query(`SELECT id, bank_name, account_no, holder, outlet_id FROM mst_bank_account WHERE is_active = 1 ORDER BY id`);
    const num = digits(parsed.account.number);
    const matched = num ? banks.filter((b) => digits(b.account_no) === num) : [];
    const bankId = Number(req.body?.bank_account_id) || (matched.length === 1 ? matched[0].id : null);
    const accountMatch = !num ? "NO_INFO" : matched.length === 1 ? "MATCHED" : matched.length > 1 ? "AMBIGUOUS" : "NOT_FOUND";

    const fileHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    let duplicateFile = null;
    let dupSet = new Set();
    let codes = new Map();
    if (bankId) {
      const bank = banks.find((b) => b.id === bankId);
      dupSet = await existingHashes(parsed.rows.filter((r) => r.valid).map((r) => rowHash(bankId, r)));
      const [[f]] = await pool.query(
        `SELECT id, original_name, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS at FROM tr_bank_import_file WHERE bank_account_id = ? AND file_hash = ? ORDER BY id DESC LIMIT 1`,
        [bankId, fileHash]
      ).then(([r]) => [r.length ? r : [null]]);
      duplicateFile = f || null;
      // Pratinjau Rekon Code: nomor sebenarnya ditetapkan saat konfirmasi (bisa bergeser bila ada import lain di antaranya)
      if (bank) {
        const fresh = parsed.rows.filter((r) => r.valid && !dupSet.has(rowHash(bankId, r)));
        codes = await reconCodesFor(pool, fresh, bank);
      }
    }

    const rows = parsed.rows.map((r) => ({
      excel_row: r.excelRow, date: r.date, description: r.description, description_full: r.descriptionFull, bank_code: r.bankCode,
      debit: r.debit, credit: r.credit, balance: r.balance, direction: r.direction,
      source_recon_code: r.sourceReconCode, source_payment_category: r.sourcePaymentCategory, extra: r.extra,
      valid: r.valid, errors: r.errors, duplicate: Boolean(bankId && r.valid && dupSet.has(rowHash(bankId, r))),
      recon_code: codes.get(r.excelRow)?.code || null,
    }));
    const valid = rows.filter((r) => r.valid);
    const summary = {
      total: rows.length,
      valid: valid.length,
      invalid: rows.length - valid.length,
      duplicate: rows.filter((r) => r.duplicate).length,
      new: valid.filter((r) => !r.duplicate).length,
      total_debit: Math.round(valid.reduce((s, r) => s + r.debit, 0) * 100) / 100,
      total_credit: Math.round(valid.reduce((s, r) => s + r.credit, 0) * 100) / 100,
      excel_rows: rows.length ? [rows[0].excel_row, rows[rows.length - 1].excel_row] : null,
      needs_mapping: parsed.codeGuessed ? 1 : 0,
    };

    cleanTmp();
    const token = crypto.randomBytes(16).toString("hex");
    fs.writeFileSync(path.join(TMP_DIR, `${token}.bin`), req.file.buffer);
    fs.writeFileSync(path.join(TMP_DIR, `${token}.json`), JSON.stringify({ name: req.file.originalname, hash: fileHash }));

    return res.json({
      token,
      file: { name: req.file.originalname, size: req.file.size, hash: fileHash },
      adapter: parsed.adapter,
      header_row: parsed.headerRow,
      columns: parsed.columns,
      mapping: parsed.mapping,
      code_guessed: parsed.codeGuessed,
      account: parsed.account,
      account_match: { status: accountMatch, bank_account_id: bankId, candidates: matched.length ? matched : banks },
      duplicate_file: duplicateFile,
      summary,
      rows,
    });
  } catch (err) {
    console.error("[previewImport]", err);
    return res.status(500).json({ message: "Gagal membaca file rekening koran", error: err.message });
  }
}

// POST /rekon/bank/import/confirm {token, bank_account_id, adapter, mapping?, skip_invalid}
export async function confirmImport(req, res) {
  const conn = await pool.getConnection();
  let stored = null;
  try {
    const { token, adapter, mapping, skip_invalid: skipInvalid } = req.body || {};
    const bankId = Number(req.body?.bank_account_id);
    if (!/^[a-f0-9]{32}$/.test(String(token || ""))) return res.status(422).json({ message: "Sesi import tidak valid. Unggah ulang file." });
    if (!bankId) return res.status(422).json({ message: "Pilih rekening bank untuk mutasi ini." });
    const tmpBin = path.join(TMP_DIR, `${token}.bin`);
    const tmpMeta = path.join(TMP_DIR, `${token}.json`);
    if (!fs.existsSync(tmpBin) || !fs.existsSync(tmpMeta)) return res.status(410).json({ message: "Sesi import kedaluwarsa. Unggah ulang file." });
    const meta = JSON.parse(fs.readFileSync(tmpMeta, "utf8"));
    const [[bank]] = await pool.query(`SELECT id, bank_name, account_no FROM mst_bank_account WHERE id = ?`, [bankId]).then(([r]) => [r.length ? r : [null]]);
    if (!bank) return res.status(404).json({ message: "Rekening bank tidak ditemukan." });

    const parsed = await parseStatement(fs.readFileSync(tmpBin), meta.name, { adapter, mapping });
    if (parsed.error) return res.status(422).json({ message: parsed.error });
    const invalid = parsed.rows.filter((r) => !r.valid);
    if (invalid.length && !skipInvalid) return res.status(422).json({ message: `${invalid.length} baris tidak valid. Putuskan untuk melewatinya, atau perbaiki file.` });

    const uid = req.user?.id || null;
    await conn.beginTransaction();
    // Satu import per rekening pada satu waktu supaya urutan Rekon Code tidak bentrok; rollback tidak menghabiskan urutan.
    await conn.query(`SELECT id FROM mst_bank_account WHERE id = ? FOR UPDATE`, [bankId]);
    const valid = parsed.rows.filter((r) => r.valid);
    const [dupRows] = valid.length ? await conn.query(`SELECT row_hash FROM tr_bank_statement WHERE row_hash IN (?)`, [valid.map((r) => rowHash(bankId, r))]) : [[]];
    const dup = new Set(dupRows.map((r) => r.row_hash));
    const fresh = valid.filter((r) => !dup.has(rowHash(bankId, r)));
    if (!fresh.length) {
      await conn.rollback();
      return res.status(409).json({ message: "Semua baris sudah pernah diimpor (duplikat). Tidak ada yang ditambahkan.", duplicate: valid.length });
    }
    const codes = await reconCodesFor(conn, fresh, bank);

    const [fh] = await conn.query(
      `INSERT INTO tr_bank_import_file
         (bank_account_id, original_name, stored_path, file_hash, adapter, account_number, account_holder, currency, period_from, period_to, total_rows, created_by)
       VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bankId, meta.name, meta.hash, parsed.adapter, parsed.account.number, parsed.account.name, parsed.account.currency, parsed.account.period.from, parsed.account.period.to, parsed.rows.length, uid]
    );
    const fileId = fh.insertId;

    let inserted = 0;
    let lostToDup = 0;
    for (const r of [...fresh].sort((a, b) => a.excelRow - b.excelRow)) {
      const [ins] = await conn.query(
        `INSERT IGNORE INTO tr_bank_statement (bank_account_id, trx_date, description, amount, balance, row_hash, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [bankId, r.date, r.description, r.amount, r.balance, rowHash(bankId, r), uid]
      );
      if (!ins.affectedRows) {
        lostToDup++;
        continue;
      }
      inserted++;
      const c = codes.get(r.excelRow);
      await conn.query(
        `INSERT INTO tr_bank_statement_meta
           (statement_id, import_file_id, excel_row, recon_code, recon_ym, recon_seq, bank_code, direction, source_recon_code, source_payment_category, description_full, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ins.insertId, fileId, r.excelRow, c.code, c.ym, c.seq, r.bankCode, r.direction, r.sourceReconCode, r.sourcePaymentCategory, r.descriptionFull, Object.keys(r.extra).length ? JSON.stringify(r.extra) : null]
      );
    }

    stored = path.join(FILE_DIR, `${fileId}-${safeName(meta.name)}`);
    fs.copyFileSync(tmpBin, stored);
    const duplicates = valid.length - fresh.length + lostToDup;
    await conn.query(`UPDATE tr_bank_import_file SET stored_path = ?, imported_rows = ?, duplicate_rows = ?, invalid_rows = ? WHERE id = ?`, [
      path.relative(STORAGE, stored).replace(/\\/g, "/"), inserted, duplicates, invalid.length, fileId,
    ]);
    const detail = `${meta.name} · masuk ${inserted}, duplikat ${duplicates}, invalid dilewati ${invalid.length}`;
    try {
      await conn.query(`INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('tr_bank_import_file', ?, 'CREATE', ?, ?)`, [
        fileId, uid, JSON.stringify({ file: meta.name, bank_account_id: bankId, imported: inserted, duplicate: duplicates, invalid: invalid.length }),
      ]);
      await conn.query(`INSERT INTO tr_recon_history (action, ref_type, ref_key, detail, user_id) VALUES ('IMPORT', 'BANK_FILE', ?, ?, ?)`, [String(fileId), detail, uid]);
    } catch {
      /* audit/riwayat tidak menggagalkan import */
    }
    await conn.commit();
    fs.rmSync(tmpBin, { force: true });
    fs.rmSync(tmpMeta, { force: true });
    return res.status(201).json({
      message: `${inserted} mutasi diimpor${duplicates ? `, ${duplicates} duplikat dilewati` : ""}${invalid.length ? `, ${invalid.length} baris invalid dilewati` : ""}.`,
      file_id: fileId,
      imported: inserted,
      duplicate: duplicates,
      invalid: invalid.length,
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (stored) fs.rmSync(stored, { force: true });
    console.error("[confirmImport]", err);
    return res.status(500).json({ message: "Gagal mengimpor rekening koran", error: err.message });
  } finally {
    conn.release();
  }
}

// GET /rekon/bank/import/files — riwayat file impor
export async function listImportFiles(req, res) {
  try {
    const bankId = Number(req.query.bank_account_id) || null;
    const [rows] = await pool.query(
      `SELECT id, bank_account_id, original_name, adapter, account_number, currency,
              DATE_FORMAT(period_from,'%Y-%m-%d') AS period_from, DATE_FORMAT(period_to,'%Y-%m-%d') AS period_to,
              total_rows, imported_rows, duplicate_rows, invalid_rows,
              DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS created_at, created_by
       FROM tr_bank_import_file ${bankId ? "WHERE bank_account_id = ?" : ""} ORDER BY id DESC LIMIT 100`,
      bankId ? [bankId] : []
    );
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat riwayat import", error: err.message });
  }
}

export { ymOf };
