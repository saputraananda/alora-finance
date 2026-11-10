import crypto from "crypto";
import multer from "multer";
import ExcelJS from "exceljs";
import { pool, safeQuery, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { dayLockMessage } from "../../utils/dayLock.js";
import { cutoffRange, currentCutoffMonth } from "../dashboard/dashboard.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// REKONSILIASI > BANK (Referensi hal. 14)
// "Mutasi rekening dicocokkan dengan catatan sistem":
//   • Mutasi rekening koran diimpor (CSV/XLSX) per rekening.
//   • Setiap mutasi dicocokkan ke baris jurnal pada akun bank rekening tsb
//     (setoran tunai, settlement QRIS/EDC, transfer pelanggan, dll.) — otomatis atau manual.
//     Satu mutasi boleh dicocokkan ke beberapa baris (mis. transfer QRIS untuk 2 cabang).
//   • Mutasi keluar yang belum tercatat (biaya admin) → "Buat jurnal biaya admin".
//   • Saldo rekening koran dibandingkan dengan saldo akun bank di sistem.
// ════════════════════════════════════════════════════════════════════════════

const LIVE = "je.status IN ('POSTED','REVERSED')";
const TOL = 1;
const near = (a, b) => Math.abs(Number(a) - Number(b)) <= TOL;
const pad2 = (n) => String(n).padStart(2, "0");
const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);


export const BANK_ROLES = { BEBAN_ADMIN_BANK: { label: "Beban Administrasi Bank", code: "5-1008" } };

function periodOf(q) {
  const cur = currentCutoffMonth();
  const year = parseInt(q.year, 10) || cur.year;
  const month = parseInt(q.month, 10) || cur.month;
  return { year, month, key: `${year}-${pad2(month)}`, ...cutoffRange(year, month) };
}

async function loadBank(id) {
  const [rows] = await pool.query(
    `SELECT b.*, a.code AS account_code, a.name AS account_name FROM mst_bank_account b LEFT JOIN mst_coa a ON a.id = b.account_id WHERE b.id = ?`,
    [id]
  );
  const b = rows[0];
  if (!b) return null;
  // Bila satu akun COA dipakai beberapa rekening, saldo/jurnal disaring per cabang rekening itu
  const [[shared]] = await pool.query(
    `SELECT COUNT(*) AS n FROM mst_bank_account WHERE account_id = ? AND is_active = 1 AND id <> ?`,
    [b.account_id, b.id]
  );
  b.shared_coa = Boolean(b.account_id) && shared.n > 0;
  return b;
}

function lineScope(bank) {
  const sql = bank.shared_coa && bank.outlet_id ? " AND jl.outlet_id = ?" : "";
  const params = bank.shared_coa && bank.outlet_id ? [bank.outlet_id] : [];
  return { sql, params };
}

// Baris jurnal pada akun bank yang belum dicocokkan, dalam rentang tanggal
async function candidateLines(bank, from, to) {
  if (!bank.account_id) return [];
  const sc = lineScope(bank);
  const [rows] = await pool.query(
    `SELECT jl.id, je.entry_no, DATE_FORMAT(je.entry_date,'%Y-%m-%d') AS entry_date, je.description, jl.memo,
            (jl.debit - jl.credit) AS amount, je.source_type
     FROM tr_journal_lines jl
     JOIN tr_journal_entries je ON je.id = jl.entry_id
     LEFT JOIN tr_bank_match m ON m.journal_line_id = jl.id
     WHERE ${LIVE} AND jl.account_id = ? AND m.journal_line_id IS NULL
       AND je.entry_date BETWEEN ? AND ?${sc.sql}
     ORDER BY je.entry_date, jl.id`,
    [bank.account_id, from, to, ...sc.params]
  );
  return rows.map((r) => ({ ...r, amount: toFixed2(r.amount) }));
}

// ── GET /rekon/bank?bank_account_id=&year=&month= ───────────────────────
export async function getBankRecon(req, res) {
  try {
    const p = periodOf(req.query);
    const [banks] = await pool.query(
      `SELECT b.id, b.outlet_id, b.bank_name, b.account_no, b.holder, b.account_id, a.code AS account_code
       FROM mst_bank_account b LEFT JOIN mst_coa a ON a.id = b.account_id WHERE b.is_active = 1 ORDER BY b.outlet_id, b.id`
    );
    const outlets = await getOutlets();
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));
    const list = banks.map((b) => ({ ...b, outlet_name: b.outlet_id ? nameOf.get(Number(b.outlet_id)) || `Outlet #${b.outlet_id}` : "Pusat" }));
    const bankId = Number(req.query.bank_account_id) || list[0]?.id;
    if (!bankId) return res.json({ period: p, banks: list, bank: null, rows: [], candidates: [], summary: null });
    const bank = await loadBank(bankId);
    if (!bank) return res.status(404).json({ message: "Rekening tidak ditemukan." });

    const [stmts] = await pool.query(
      `SELECT s.*, DATE_FORMAT(s.trx_date,'%Y-%m-%d') AS d FROM tr_bank_statement s
       WHERE s.bank_account_id = ? AND s.trx_date BETWEEN ? AND ? ORDER BY s.trx_date, s.id`,
      [bankId, p.start, p.end]
    );
    const ids = stmts.map((s) => s.id);
    const [matches] = ids.length
      ? await pool.query(
          `SELECT m.statement_id, jl.id AS line_id, je.id AS entry_id, je.entry_no, jl.memo, (jl.debit - jl.credit) AS amount
           FROM tr_bank_match m JOIN tr_journal_lines jl ON jl.id = m.journal_line_id JOIN tr_journal_entries je ON je.id = jl.entry_id
           WHERE m.statement_id IN (?)`,
          [ids]
        )
      : [[]];
    const mBy = new Map();
    matches.forEach((m) => {
      if (!mBy.has(m.statement_id)) mBy.set(m.statement_id, []);
      mBy.get(m.statement_id).push({ ...m, amount: toFixed2(m.amount) });
    });
    const rows = stmts.map((s) => {
      const ms = mBy.get(s.id) || [];
      return {
        id: s.id,
        date: s.d,
        description: s.description,
        amount: toFixed2(s.amount),
        balance: s.balance == null ? null : toFixed2(s.balance),
        matched: ms.length > 0,
        match_mode: s.match_mode,
        matches: ms,
      };
    });

    // Saldo rekening koran: input manual per periode, atau saldo baris terakhir pada file
    const [[bal]] = await pool.query(`SELECT closing_balance FROM tr_bank_balance WHERE bank_account_id = ? AND period_key = ?`, [bankId, p.key]).then(([r]) => [r]);
    const lastWithBalance = [...rows].reverse().find((r) => r.balance != null);
    const statementBalance = bal ? toFixed2(bal.closing_balance) : lastWithBalance ? lastWithBalance.balance : null;

    let systemBalance = null;
    if (bank.account_id) {
      const sc = lineScope(bank);
      const [[sb]] = await pool.query(
        `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS bal FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id
         WHERE ${LIVE} AND jl.account_id = ? AND je.entry_date <= ?${sc.sql}`,
        [bank.account_id, p.end, ...sc.params]
      ).then(([r]) => [r]);
      systemBalance = toFixed2(sb.bal);
    }

    const candidates = await candidateLines(bank, addDays(p.start, -5), addDays(p.end, 5));
    return res.json({
      period: { year: p.year, month: p.month, key: p.key, from: p.start, to: p.end },
      banks: list,
      bank: {
        id: bank.id, bank_name: bank.bank_name, account_no: bank.account_no, holder: bank.holder,
        outlet_name: bank.outlet_id ? nameOf.get(Number(bank.outlet_id)) || `Outlet #${bank.outlet_id}` : "Pusat",
        account: bank.account_code ? `${bank.account_code} ${bank.account_name}` : null,
        shared_coa: bank.shared_coa,
      },
      rows,
      candidates,
      summary: {
        statement_balance: statementBalance,
        statement_balance_source: bal ? "MANUAL" : lastWithBalance ? "FILE" : null,
        system_balance: systemBalance,
        diff: statementBalance != null && systemBalance != null ? toFixed2(statementBalance - systemBalance) : null,
        total: rows.length,
        matched: rows.filter((r) => r.matched).length,
        unmatched: rows.filter((r) => !r.matched).length,
      },
    });
  } catch (err) {
    console.error("[getBankRecon]", err);
    return res.status(500).json({ message: "Gagal memuat rekonsiliasi bank", error: err.message });
  }
}

// ── Impor mutasi rekening koran ─────────────────────────────────────────
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    const ok = /\.(csv|xlsx)$/i.test(file.originalname);
    cb(ok ? null : new Error("File rekening koran harus berformat CSV atau XLSX."), ok);
  },
});
export const bankFileMiddleware = (req, res, next) =>
  memUpload.single("file")(req, res, (err) => (err ? res.status(422).json({ message: err.message }) : next()));

const ALIASES = {
  date: ["tanggal", "tgl", "date", "tanggal_transaksi", "posting_date"],
  desc: ["keterangan", "deskripsi", "description", "uraian", "remark", "berita"],
  amount: ["jumlah", "nominal", "amount", "mutasi"],
  debit: ["debit", "db", "keluar", "penarikan"],
  credit: ["kredit", "credit", "cr", "masuk", "setoran"],
  balance: ["saldo", "balance", "saldo_akhir"],
};
const normH = (h) => String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function parseCsv(text) {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/)[0] || "";
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (q) {
      if (ch === '"' && clean[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = [];
    r.eachCell({ includeEmpty: true }, (c, col) => {
      let v = c.value;
      if (v && typeof v === "object" && !(v instanceof Date)) v = v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join("") : "");
      vals[col - 1] = v;
    });
    rows.push(vals);
  });
  return rows;
}

function parseDate(v) {
  if (v instanceof Date) return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

function parseMoney(v) {
  if (typeof v === "number") return toFixed2(v);
  const s = String(v ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-") || /\bDB\b/i.test(s);
  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/\./g, "");
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? null : toFixed2(neg ? -n : n);
}

export async function importBankStatement(req, res) {
  try {
    const bankId = Number(req.body?.bank_account_id);
    if (!bankId) return res.status(422).json({ message: "Pilih rekening bank." });
    if (!req.file) return res.status(422).json({ message: "Pilih file rekening koran (CSV atau XLSX)." });
    const bank = await loadBank(bankId);
    if (!bank) return res.status(404).json({ message: "Rekening tidak ditemukan." });

    const table = /\.xlsx$/i.test(req.file.originalname) ? await parseXlsx(req.file.buffer) : parseCsv(req.file.buffer.toString("utf8"));
    if (table.length < 2) return res.status(422).json({ message: "File kosong atau tidak ada baris data." });
    const idx = {};
    table[0].forEach((h, i) => {
      const n = normH(h);
      for (const [k, list] of Object.entries(ALIASES)) if (idx[k] === undefined && list.includes(n)) idx[k] = i;
    });
    if (idx.date === undefined || idx.desc === undefined || (idx.amount === undefined && idx.debit === undefined && idx.credit === undefined)) {
      return res.status(422).json({ message: "Kolom wajib: tanggal, keterangan, dan jumlah (atau debit/kredit). Unduh template untuk contoh." });
    }

    let inserted = 0;
    let duplicate = 0;
    const errors = [];
    for (let r = 1; r < table.length; r++) {
      const row = table[r];
      const get = (k) => (idx[k] === undefined ? undefined : row[idx[k]]);
      const d = parseDate(get("date"));
      const desc = String(get("desc") ?? "").trim().slice(0, 255);
      let amount = null;
      if (idx.amount !== undefined) amount = parseMoney(get("amount"));
      else {
        // Konvensi rekening koran: Debit = uang keluar, Kredit = uang masuk
        const db = parseMoney(get("debit")) || 0;
        const cr = parseMoney(get("credit")) || 0;
        amount = toFixed2(Math.abs(cr) - Math.abs(db));
      }
      const balance = idx.balance === undefined ? null : parseMoney(get("balance"));
      if (!d || !desc || amount === null || amount === 0) {
        errors.push(`Baris ${r + 1}: ${!d ? "tanggal tidak valid" : !desc ? "keterangan kosong" : "jumlah kosong/0"}.`);
        continue;
      }
      const hash = crypto.createHash("sha1").update(`${bankId}|${d}|${desc}|${amount}|${balance ?? ""}`).digest("hex");
      const [ins] = await pool.query(
        `INSERT IGNORE INTO tr_bank_statement (bank_account_id, trx_date, description, amount, balance, row_hash, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [bankId, d, desc, amount, balance, hash, req.user?.id || null]
      );
      if (ins.affectedRows) inserted++;
      else duplicate++;
    }
    return res.status(errors.length && !inserted ? 422 : 201).json({
      message: `${inserted} mutasi diimpor${duplicate ? `, ${duplicate} duplikat dilewati` : ""}${errors.length ? `, ${errors.length} baris bermasalah` : ""}.`,
      inserted,
      duplicate,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error("[importBankStatement]", err);
    return res.status(500).json({ message: "Gagal mengimpor rekening koran", error: err.message });
  }
}

// ── POST /rekon/bank/auto-match {bank_account_id, year, month} ──────────
// Mutasi dicocokkan ke satu baris jurnal dengan nominal & arah sama, tanggal jurnal H-3 s/d H+1.
export async function autoMatch(req, res) {
  try {
    const p = periodOf(req.body || {});
    const bank = await loadBank(Number(req.body?.bank_account_id));
    if (!bank) return res.status(404).json({ message: "Rekening tidak ditemukan." });
    if (!bank.account_id) return res.status(422).json({ message: "Rekening ini belum punya akun COA. Atur di Pengaturan › Rekening bank." });
    const [stmts] = await pool.query(
      `SELECT s.id, DATE_FORMAT(s.trx_date,'%Y-%m-%d') AS d, s.amount FROM tr_bank_statement s
       LEFT JOIN tr_bank_match m ON m.statement_id = s.id
       WHERE s.bank_account_id = ? AND s.trx_date BETWEEN ? AND ? AND m.statement_id IS NULL ORDER BY s.trx_date, s.id`,
      [bank.id, p.start, p.end]
    );
    const cands = await candidateLines(bank, addDays(p.start, -5), addDays(p.end, 5));
    const used = new Set();
    let matched = 0;
    for (const s of stmts) {
      const amt = toFixed2(s.amount);
      const pick = cands
        .filter((c) => !used.has(c.id) && near(c.amount, amt))
        .map((c) => ({ c, gap: dayDiff(s.d, c.entry_date) }))
        .filter((x) => x.gap >= -1 && x.gap <= 3)
        .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))[0];
      if (!pick) continue;
      used.add(pick.c.id);
      await pool.query(`INSERT IGNORE INTO tr_bank_match (statement_id, journal_line_id) VALUES (?, ?)`, [s.id, pick.c.id]);
      await pool.query(`UPDATE tr_bank_statement SET match_mode='AUTO', matched_by=?, matched_at=NOW() WHERE id=?`, [req.user?.id || null, s.id]);
      matched++;
    }
    return res.json({ message: matched ? `${matched} mutasi dicocokkan otomatis.` : "Tidak ada mutasi yang bisa dicocokkan otomatis.", matched });
  } catch (err) {
    console.error("[autoMatch]", err);
    return res.status(500).json({ message: "Gagal mencocokkan otomatis", error: err.message });
  }
}

// ── POST /rekon/bank/match {statement_id, line_ids:[]} ─ cocokkan manual ─
export async function manualMatch(req, res) {
  const conn = await pool.getConnection();
  try {
    const sid = Number(req.body?.statement_id);
    const lineIds = [...new Set((req.body?.line_ids || []).map(Number).filter(Boolean))];
    if (!sid || !lineIds.length) return res.status(422).json({ message: "Pilih mutasi dan minimal satu baris jurnal." });
    const [[s]] = await conn.query(`SELECT * FROM tr_bank_statement WHERE id = ?`, [sid]).then(([r]) => [r]);
    if (!s) return res.status(404).json({ message: "Mutasi tidak ditemukan." });
    const bank = await loadBank(s.bank_account_id);
    const sc = lineScope(bank);
    const [lines] = await conn.query(
      `SELECT jl.id, (jl.debit - jl.credit) AS amount FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id
       LEFT JOIN tr_bank_match m ON m.journal_line_id = jl.id
       WHERE jl.id IN (?) AND jl.account_id = ? AND ${LIVE} AND m.journal_line_id IS NULL${sc.sql}`,
      [lineIds, bank.account_id, ...sc.params]
    );
    if (lines.length !== lineIds.length) return res.status(422).json({ message: "Ada baris jurnal yang tidak valid atau sudah dicocokkan." });
    const sum = toFixed2(lines.reduce((t, l) => t + Number(l.amount), 0));
    if (!near(sum, s.amount)) {
      return res.status(422).json({ message: `Jumlah baris jurnal (Rp ${new Intl.NumberFormat("id-ID").format(sum)}) tidak sama dengan mutasi (Rp ${new Intl.NumberFormat("id-ID").format(Number(s.amount))}).` });
    }
    await conn.beginTransaction();
    await conn.query(`DELETE FROM tr_bank_match WHERE statement_id = ?`, [sid]);
    for (const id of lineIds) await conn.query(`INSERT INTO tr_bank_match (statement_id, journal_line_id) VALUES (?, ?)`, [sid, id]);
    await conn.query(`UPDATE tr_bank_statement SET match_mode='MANUAL', matched_by=?, matched_at=NOW() WHERE id=?`, [req.user?.id || null, sid]);
    await conn.commit();
    return res.json({ message: "Mutasi dicocokkan." });
  } catch (err) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ message: "Gagal mencocokkan", error: err.message });
  } finally {
    conn.release();
  }
}

export async function unmatch(req, res) {
  try {
    const sid = Number(req.body?.statement_id);
    await pool.query(`DELETE FROM tr_bank_match WHERE statement_id = ?`, [sid]);
    await pool.query(`UPDATE tr_bank_statement SET match_mode=NULL, matched_by=NULL, matched_at=NULL WHERE id=?`, [sid]);
    return res.json({ message: "Pencocokan dibatalkan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal membatalkan pencocokan", error: err.message });
  }
}

// ── POST /rekon/bank/admin-fee {statement_id} — "Buat jurnal biaya admin" ─
export async function createAdminFeeJournal(req, res) {
  const conn = await pool.getConnection();
  try {
    const sid = Number(req.body?.statement_id);
    const [[s]] = await conn.query(`SELECT *, DATE_FORMAT(trx_date,'%Y-%m-%d') AS d FROM tr_bank_statement WHERE id = ?`, [sid]).then(([r]) => [r]);
    if (!s) return res.status(404).json({ message: "Mutasi tidak ditemukan." });
    if (Number(s.amount) >= 0) return res.status(422).json({ message: "Jurnal biaya admin hanya untuk mutasi keluar." });
    const [[m]] = await conn.query(`SELECT COUNT(*) AS n FROM tr_bank_match WHERE statement_id = ?`, [sid]).then(([r]) => [r]);
    if (m.n) return res.status(422).json({ message: "Mutasi ini sudah dicocokkan." });
    const bank = await loadBank(s.bank_account_id);
    if (!bank?.account_id) return res.status(422).json({ message: "Rekening belum punya akun COA." });
    const [[role]] = await conn.query(`SELECT account_id FROM mst_account_map WHERE role = 'BEBAN_ADMIN_BANK'`).then(([r]) => [r]);
    if (!role?.account_id) return res.status(422).json({ message: "Peran 'Beban Administrasi Bank' belum dipetakan di Pengaturan." });
    const lockMsg = await dayLockMessage(s.d, [bank.outlet_id]);
    if (lockMsg) return res.status(422).json({ message: lockMsg });

    const amount = toFixed2(Math.abs(Number(s.amount)));
    await conn.beginTransaction();
    const base = `JU-BANK-${s.d.slice(2, 4)}${s.d.slice(5, 7)}${s.d.slice(8, 10)}-${sid}`;
    const [h] = await conn.query(
      `INSERT INTO tr_journal_entries (entry_no, entry_date, description, status, total_amount, created_by, source_type, source_ref, outlet_id, approved_by, approved_at)
       VALUES (?, ?, ?, 'POSTED', ?, ?, 'REKON_BANK', ?, ?, ?, NOW())`,
      [base, s.d, `Biaya administrasi bank ${bank.bank_name} ${bank.account_no}: ${s.description}`.slice(0, 500), amount, req.user?.id || null, base, bank.outlet_id || null, req.user?.id || null]
    );
    await conn.query(
      `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, 1, ?, ?, 0, ?, ?)`,
      [h.insertId, role.account_id, amount, "Biaya administrasi bank", bank.outlet_id || null]
    );
    const [l2] = await conn.query(
      `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, 2, ?, 0, ?, ?, ?)`,
      [h.insertId, bank.account_id, amount, s.description.slice(0, 200), bank.outlet_id || null]
    );
    await conn.query(`INSERT INTO tr_bank_match (statement_id, journal_line_id) VALUES (?, ?)`, [sid, l2.insertId]);
    await conn.query(`UPDATE tr_bank_statement SET match_mode='JURNAL', matched_by=?, matched_at=NOW() WHERE id=?`, [req.user?.id || null, sid]);
    try {
      await conn.query(
        `INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('tr_journal_entries', ?, 'CREATE', ?, ?)`,
        [h.insertId, req.user?.id || null, JSON.stringify({ entry_no: base, source: "REKON_BANK", statement_id: sid })]
      );
    } catch {
      /* audit tidak menggagalkan */
    }
    await conn.commit();
    return res.status(201).json({ message: `Jurnal ${base} dibuat dan mutasi dicocokkan.` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[createAdminFeeJournal]", err);
    return res.status(500).json({ message: "Gagal membuat jurnal biaya admin", error: err.message });
  } finally {
    conn.release();
  }
}

// ── PUT /rekon/bank/balance {bank_account_id, year, month, closing_balance} ─
export async function saveStatementBalance(req, res) {
  try {
    const p = periodOf(req.body || {});
    const bankId = Number(req.body?.bank_account_id);
    const v = req.body?.closing_balance;
    if (!bankId) return res.status(422).json({ message: "Pilih rekening." });
    if (v === "" || v == null) {
      await pool.query(`DELETE FROM tr_bank_balance WHERE bank_account_id = ? AND period_key = ?`, [bankId, p.key]);
      return res.json({ message: "Saldo rekening koran dikosongkan." });
    }
    const n = Number(v);
    if (Number.isNaN(n)) return res.status(422).json({ message: "Saldo tidak valid." });
    await pool.query(
      `INSERT INTO tr_bank_balance (bank_account_id, period_key, closing_balance) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE closing_balance = VALUES(closing_balance)`,
      [bankId, p.key, toFixed2(n)]
    );
    return res.json({ message: "Saldo rekening koran disimpan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan saldo", error: err.message });
  }
}

export async function deleteStatement(req, res) {
  try {
    const [[m]] = await pool.query(`SELECT COUNT(*) AS n FROM tr_bank_match WHERE statement_id = ?`, [req.params.id]).then(([r]) => [r]);
    if (m.n) return res.status(422).json({ message: "Batalkan pencocokan dulu sebelum menghapus mutasi." });
    await pool.query(`DELETE FROM tr_bank_statement WHERE id = ?`, [req.params.id]);
    return res.json({ message: "Mutasi dihapus." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menghapus mutasi", error: err.message });
  }
}

export function bankTemplate(_req, res) {
  const csv =
    "﻿" +
    ["tanggal;keterangan;debit;kredit;saldo", "2026-11-02;Setoran tunai Cabang A;;2980000;412395000", "2026-11-02;Transfer penyedia QRIS;;4369200;416764200", "2026-11-03;Biaya administrasi;15000;;416749200"].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="template-rekening-koran.csv"');
  return res.send(csv);
}
