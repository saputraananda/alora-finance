import { mainPool } from '../db/pool.js';

// Pengenal tim Finance disamakan dengan SuperApp (modul Pengajuan) selama masa transisi:
// position_name memuat "finance" / "accounting" (termasuk typo "accountiing" di database).
// Sumber: backend-superapp/controllers/PurchaseRequest/pengajuan.controller.js (isFinance).
export const isFinance = (positionName) => {
  if (!positionName) return false;
  const pos = String(positionName).toLowerCase();
  return pos.includes('finance') || pos.includes('accounting') || pos.includes('accountiing');
};

// Pembatasan "hanya Finance" untuk menu Pembelian. SEMENTARA DIMATIKAN (semua pengguna alfi boleh),
// sesuai keputusan: hak akses diatur belakangan. Nyalakan lagi dengan PURCHASING_REQUIRE_FINANCE=true di .env.
export const financeGateOn = () => String(process.env.PURCHASING_REQUIRE_FINANCE || '').toLowerCase() === 'true';

/** Data karyawan dari user yang login (dicari lewat email, lalu kode karyawan; sama seperti saat login). */
export async function loadMe(req) {
  if (req._me !== undefined) return req._me;
  let me = null;
  if (req.user?.email) {
    const [rows] = await mainPool.query(
      `SELECT e.employee_id, e.full_name, e.job_level_id, e.department_id, p.position_name
       FROM mst_employee e
       LEFT JOIN mst_position p ON p.position_id = e.position_id
       WHERE e.email = ? AND e.is_deleted = 0 AND e.exit_date IS NULL
       LIMIT 1`,
      [req.user.email]
    );
    me = rows[0] || null;
  }
  if (!me && req.user?.employeeCode) {
    const [rows] = await mainPool.query(
      `SELECT e.employee_id, e.full_name, e.job_level_id, e.department_id, p.position_name
       FROM mst_employee e
       LEFT JOIN mst_position p ON p.position_id = e.position_id
       WHERE e.employee_code = ? AND e.is_deleted = 0 AND e.exit_date IS NULL
       LIMIT 1`,
      [req.user.employeeCode]
    );
    me = rows[0] || null;
  }
  req._me = me;
  return me;
}

/** Middleware: hanya tim Finance. Dipasang di SEMUA endpoint Pembelian (termasuk detail). */
export async function requireFinance(req, res, next) {
  try {
    if (!financeGateOn()) return next(); // pembatasan Finance dimatikan sementara
    const me = await loadMe(req);
    if (!me) return res.status(403).json({ success: false, code: 'NO_ACCESS', message: 'Data karyawan tidak ditemukan.' });
    if (!isFinance(me.position_name)) {
      return res.status(403).json({ success: false, code: 'NO_ACCESS', message: 'Akses ditolak: menu Pembelian hanya untuk tim Finance.' });
    }
    next();
  } catch (err) {
    console.error('[requireFinance]', err);
    res.status(500).json({ success: false, message: 'Gagal memeriksa hak akses.' });
  }
}
