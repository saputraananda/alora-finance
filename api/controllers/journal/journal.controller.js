import { pool, safeQuery, getUserNames, getOutlets } from "../../db/pool.js";
import { dayLockMessage } from "../../utils/dayLock.js";
import { formatRupiah, toFixed2 } from "../../utils/currencyHelpers.js";

// ════════════════════════════════════════════════════════════════════════════
// TRANSAKSI JURNAL UMUM (tr_journal_entries & tr_journal_lines)
// ════════════════════════════════════════════════════════════════════════════


// ── Initialize Tables: Jurnal Umum & Audit Logs ───────────────────────



/**
 * GET /api/finance-ho/journals
 * Mengambil daftar jurnal umum dengan paginasi dan filter
 */
export async function getJournals(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const { q = "", from = "", to = "", status = "", source = "", outlet = "" } = req.query;

    const conditions = ["1=1"];
    const params = [];

    if (source) {
      conditions.push("je.source_type = ?");
      params.push(source);
    }

    if (outlet === "PUSAT") {
      conditions.push("je.outlet_id IS NULL");
    } else if (outlet) {
      conditions.push("je.outlet_id = ?");
      params.push(Number(outlet));
    }

    if (q && q.trim()) {
      conditions.push("(je.entry_no LIKE ? OR je.description LIKE ?)");
      const term = `%${q.trim()}%`;
      params.push(term, term);
    }

    if (from) {
      conditions.push("je.entry_date >= ?");
      params.push(from);
    }

    if (to) {
      conditions.push("je.entry_date <= ?");
      params.push(to);
    }

    if (status) {
      conditions.push("je.status = ?");
      params.push(status);
    }

    const whereSql = conditions.join(" AND ");

    // Hitung total
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM tr_journal_entries je WHERE ${whereSql}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Ambil data
    const [dataRows] = await pool.query(
      `SELECT 
         je.id,
         je.entry_no,
         DATE_FORMAT(je.entry_date, '%Y-%m-%d') as entry_date,
         je.description,
         je.status,
         je.total_amount,
         je.reverses_entry_id,
         je.reversed_by_entry_id,
         je.created_by,
         je.created_at,
         je.source_type,
         je.outlet_id
       FROM tr_journal_entries je
       WHERE ${whereSql}
       ORDER BY je.entry_date DESC, je.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [names, outlets] = await Promise.all([
      getUserNames(dataRows.map((r) => r.created_by)),
      getOutlets(),
    ]);
    const outletName = new Map(outlets.map((o) => [o.id, o.name]));
    dataRows.forEach((r) => {
      r.creator_name = names.get(Number(r.created_by)) ?? null;
      r.outlet_name = r.outlet_id ? outletName.get(Number(r.outlet_id)) ?? `Outlet #${r.outlet_id}` : "Pusat";
    });

    return res.json({
      data: dataRows,
      outlets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error("[getJournals] Error:", err);
    return res.status(500).json({ message: "Gagal mengambil daftar jurnal", error: err.message });
  }
}

/**
 * GET /api/finance-ho/journals/:id
 * Mengambil detail jurnal beserta baris-baris debit dan kreditnya
 */
export async function getJournalDetail(req, res) {
  try {
    const { id } = req.params;

    const [headerRows] = await pool.query(
      `SELECT 
         je.id,
         je.entry_no,
         DATE_FORMAT(je.entry_date, '%Y-%m-%d') as entry_date,
         je.description,
         je.status,
         je.total_amount,
         je.reverses_entry_id,
         je.reversed_by_entry_id,
         je.created_by,
         je.created_at,
         je.source_type,
         je.outlet_id,
         je.approved_by,
         je.approved_at,
         je.submitted_at,
         je.reject_note,
         je.attachment_url,
         je.attachment_name,
         rev_from.entry_no as reverses_entry_no,
         rev_by.entry_no as reversed_by_entry_no
       FROM tr_journal_entries je
       LEFT JOIN tr_journal_entries rev_from ON je.reverses_entry_id = rev_from.id
       LEFT JOIN tr_journal_entries rev_by ON je.reversed_by_entry_id = rev_by.id
       WHERE je.id = ?`,
      [id]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ message: "Jurnal tidak ditemukan" });
    }

    const journal = headerRows[0];
    const [uNames, outlets] = await Promise.all([
      getUserNames([journal.created_by, journal.approved_by]),
      getOutlets(),
    ]);
    const outletName = new Map(outlets.map((o) => [o.id, o.name]));
    journal.creator_name = uNames.get(Number(journal.created_by)) ?? null;
    journal.approver_name = uNames.get(Number(journal.approved_by)) ?? null;
    journal.outlet_name = journal.outlet_id ? outletName.get(Number(journal.outlet_id)) ?? `Outlet #${journal.outlet_id}` : "Pusat";

    // Ambil baris jurnal
    const [lineRows] = await pool.query(
      `SELECT 
         jl.id,
         jl.line_no,
         jl.account_id,
         jl.debit,
         jl.credit,
         jl.memo,
         jl.outlet_id,
         a.code as account_code,
         a.name as account_name,
         a.type as account_type,
         a.normal_balance
       FROM tr_journal_lines jl
       LEFT JOIN mst_coa a ON jl.account_id = a.id
       WHERE jl.entry_id = ?
       ORDER BY jl.line_no ASC`,
      [id]
    );

    lineRows.forEach((l) => {
      l.outlet_name = l.outlet_id ? outletName.get(Number(l.outlet_id)) ?? `Outlet #${l.outlet_id}` : null;
    });
    journal.lines = lineRows;

    return res.json({ data: journal });
  } catch (err) {
    console.error("[getJournalDetail] Error:", err);
    return res.status(500).json({ message: "Gagal mengambil detail jurnal", error: err.message });
  }
}


/**
 * POST /api/finance-ho/journals/:id/reverse
 * Membuat Jurnal Pembalik (Reversal Entry)
 */
export async function reverseJournal(req, res) {
  const conn = await pool.getConnection();

  try {
    const { id } = req.params;
    const { entry_date } = req.body;
    const actorId = req.user?.id || null;

    if (!entry_date) {
      return res.status(422).json({
        code: "INVALID_DATE",
        message: "Tanggal jurnal pembalik wajib diisi.",
      });
    }

    await conn.beginTransaction();

    // 1. Lock jurnal asal
    const [origRows] = await conn.query(
      `SELECT * FROM tr_journal_entries WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (origRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Jurnal asal tidak ditemukan." });
    }

    const orig = origRows[0];

    // Hanya jurnal yang sudah diposting yang bisa dibalik (bukan draft / menunggu approval)
    if (orig.status === "DRAFT" || orig.status === "PENDING") {
      await conn.rollback();
      return res.status(422).json({
        code: "JOURNAL_NOT_POSTED",
        message: "Jurnal belum diposting, tidak bisa dibalik. Hapus draft atau tolak pengajuannya.",
      });
    }

    // Aturan 6: Jurnal yang sudah dibalik tidak bisa dibalik lagi
    if (orig.status === "REVERSED" || orig.reversed_by_entry_id) {
      await conn.rollback();
      return res.status(422).json({
        code: "JOURNAL_ALREADY_REVERSED",
        message: "Jurnal ini sudah pernah dibalik sebelumnya.",
      });
    }

    // 2. Ambil baris jurnal asal
    const [origLines] = await conn.query(
      `SELECT * FROM tr_journal_lines WHERE entry_id = ? ORDER BY line_no ASC`,
      [id]
    );

    if (origLines.length === 0) {
      await conn.rollback();
      return res.status(422).json({
        code: "EMPTY_JOURNAL",
        message: "Jurnal asal tidak memiliki baris transaksi.",
      });
    }

    // Jurnal balik tidak boleh jatuh di tanggal yang sudah dikunci
    const lockMsg = await dayLockMessage(entry_date, [orig.outlet_id, ...origLines.map((l) => l.outlet_id)]);
    if (lockMsg) {
      await conn.rollback();
      return res.status(422).json({ code: "DAY_LOCKED", message: lockMsg });
    }

    // 3. Generate nomor jurnal pembalik
    const dObj = new Date(entry_date);
    const yearStr = dObj.getFullYear();
    const monthStr = String(dObj.getMonth() + 1).padStart(2, "0");
    const prefix = `JU-${yearStr}-${monthStr}-`;

    const [lastRows] = await conn.query(
      `SELECT entry_no FROM tr_journal_entries 
       WHERE entry_no LIKE ? 
       ORDER BY entry_no DESC 
       LIMIT 1 FOR UPDATE`,
      [`${prefix}%`]
    );

    let nextSeq = 1;
    if (lastRows.length > 0) {
      const lastNo = lastRows[0].entry_no;
      const parts = lastNo.split("-");
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    const reverseEntryNo = `${prefix}${String(nextSeq).padStart(4, "0")}`;
    const reverseDesc = `Pembalik ${orig.entry_no}: ${orig.description}`;

    // 4. Insert header jurnal pembalik
    const [revHeaderResult] = await conn.query(
      `INSERT INTO tr_journal_entries 
         (entry_no, entry_date, description, status, total_amount, reverses_entry_id, created_by, outlet_id)
       VALUES (?, ?, ?, 'POSTED', ?, ?, ?, ?)`,
      [reverseEntryNo, entry_date, reverseDesc, orig.total_amount, orig.id, actorId, orig.outlet_id ?? null]
    );

    const reverseEntryId = revHeaderResult.insertId;

    // 5. Insert baris pembalik dengan membalik DEBIT dan KREDIT
    for (let i = 0; i < origLines.length; i++) {
      const line = origLines[i];
      // Tukar posisi: debit menjadi kredit, kredit menjadi debit
      const newDebit = line.credit;
      const newCredit = line.debit;
      const memo = line.memo ? `[Pembalik] ${line.memo}` : `Pembalik baris ${line.line_no}`;

      await conn.query(
        `INSERT INTO tr_journal_lines 
           (entry_id, line_no, account_id, debit, credit, memo, outlet_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [reverseEntryId, i + 1, Number(line.account_id), newDebit, newCredit, memo, line.outlet_id ?? null]
      );
    }

    // 6. Update status jurnal asal menjadi REVERSED
    await conn.query(
      `UPDATE tr_journal_entries 
       SET status = 'REVERSED', reversed_by_entry_id = ? 
       WHERE id = ?`,
      [reverseEntryId, orig.id]
    );

    // 7. Catat ke Audit Log
    try {
      await conn.query(
        `INSERT INTO tr_audit_logs 
           (entity, entity_id, action, actor_id, before_value, after_value)
         VALUES ('tr_journal_entries', ?, 'REVERSE', ?, ?, ?)`,
        [
          orig.id,
          actorId,
          JSON.stringify({ status: orig.status, reversed_by_entry_id: null }),
          JSON.stringify({ status: "REVERSED", reversed_by_entry_id: reverseEntryId }),
        ]
      );
    } catch (auditErr) {
      console.warn("[reverseJournal] Gagal mencatat audit log:", auditErr.message);
    }

    await conn.commit();

    return res.status(201).json({
      message: `Jurnal ${orig.entry_no} berhasil dibalik dengan nomor pembalik ${reverseEntryNo}.`,
      reversal_entry_no: reverseEntryNo,
      reversal_id: reverseEntryId,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[reverseJournal] Error:", err);
    return res.status(500).json({ message: "Gagal membalik jurnal", error: err.message });
  } finally {
    conn.release();
  }
}





