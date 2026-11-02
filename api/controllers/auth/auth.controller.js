import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { mainPool } from '../../db/pool.js';
import { JWT_SECRET } from '../../middleware/auth.js';

/**
 * Login SSO: satu akun SuperApp (tabel users + mst_employee) dipakai untuk semua aplikasi.
 * Alfi hanya MEMBACA DB SuperApp (mainPool), lalu menerbitkan JWT miliknya sendiri.
 * Aturan sama dengan SuperApp: karyawan harus aktif (is_deleted = 0, exit_date NULL).
 */
export const login = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }

    const [rows] = await mainPool.query(
      `SELECT u.id, u.name, u.username, u.email, u.role, u.password_hash,
              e.employee_id, e.employee_code, e.full_name, e.profile_path,
              p.position_name, d.department_name
       FROM users u
       INNER JOIN mst_employee e ON e.email = u.email AND e.is_deleted = 0 AND e.exit_date IS NULL
       LEFT JOIN mst_position p ON p.position_id = e.position_id
       LEFT JOIN mst_department d ON d.department_id = e.department_id
       WHERE u.email = ? OR u.username = ?
       LIMIT 1`,
      [username, username]
    );

    const user = rows[0];
    const ok = user?.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fullName: user.full_name || user.name,
    };
    const token = jwt.sign(payload, JWT_SECRET(), { expiresIn: '12h' });

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      token,
      user: {
        ...payload,
        employeeCode: user.employee_code,
        position: user.position_name || null,
        department: user.department_name || null,
        profilePath: user.profile_path || null,
      },
    });
  } catch (error) {
    console.error('[login] Error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
};

// GET /api/auth/me — validasi token yang tersimpan di browser
export const me = (req, res) => res.json({ success: true, user: req.user });
