import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { pool, getOutlets } from "../../db/pool.js";
import { formatRupiah, toFixed2 } from "../../utils/currencyHelpers.js";
import { dayLockMessage } from "../../utils/dayLock.js";
import { loadOutletOverrides } from "../../utils/accountResolver.js";

// ════════════════════════════════════════════════════════════════════════════
// JURNAL MANUAL — alur: Draft → Menunggu approval → Diposting
// Aturan (Referensi Tampilan Aplikasi, "Jurnal > Jurnal manual"):
//  • Harus seimbang, boleh punya lampiran, setiap baris punya cabang.
//  • Akun kas cabang, piutang QRIS/EDC, deposit tidak tersedia di jurnal manual
//    (itu hanya dibuat otomatis dari POS / rekonsiliasi).
//  • Penyetuju harus orang lain dari pembuat (maker–checker).
// ════════════════════════════════════════════════════════════════════════════

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, "../../../uploads/journals");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Peran akun yang dikunci untuk jurnal manual (lihat mst_account_map)
const RESTRICTED_ROLES = ["KAS", "PIUTANG_QRIS", "PIUTANG_EDC", "DEPOSIT_MEMBER", "PIUTANG_USAHA"];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpe?g|png|webp|pdf)$/i.test(file.originalname);
    cb(ok ? null : new Error("Lampiran harus berupa JPG, PNG, WEBP, atau PDF (maks. 5 MB)."), ok);
  },
});

export const uploadMiddleware = (req, res, next) =>
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(422).json({ message: err.message });
    next();
  });

async function getRestrictedAccountIds() {
  const [rows] = await pool.query(
    `SELECT account_id FROM mst_account_map WHERE role IN (?) AND account_id IS NOT NULL`,
    [RESTRICTED_ROLES]
  );
  // akun kas khusus per cabang (Pengaturan) juga tidak boleh dipakai di jurnal manual
  const ov = await loadOutletOverrides();
  return [...new Set([...rows.map((r) => Number(r.account_id)), ...ov.cashAccountIds])];
}

// ── GET /journals/meta ──────────────────────────────────────────────────
export async function getJournalMeta(req, res) {
  try {
    const [restricted, outlets] = await Promise.all([getRestrictedAccountIds(), getOutlets()]);
    return res.json({ restricted_account_ids: restricted, outlets, user_id: req.user?.id ?? null });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat data pendukung jurnal", error: err.message });
  }
}

// ── POST /journals/upload ───────────────────────────────────────────────
export function uploadAttachment(req, res) {
  if (!req.file) return res.status(422).json({ message: "File lampiran tidak ditemukan." });
  return res.status(201).json({
    url: `/uploads/journals/${req.file.filename}`,
    name: req.file.originalname,
  });
}

// ── Validasi & normalisasi payload ──────────────────────────────────────
async function normalize(body, { requireBalanced }) {
  const { entry_date, description, lines, outlet_id, attachment_url, attachment_name } = body || {};
  const fail = (code, message, extra = {}) => ({ error: { code, message, ...extra } });

  if (!entry_date || Number.isNaN(Date.parse(`${entry_date}T00:00:00Z`))) {
    return fail("INVALID_DATE", "Tanggal jurnal wajib diisi.");
  }
  if (!description || !String(description).trim()) {
    return fail("INVALID_DESCRIPTION", "Keterangan jurnal wajib diisi.");
  }
  if (attachment_url && !String(attachment_url).startsWith("/uploads/journals/")) {
    return fail("INVALID_ATTACHMENT", "Lampiran tidak valid.");
  }

  const [restricted, outlets] = await Promise.all([getRestrictedAccountIds(), getOutlets()]);
  const outletIds = new Set(outlets.map((o) => o.id));
  const headerOutlet = outlet_id ? Number(outlet_id) : null;
  if (headerOutlet && outletIds.size && !outletIds.has(headerOutlet)) {
    return fail("INVALID_OUTLET", "Cabang tidak dikenal.");
  }

  const active = (Array.isArray(lines) ? lines : []).filter(
    (l) => toFixed2(l.debit) > 0 || toFixed2(l.credit) > 0 || l.account_id
  );
  if (!active.length) return fail("JOURNAL_MIN_LINES", "Isi minimal satu baris jurnal.");
  if (requireBalanced && active.length < 2) {
    return fail("JOURNAL_MIN_LINES", "Jurnal minimal harus memiliki 2 baris bernominal.");
  }

  let totalDebit = 0;
  let totalCredit = 0;
  const out = [];
  for (let i = 0; i < active.length; i++) {
    const l = active[i];
    const d = toFixed2(l.debit);
    const c = toFixed2(l.credit);
    const n = i + 1;
    if (!l.account_id) return fail("ACCOUNT_REQUIRED", `Baris ke-${n} belum memilih akun.`);
    if (d < 0 || c < 0) return fail("NEGATIVE_AMOUNT", `Baris ke-${n} tidak boleh bernilai negatif.`);
    if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
      return fail("LINE_DEBIT_AND_CREDIT", `Baris ke-${n} harus mengisi salah satu: debit atau kredit.`);
    }
    if (restricted.includes(Number(l.account_id))) {
      return fail(
        "ACCOUNT_RESTRICTED",
        `Baris ke-${n}: akun kas, piutang QRIS/EDC, piutang usaha, dan deposit tidak bisa dipakai di jurnal manual.`
      );
    }
    const lineOutlet = l.outlet_id ? Number(l.outlet_id) : null;
    if (lineOutlet && outletIds.size && !outletIds.has(lineOutlet)) {
      return fail("INVALID_OUTLET", `Baris ke-${n}: cabang tidak dikenal.`);
    }
    totalDebit += d;
    totalCredit += c;
    out.push({
      account_id: Number(l.account_id),
      outlet_id: lineOutlet,
      debit: d,
      credit: c,
      memo: l.memo ? String(l.memo).trim().slice(0, 500) : null,
    });
  }
  totalDebit = toFixed2(totalDebit);
  totalCredit = toFixed2(totalCredit);

  if (requireBalanced) {
    const diff = toFixed2(Math.abs(totalDebit - totalCredit));
    if (diff > 0.001 || totalDebit <= 0) {
      return fail(
        "JOURNAL_NOT_BALANCED",
        `Total debit (${formatRupiah(totalDebit)}) tidak sama dengan kredit (${formatRupiah(totalCredit)}). Selisih: ${formatRupiah(diff)}.`
      );
    }
  }

  // Validasi akun terhadap COA
  const ids = [...new Set(out.map((l) => l.account_id))];
  const [accRows] = await pool.query(`SELECT id, code, name, is_header, is_active FROM mst_coa WHERE id IN (?)`, [ids]);
  const accMap = new Map(accRows.map((a) => [Number(a.id), a]));
  for (const id of ids) {
    const a = accMap.get(id);
    if (!a) return fail("ACCOUNT_NOT_FOUND", `Akun dengan ID ${id} tidak ditemukan.`);
    if (a.is_active === 0) return fail("ACCOUNT_INACTIVE", `Akun "${a.code} - ${a.name}" nonaktif.`);
    if (a.is_header === 1) return fail("ACCOUNT_IS_HEADER", `Akun "${a.code} - ${a.name}" adalah akun induk.`);
  }

  return {
    value: {
      entry_date,
      description: String(description).trim(),
      outlet_id: headerOutlet,
      attachment_url: attachment_url || null,
      attachment_name: attachment_name ? String(attachment_name).slice(0, 255) : null,
      lines: out,
      total: Math.max(totalDebit, totalCredit),
    },
  };
}

async function audit(conn, entryId, action, actorId, before, after) {
  try {
    await conn.query(
      `INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, before_value, after_value)
       VALUES ('tr_journal_entries', ?, ?, ?, ?, ?)`,
      [entryId, action, actorId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
    );
  } catch (e) {
    console.warn(`[journal ${action}] audit log gagal:`, e.message);
  }
}

async function insertLines(conn, entryId, lines) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await conn.query(
      `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entryId, i + 1, l.account_id, l.debit, l.credit, l.memo, l.outlet_id]
    );
  }
}

// Nomor jurnal manual: JM-YYMMDD-NN (urut per tanggal)
async function nextManualNo(conn, entryDate) {
  const [y, m, d] = entryDate.slice(0, 10).split("-");
  const prefix = `JM-${y.slice(2)}${m}${d}-`;
  const [last] = await conn.query(
    `SELECT entry_no FROM tr_journal_entries WHERE entry_no LIKE ? ORDER BY entry_no DESC LIMIT 1 FOR UPDATE`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (last.length) {
    const n = parseInt(last[0].entry_no.split("-").pop(), 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(2, "0")}`;
}

// Jurnal tidak boleh masuk ke tanggal yang sudah dikunci (per cabang)
async function lockMessageFor(entryDate, headerOutlet, lineOutlets) {
  return dayLockMessage(entryDate, [headerOutlet, ...lineOutlets]);
}

async function lockMessageForJournal(j) {
  const [rows] = await pool.query(`SELECT DISTINCT outlet_id FROM tr_journal_lines WHERE entry_id = ? AND outlet_id IS NOT NULL`, [j.id]);
  return lockMessageFor(String(j.entry_date).slice(0, 10), j.outlet_id, rows.map((r) => r.outlet_id));
}

// Aksi simpan: "post" = langsung diposting (alur saat ini, tanpa approval), "submit" = ajukan approval,
// "draft" = simpan sebagai draft. Alur approval tetap tersedia di server bila finance memintanya.
const ACTIONS = ["draft", "submit", "post"];
const parseAction = (v) => (ACTIONS.includes(v) ? v : "draft");
const statusFor = (action) => ({ draft: "DRAFT", submit: "PENDING", post: "POSTED" })[action];
const ACTION_MESSAGE = {
  create: { draft: "Draft jurnal disimpan.", submit: "Jurnal diajukan, menunggu approval.", post: "Jurnal disimpan dan diposting." },
  update: { draft: "Draft jurnal diperbarui.", submit: "Jurnal diajukan, menunggu approval.", post: "Jurnal disimpan dan diposting." },
};

// ── POST /journals {action: 'draft' | 'submit', ...} ────────────────────
export async function createManualJournal(req, res) {
  const action = parseAction(req.body?.action);
  const actorId = req.user?.id || null;
  const norm = await normalize(req.body, { requireBalanced: action !== "draft" });
  if (norm.error) return res.status(422).json(norm.error);
  const v = norm.value;
  const lockMsg = await lockMessageFor(v.entry_date, v.outlet_id, v.lines.map((l) => l.outlet_id));
  if (lockMsg) return res.status(422).json({ code: "DAY_LOCKED", message: lockMsg });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const entryNo = await nextManualNo(conn, v.entry_date);
    const status = statusFor(action);
    const [h] = await conn.query(
      `INSERT INTO tr_journal_entries
         (entry_no, entry_date, description, status, total_amount, created_by, source_type, outlet_id,
          attachment_url, attachment_name, submitted_at, approved_by, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?, ${action === "submit" ? "NOW()" : "NULL"}, ?, ${action === "post" ? "NOW()" : "NULL"})`,
      [entryNo, v.entry_date, v.description, status, v.total, actorId, v.outlet_id, v.attachment_url, v.attachment_name, action === "post" ? actorId : null]
    );
    await insertLines(conn, h.insertId, v.lines);
    await audit(conn, h.insertId, action === "submit" ? "SUBMIT" : "CREATE", actorId, null, {
      entry_no: entryNo,
      status,
      lines_count: v.lines.length,
    });
    await conn.commit();
    return res.status(201).json({
      message: ACTION_MESSAGE.create[action],
      entry_no: entryNo,
      id: h.insertId,
      status,
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[createManualJournal] Error:", err);
    return res.status(500).json({ message: "Gagal menyimpan jurnal", error: err.message });
  } finally {
    conn.release();
  }
}

// ── PUT /journals/:id {action} — ubah draft (hanya pembuatnya) ──────────
export async function updateManualJournal(req, res) {
  const action = parseAction(req.body?.action);
  const actorId = req.user?.id || null;
  const norm = await normalize(req.body, { requireBalanced: action !== "draft" });
  if (norm.error) return res.status(422).json(norm.error);
  const v = norm.value;
  const lockMsg = await lockMessageFor(v.entry_date, v.outlet_id, v.lines.map((l) => l.outlet_id));
  if (lockMsg) return res.status(422).json({ code: "DAY_LOCKED", message: lockMsg });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM tr_journal_entries WHERE id = ? FOR UPDATE`, [req.params.id]);
    const j = rows[0];
    if (!j) {
      await conn.rollback();
      return res.status(404).json({ message: "Jurnal tidak ditemukan." });
    }
    if (j.source_type !== "MANUAL" || j.status !== "DRAFT") {
      await conn.rollback();
      return res.status(422).json({ message: "Hanya draft jurnal manual yang bisa diubah." });
    }
    if (j.created_by && Number(j.created_by) !== Number(actorId)) {
      await conn.rollback();
      return res.status(403).json({ message: "Draft hanya bisa diubah oleh pembuatnya." });
    }

    const status = statusFor(action);
    await conn.query(
      `UPDATE tr_journal_entries
       SET entry_date=?, description=?, status=?, total_amount=?, outlet_id=?, attachment_url=?, attachment_name=?,
           reject_note=NULL, submitted_at=${action === "submit" ? "NOW()" : "NULL"},
           approved_by=?, approved_at=${action === "post" ? "NOW()" : "NULL"}
       WHERE id=?`,
      [v.entry_date, v.description, status, v.total, v.outlet_id, v.attachment_url, v.attachment_name, action === "post" ? actorId : null, j.id]
    );
    await conn.query(`DELETE FROM tr_journal_lines WHERE entry_id = ?`, [j.id]);
    await insertLines(conn, j.id, v.lines);
    await audit(conn, j.id, action === "submit" ? "SUBMIT" : "UPDATE", actorId, { status: j.status }, { status });
    await conn.commit();
    return res.json({
      message: ACTION_MESSAGE.update[action],
      entry_no: j.entry_no,
      id: j.id,
      status,
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[updateManualJournal] Error:", err);
    return res.status(500).json({ message: "Gagal memperbarui jurnal", error: err.message });
  } finally {
    conn.release();
  }
}

// Ambil + kunci jurnal untuk transisi status
async function lockJournal(conn, id) {
  const [rows] = await conn.query(`SELECT * FROM tr_journal_entries WHERE id = ? FOR UPDATE`, [id]);
  return rows[0] || null;
}

// ── POST /journals/:id/submit — ajukan draft yang sudah tersimpan ───────
export async function submitJournal(req, res) {
  const actorId = req.user?.id || null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const j = await lockJournal(conn, req.params.id);
    if (!j) {
      await conn.rollback();
      return res.status(404).json({ message: "Jurnal tidak ditemukan." });
    }
    if (j.status !== "DRAFT") {
      await conn.rollback();
      return res.status(422).json({ message: "Hanya draft yang bisa diajukan." });
    }
    const lockMsg = await lockMessageForJournal(j);
    if (lockMsg) {
      await conn.rollback();
      return res.status(422).json({ code: "DAY_LOCKED", message: lockMsg });
    }
    const [lines] = await conn.query(`SELECT debit, credit FROM tr_journal_lines WHERE entry_id = ?`, [j.id]);
    const d = toFixed2(lines.reduce((s, l) => s + Number(l.debit), 0));
    const c = toFixed2(lines.reduce((s, l) => s + Number(l.credit), 0));
    if (lines.length < 2 || d <= 0 || Math.abs(d - c) > 0.001) {
      await conn.rollback();
      return res.status(422).json({ message: "Jurnal belum seimbang, tidak bisa diajukan." });
    }
    await conn.query(`UPDATE tr_journal_entries SET status='PENDING', submitted_at=NOW(), reject_note=NULL WHERE id=?`, [j.id]);
    await audit(conn, j.id, "SUBMIT", actorId, { status: "DRAFT" }, { status: "PENDING" });
    await conn.commit();
    return res.json({ message: `Jurnal ${j.entry_no} diajukan, menunggu approval.` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ message: "Gagal mengajukan jurnal", error: err.message });
  } finally {
    conn.release();
  }
}

// ── POST /journals/:id/approve ──────────────────────────────────────────
export async function approveJournal(req, res) {
  const actorId = req.user?.id || null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const j = await lockJournal(conn, req.params.id);
    if (!j) {
      await conn.rollback();
      return res.status(404).json({ message: "Jurnal tidak ditemukan." });
    }
    if (j.status !== "PENDING") {
      await conn.rollback();
      return res.status(422).json({ message: "Hanya jurnal berstatus Menunggu approval yang bisa disetujui." });
    }
    if (j.created_by && Number(j.created_by) === Number(actorId)) {
      await conn.rollback();
      return res.status(403).json({ message: "Pembuat jurnal tidak boleh menyetujui jurnalnya sendiri." });
    }
    const lockMsg = await lockMessageForJournal(j);
    if (lockMsg) {
      await conn.rollback();
      return res.status(422).json({ code: "DAY_LOCKED", message: `${lockMsg} Kembalikan ke draft lalu ubah tanggalnya.` });
    }
    await conn.query(`UPDATE tr_journal_entries SET status='POSTED', approved_by=?, approved_at=NOW() WHERE id=?`, [actorId, j.id]);
    await audit(conn, j.id, "APPROVE", actorId, { status: "PENDING" }, { status: "POSTED" });
    await conn.commit();
    return res.json({ message: `Jurnal ${j.entry_no} disetujui dan diposting.` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ message: "Gagal menyetujui jurnal", error: err.message });
  } finally {
    conn.release();
  }
}

// ── POST /journals/:id/reject {note} — kembali ke Draft ─────────────────
export async function rejectJournal(req, res) {
  const actorId = req.user?.id || null;
  const note = String(req.body?.note || "").trim();
  if (!note) return res.status(422).json({ message: "Alasan penolakan wajib diisi." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const j = await lockJournal(conn, req.params.id);
    if (!j) {
      await conn.rollback();
      return res.status(404).json({ message: "Jurnal tidak ditemukan." });
    }
    if (j.status !== "PENDING") {
      await conn.rollback();
      return res.status(422).json({ message: "Hanya jurnal berstatus Menunggu approval yang bisa ditolak." });
    }
    await conn.query(`UPDATE tr_journal_entries SET status='DRAFT', reject_note=?, submitted_at=NULL WHERE id=?`, [note.slice(0, 255), j.id]);
    await audit(conn, j.id, "REJECT", actorId, { status: "PENDING" }, { status: "DRAFT", note });
    await conn.commit();
    return res.json({ message: `Jurnal ${j.entry_no} dikembalikan ke draft.` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ message: "Gagal menolak jurnal", error: err.message });
  } finally {
    conn.release();
  }
}

// ── DELETE /journals/:id — hapus draft ──────────────────────────────────
export async function deleteDraftJournal(req, res) {
  const actorId = req.user?.id || null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const j = await lockJournal(conn, req.params.id);
    if (!j) {
      await conn.rollback();
      return res.status(404).json({ message: "Jurnal tidak ditemukan." });
    }
    if (j.status !== "DRAFT" || j.source_type !== "MANUAL") {
      await conn.rollback();
      return res.status(422).json({ message: "Hanya draft jurnal manual yang bisa dihapus." });
    }
    if (j.created_by && Number(j.created_by) !== Number(actorId)) {
      await conn.rollback();
      return res.status(403).json({ message: "Draft hanya bisa dihapus oleh pembuatnya." });
    }
    await conn.query(`DELETE FROM tr_journal_lines WHERE entry_id = ?`, [j.id]);
    await conn.query(`DELETE FROM tr_journal_entries WHERE id = ?`, [j.id]);
    await audit(conn, j.id, "DELETE", actorId, { entry_no: j.entry_no, status: "DRAFT" }, null);
    await conn.commit();
    return res.json({ message: `Draft ${j.entry_no} dihapus.` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ message: "Gagal menghapus draft", error: err.message });
  } finally {
    conn.release();
  }
}
