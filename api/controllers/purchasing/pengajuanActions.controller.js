import { mainPool, pool as alfiPool } from '../../db/pool.js';
import { loadMe } from '../../utils/pengajuanAccess.js';

// ════════════════════════════════════════════════════════════════════════════
// PEMBELIAN › AKSI FINANCE  — MENULIS ke database SuperApp (tr_purchase_request*)
//
// Aturan meniru SuperApp (backend-superapp/.../pengajuan.controller.js) agar kedua
// aplikasi konsisten selama masa transisi:
//   • Approve Finance : pengajuan status 4 → 5 ; reimburse status 2 → 5
//                       (Direktur ikut ter-approve otomatis: employee_id 2)
//   • Tolak Finance   : pengajuan status 4 → 9 ; reimburse status 2 → 9 (alasan wajib)
// Izin: siapa pun yang login ke alfi (sudah dipastikan Finance oleh requireFinance);
// syarat job level SPV di SuperApp sengaja tidak dipakai (keputusan user).
//
// Perubahan status memakai kondisi "WHERE status = ..." sehingga bila Finance menekan
// tombol bersamaan di SuperApp dan alfi, hanya satu yang berhasil.
// ════════════════════════════════════════════════════════════════════════════

const BOD_EMPLOYEE_ID = 2; // Direktur — auto-approve, sama seperti SuperApp

export const sanitize = (str) => {
  if (str == null) return null;
  return String(str)
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
};

export async function audit(req, prId, action, after) {
  try {
    await alfiPool.query(
      `INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('tr_purchase_request', ?, ?, ?, ?)`,
      [prId, action, req.user?.id ?? null, JSON.stringify(after)]
    );
  } catch (err) {
    console.error('[purchasing.audit]', err.message);
  }
}

export async function loadPr(conn, id) {
  const [rows] = await conn.query(
    `SELECT pr_id, pr_code, type, status FROM tr_purchase_request WHERE pr_id = ? AND is_deleted = 0 FOR UPDATE`,
    [id]
  );
  return rows[0] || null;
}

export const writeLog = (conn, prId, action, employeeId, name, note) =>
  conn.query(
    `INSERT INTO tr_purchase_request_log (pr_id, action, by_employee_id, by_name, note) VALUES (?, ?, ?, ?, ?)`,
    [prId, action, employeeId || null, name || null, note]
  );

// POST /purchasing/requests/:id/approve   body: { finance_note? }
export async function approveFinance(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
  const me = await loadMe(req);
  if (!me) return res.status(422).json({ success: false, message: 'Akun ini belum terhubung ke data karyawan, sehingga tidak bisa melakukan aksi. Hubungi admin.' });
  const note = req.body?.finance_note ? sanitize(req.body.finance_note) : null;

  const conn = await mainPool.getConnection();
  try {
    await conn.beginTransaction();
    const pr = await loadPr(conn, id);
    if (!pr) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Pengajuan tidak ditemukan.' });
    }
    const fromStatus = pr.type === 'reimburse' ? 2 : 4;
    if (Number(pr.status) !== fromStatus) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: pr.type === 'reimburse'
          ? 'Reimburse belum disetujui SPV Departemen, atau sudah diproses.'
          : 'Pengajuan belum siap untuk approval Finance (belum PR Ready), atau sudah diproses.',
      });
    }

    const [upd] = await conn.query(
      `UPDATE tr_purchase_request SET
          status = 5,
          approved_finance_by = ?, approved_finance_at = NOW(),
          finance_note = ?,
          approved_bod_by = ?, approved_bod_at = NOW(),
          updated_at = NOW()
       WHERE pr_id = ? AND status = ?`,
      [me.employee_id, note, BOD_EMPLOYEE_ID, id, fromStatus]
    );
    if (!upd.affectedRows) {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Status pengajuan baru saja berubah. Muat ulang daftar.' });
    }

    await writeLog(conn, id, 'approved_finance', me.employee_id, me.full_name,
      note ? `Disetujui SPV Finance | ${note}` : 'Disetujui SPV Finance — menunggu pembayaran');
    const [dir] = await conn.query(`SELECT full_name FROM mst_employee WHERE employee_id = ? LIMIT 1`, [BOD_EMPLOYEE_ID]);
    await writeLog(conn, id, 'approved_bod', BOD_EMPLOYEE_ID, dir[0]?.full_name || 'Direktur',
      'Disetujui Direktur (otomatis bersamaan dengan SPV Finance)');
    await conn.commit();

    await audit(req, id, 'APPROVE', { pr_code: pr.pr_code, from: fromStatus, to: 5, by: me.full_name, via: 'alfi' });
    res.json({ success: true, message: `${pr.pr_code} disetujui — menunggu pembayaran.` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('[purchasing.approveFinance]', err);
    res.status(500).json({ success: false, message: 'Gagal menyetujui pengajuan.' });
  } finally {
    conn.release();
  }
}

// POST /purchasing/requests/:id/reject   body: { reason }
export async function rejectFinance(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
  const me = await loadMe(req);
  if (!me) return res.status(422).json({ success: false, message: 'Akun ini belum terhubung ke data karyawan, sehingga tidak bisa melakukan aksi. Hubungi admin.' });
  const reason = sanitize(req.body?.reason);
  if (!reason) return res.status(400).json({ success: false, message: 'Alasan penolakan wajib diisi.' });

  const conn = await mainPool.getConnection();
  try {
    await conn.beginTransaction();
    const pr = await loadPr(conn, id);
    if (!pr) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Pengajuan tidak ditemukan.' });
    }
    const fromStatus = pr.type === 'reimburse' ? 2 : 4;
    if (Number(pr.status) !== fromStatus) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Pengajuan tidak bisa ditolak pada status ini.' });
    }

    const [upd] = await conn.query(
      `UPDATE tr_purchase_request SET
          status = 9, rejected_by = ?, rejected_at = NOW(),
          rejection_reason = ?, updated_at = NOW()
       WHERE pr_id = ? AND status = ?`,
      [me.employee_id, reason, id, fromStatus]
    );
    if (!upd.affectedRows) {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Status pengajuan baru saja berubah. Muat ulang daftar.' });
    }

    await writeLog(conn, id, 'rejected_finance', me.employee_id, me.full_name, reason);
    await conn.commit();

    await audit(req, id, 'REJECT', { pr_code: pr.pr_code, from: fromStatus, to: 9, by: me.full_name, reason, via: 'alfi' });
    res.json({ success: true, message: `${pr.pr_code} ditolak.` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('[purchasing.rejectFinance]', err);
    res.status(500).json({ success: false, message: 'Gagal menolak pengajuan.' });
  } finally {
    conn.release();
  }
}
