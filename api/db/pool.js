import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pastikan env ter-load juga bila file ini diimpor langsung oleh script
const envFile = process.env.NODE_ENV === 'production' ? '.env.prod' : '.env';
const envPath = path.resolve(__dirname, '../../', envFile);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const basePoolOptions = {
  timezone: '+07:00',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000,
};

// DB utama SuperApp (tabel users + mst_employee) — dipakai login SSO & lookup nama user.
// Hanya DIBACA oleh Alfi. Penamaan sama dengan linen-management-system.
export const mainPool = mysql.createPool({
  ...basePoolOptions,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// DB aplikasi Alfi sendiri (development: alfi, production: alfi_prod) — tabel tr_*
export const alfiPool = mysql.createPool({
  ...basePoolOptions,
  host: process.env.DB_HOST_ALFI,
  port: parseInt(process.env.DB_PORT_ALFI || '3306'),
  user: process.env.DB_USER_ALFI,
  password: process.env.DB_PASS_ALFI,
  database: process.env.DB_NAME_ALFI,
});

// DB POS my-waschen — HANYA DIBACA oleh Alfi (sumber revenue, kas kecil, setoran).
// Pakai user MySQL dengan izin SELECT saja. Jangan pernah menulis ke pool ini.
export const myWaschenPool = mysql.createPool({
  ...basePoolOptions,
  host: process.env.DB_HOST_MY_WASCHEN,
  port: parseInt(process.env.DB_PORT_MY_WASCHEN || '3306'),
  user: process.env.DB_USER_MY_WASCHEN,
  password: process.env.DB_PASS_MY_WASCHEN,
  database: process.env.DB_NAME_MY_WASCHEN,
});

// Alias: controller finance memakai `pool` = DB Alfi
export const pool = alfiPool;

const RETRYABLE = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT']);

// Query dengan satu kali retry bila koneksi terputus
export async function safeQuery(sql, params) {
  try {
    return await alfiPool.query(sql, params);
  } catch (err) {
    if (RETRYABLE.has(err?.code)) {
      return alfiPool.query(sql, params);
    }
    throw err;
  }
}

// Daftar outlet/cabang dari POS my-waschen (id → nama). Gagal koneksi → peta kosong.
export async function getOutlets() {
  try {
    const [rows] = await myWaschenPool.query('SELECT id, name, is_event FROM mst_outlet ORDER BY id');
    return rows.map((r) => ({ id: Number(r.id), name: r.name, is_event: Number(r.is_event) === 1 }));
  } catch (err) {
    console.error('[getOutlets] lookup outlet POS gagal:', err.message);
    return [];
  }
}

// Ambil nama user dari DB SuperApp (mainPool). Mengembalikan Map<id, name>.
// Gagal koneksi DB SuperApp tidak boleh merusak halaman: nama dikosongkan saja.
export async function getUserNames(ids = []) {
  const unique = [...new Set(ids.map(Number).filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;
  try {
    const [rows] = await mainPool.query('SELECT id, name FROM users WHERE id IN (?)', [unique]);
    rows.forEach((r) => map.set(Number(r.id), r.name));
  } catch (err) {
    console.error('[getUserNames] lookup user SuperApp gagal:', err.message);
  }
  return map;
}

