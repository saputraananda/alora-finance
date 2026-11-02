import jwt from 'jsonwebtoken';

const RELOGIN = 'Token tidak valid atau kadaluwarsa. Silakan masuk kembali.';

export const JWT_SECRET = () => process.env.SESSION_SECRET || 'alfisecret';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Akses ditolak. Token otentikasi tidak ditemukan.',
    });
  }

  jwt.verify(token, JWT_SECRET(), (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: RELOGIN });
    }
    req.user = user;
    next();
  });
};
