import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { pool, safeQuery, myWaschenPool, getOutlets, getUserNames } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { computeDay, loadAccountMap } from "../pos/pos.controller.js";
import { loadOutletOverrides } from "../../utils/accountResolver.js";
import { loadStartDates, beforeStart, startMessage } from "../../utils/outletStart.js";
import { lockDateMessage } from "../../utils/dayLock.js";

// ════════════════════════════════════════════════════════════════════════════
// REKONSILIASI HARIAN — per cabang, per hari, per metode bayar
//   POS  =  uang yang ditemukan di mutasi bank (tunai, QRIS, EDC)  (+ MDR dari selisih yang dijelaskan)
// Aturan dari "Konsep Akuntansi Laundry Multi-Cabang" (hal. 12–15):
//   • Tunai, QRIS, dan EDC dicocokkan ke mutasi bank di Rekonsiliasi Transaksi (tidak ada impor settlement).
//   • Kas kurang → dijelaskan; jadi Selisih Kas / Piutang Karyawan. Kas lebih → Pendapatan Lain.
//   • MDR = selisih QRIS/EDC (POS lebih besar dari bank) yang sudah dijelaskan Finance: Dr Beban MDR, Cr Piutang QRIS/EDC.
//   • QRIS/EDC belum ditemukan di bank → tetap di piutang, hari belum bisa dikunci.
// ════════════════════════════════════════════════════════════════════════════

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, "../../../uploads/rekon");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const TOLERANCE = 1; // Rp, untuk pembulatan

export const ROLES = {
  BEBAN_MDR: { label: "Beban MDR", code: "5-1009" },
  SELISIH_KAS: { label: "Selisih Kas", code: "5-1010" },
  PIUTANG_KARYAWAN: { label: "Piutang Karyawan", code: "1-1009" },
  PENDAPATAN_LAIN: { label: "Pendapatan Lain-lain", code: "4-1003" },
};

// ── Upload slip setoran (data lama) ─────────────────────────────────────
const slipUpload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, UPLOAD_DIR),
    filename: (_r, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    const ok = /\.(jpe?g|png|webp|pdf)$/i.test(file.originalname);
    cb(ok ? null : new Error("Slip harus berupa JPG, PNG, WEBP, atau PDF (maks. 5 MB)."), ok);
  },
});
const wrap = (mw) => (req, res, next) =>
  mw(req, res, (err) => (err ? res.status(422).json({ message: err.message }) : next()));
export const slipMiddleware = wrap(slipUpload.single("file"));

export function uploadSlip(req, res) {
  if (!req.file) return res.status(422).json({ message: "File tidak ditemukan." });
  return res.status(201).json({ url: `/uploads/rekon/${req.file.filename}`, name: req.file.originalname });
}

// ── Helpers ─────────────────────────────────────────────────────────────
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const yymmdd = (d) => `${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}`;
const num = (v) => toFixed2(v || 0);
const near = (a, b) => Math.abs(a - b) <= TOLERANCE;

async function loadRoles() {
  const map = await loadAccountMap();
  return map;
}

// ── Hitung rekonsiliasi satu hari untuk semua cabang ────────────────────
async function buildDay(date) {
  const [posRows, outlets, accMap, ov, [methodCfgRows]] = await Promise.all([
    computeDay(date),
    getOutlets(),
    loadRoles(),
    loadOutletOverrides(),
    pool.query(`SELECT code, mdr_percent, tolerance FROM mst_payment_method`),
  ]);
  const cfg = new Map(methodCfgRows.map((m) => [m.code, m]));
  const starts = await loadStartDates();
  const codeRows = await myWaschenPool.query(`SELECT id, outlet_code FROM mst_outlet`).then(([r]) => r).catch(() => []);
  const codeOf = new Map(codeRows.map((r) => [Number(r.id), r.outlet_code]));

  const [[deps], [sets], [dailies], [postedRows], [bankCash]] = await Promise.all([
    pool.query(`SELECT * FROM tr_cash_deposit WHERE sales_date = ?`, [date]),
    // QRIS/EDC yang sudah dicocokkan ke mutasi bank (Rekonsiliasi Transaksi). counter_amount = bagian nominal bank untuk baris ini.
    // Selisih (POS lebih besar dari bank) yang sudah dijelaskan pada pencocokan DIFF dianggap potongan MDR.
    pool
      .query(
        `SELECT i.outlet_id, SUBSTRING_INDEX(i.ref_key, '|', -1) AS method, SUM(i.amount) AS matched_pos, SUM(i.counter_amount) AS bank_amount,
                MAX(m.status = 'DIFF' AND m.explanation IS NOT NULL AND m.explanation <> '') AS explained
         FROM tr_recon_match_item i JOIN tr_recon_match m ON m.id = i.match_id AND m.undone_at IS NULL
         WHERE i.side = 'INTERNAL' AND i.ref_type = 'POS_ONLINE' AND i.ref_key LIKE CONCAT('%|', DATE_FORMAT(?, '%Y-%m-%d'), '|%')
         GROUP BY i.outlet_id, method`,
        [date]
      )
      .catch(() => [[]]),
    pool.query(`SELECT * FROM tr_recon_daily WHERE rec_date = ?`, [date]),
    pool.query(
      `SELECT b.outlet_id FROM tr_pos_batch b JOIN tr_journal_entries je ON je.id = b.journal_id
       WHERE b.batch_date = ? AND je.status = 'POSTED'`,
      [date]
    ),
    // Bukti tunai baru: penjualan tunai cabang+tanggal ini yang sudah dicocokkan ke mutasi bank (Rekonsiliasi Transaksi).
    // counter_amount = bagian nominal bank yang diatribusikan ke penjualan tunai ini.
    pool
      .query(
        `SELECT i.outlet_id, SUM(i.counter_amount) AS bank_amount
         FROM tr_recon_match_item i JOIN tr_recon_match m ON m.id = i.match_id AND m.undone_at IS NULL
         WHERE i.side = 'INTERNAL' AND i.ref_type = 'POS_CASH' AND i.ref_key = CONCAT(i.outlet_id, '|', DATE_FORMAT(?, '%Y-%m-%d'))
         GROUP BY i.outlet_id`,
        [date]
      )
      .catch(() => [[]]), // tabel pencocokan belum ada (migrasi 004 belum dijalankan): pakai setoran lama saja
  ]);
  const postedSet = new Set(postedRows.map((r) => Number(r.outlet_id)));
  const userNames = await getUserNames(dailies.flatMap((d) => [d.explanation_by, d.requested_by]));
  const depBy = new Map(deps.map((d) => [Number(d.outlet_id), d]));
  // Setoran manual lama (tr_cash_deposit) tetap dipakai bila ada; bila tidak, pakai mutasi bank yang dicocokkan
  bankCash.forEach((b) => {
    if (!depBy.has(Number(b.outlet_id))) depBy.set(Number(b.outlet_id), { amount: Number(b.bank_amount), deposit_date: date, proof_url: null, notes: "Mutasi bank yang dicocokkan", from_bank: true });
  });
  const setBy = new Map(sets.map((s) => [`${s.outlet_id}|${s.method}`, s]));
  const dailyBy = new Map(dailies.map((d) => [Number(d.outlet_id), d]));
  const outletName = new Map(outlets.map((o) => [o.id, o.name]));

  return posRows.map((row) => {
    const oid = row.outlet_id;
    const daily = dailyBy.get(oid) || null;
    const dep = depBy.get(oid) || null;

    // — Tunai —
    const cashPos = num(row.payments.KAS);
    let tunai;
    if (cashPos === 0 && !dep) {
      tunai = { key: "TUNAI", label: "Tunai", pos: 0, bank: null, mdr: 0, diff: 0, status: "KOSONG" };
    } else if (!dep) {
      tunai = { key: "TUNAI", label: "Tunai", pos: cashPos, bank: null, mdr: 0, diff: 0, status: "BELUM", note: "Belum setor" };
    } else {
      const amount = num(dep.amount);
      const diff = toFixed2(amount - cashPos);
      const tol = cfg.get("TUNAI")?.tolerance;
      tunai = {
        key: "TUNAI", label: "Tunai", pos: cashPos, bank: amount, mdr: 0, diff,
        tolerance: tol == null ? null : Number(tol),
        within_tolerance: tol != null && !near(amount, cashPos) && Math.abs(diff) <= Number(tol),
        status: near(amount, cashPos) ? "COCOK" : "SELISIH",
        deposit: { amount, deposit_date: String(dep.deposit_date).slice(0, 10), proof_url: dep.proof_url, notes: dep.notes },
      };
    }

    // — QRIS & EDC —
    const settle = (key, label, posAmount) => {
      const s = setBy.get(`${oid}|${key}`);
      if (posAmount === 0 && !s) return { key, label, pos: 0, bank: null, mdr: 0, diff: 0, status: "KOSONG" };
      if (!s || num(s.matched_pos) < posAmount - TOLERANCE) {
        return { key, label, pos: posAmount, bank: null, mdr: 0, diff: 0, status: "BELUM", note: s ? "Baru sebagian dicocokkan ke bank" : "Belum ditemukan di bank" };
      }
      const bank = num(s.bank_amount);
      const short = toFixed2(posAmount - bank); // > 0: bank menerima lebih sedikit dari POS
      const explained = Number(s.explained) === 1;
      const mdr = short > TOLERANCE && explained ? short : 0; // selisih yang dijelaskan Finance = potongan MDR
      const diff = toFixed2(bank + mdr - posAmount);
      const pct = cfg.get(key)?.mdr_percent;
      const expected = pct == null ? null : toFixed2(posAmount * Number(pct) / 100);
      const mdrWarn = mdr > 0 && expected != null && Math.abs(mdr - expected) > Math.max(10, expected * 0.02);
      return {
        key, label, pos: posAmount, bank, mdr, diff,
        mdr_expected: expected, mdr_warn: mdrWarn,
        status: near(bank + mdr, posAmount) ? "COCOK" : "SELISIH",
        note: short > TOLERANCE && !explained ? "Selisih belum dijelaskan" : bank > posAmount + TOLERANCE ? "Bank lebih besar dari POS" : undefined,
        gross: posAmount,
      };
    };
    const qris = settle("QRIS", "QRIS", num(row.payments.PIUTANG_QRIS));
    const edc = settle("EDC", "EDC", num(row.payments.PIUTANG_EDC));
    const methods = [tunai, qris, edc];

    const total = {
      pos: toFixed2(methods.reduce((s, m) => s + m.pos, 0)),
      bank: toFixed2(methods.reduce((s, m) => s + (m.bank || 0), 0)),
      mdr: toFixed2(methods.reduce((s, m) => s + m.mdr, 0)),
      diff: toFixed2(methods.reduce((s, m) => s + (m.status === "KOSONG" || m.status === "BELUM" ? 0 : m.diff), 0)),
    };

    // — Syarat bisa disetujui & pratinjau jurnal —
    const blockers = [];
    const treatment = daily?.treatment || "SELISIH_KAS";
    const explanation = daily?.explanation || "";
    if (tunai.status === "BELUM") blockers.push("Tunai belum ditemukan di mutasi bank. Cocokkan di Rekonsiliasi Transaksi.");
    for (const m of [qris, edc]) {
      if (m.status === "BELUM") blockers.push(`${m.label} belum ditemukan di mutasi bank. Cocokkan di Rekonsiliasi Transaksi.`);
      if (m.status === "SELISIH") blockers.push(`Selisih ${m.label} harus dijelaskan dulu di Rekonsiliasi Transaksi (mis. potongan MDR).`);
    }
    if (tunai.status === "SELISIH" && !explanation.trim()) blockers.push("Selisih tunai harus dijelaskan dulu.");
    if (daily?.explain_requested) blockers.push(`Penjelasan ulang diminta${daily.request_note ? `: "${daily.request_note}"` : ""}.`);
    const missingRoles = [];

    const lines = [];
    const accO = ov.forOutlet(oid, accMap);
    const need = (role) => {
      const a = accO[role];
      if (!a || !a.account_id) {
        if (!missingRoles.includes(role)) missingRoles.push(role);
        return null;
      }
      return a;
    };
    const add = (role, debit, credit, memo) => {
      if (debit > 0 || credit > 0) lines.push({ account: need(role), debit, credit, memo });
    };
    if (!blockers.length) {
      if (tunai.status !== "KOSONG") {
        const short = tunai.diff < 0 ? toFixed2(-tunai.diff) : 0;
        const over = tunai.diff > 0 ? tunai.diff : 0;
        add("BANK", tunai.bank, 0, "Setoran tunai");
        add(treatment, short, 0, short ? "Kas kurang" : "");
        add("KAS", 0, tunai.pos, "Kas penjualan tunai");
        add("PENDAPATAN_LAIN", 0, over, "Kas lebih");
      }
      for (const m of [qris, edc]) {
        if (m.status === "KOSONG") continue;
        const role = m.key === "QRIS" ? "PIUTANG_QRIS" : "PIUTANG_EDC";
        add("BANK", m.bank, 0, `Penerimaan ${m.label} di bank`);
        add("BEBAN_MDR", m.mdr, 0, `MDR ${m.label}`);
        add(role, 0, toFixed2(m.bank + m.mdr), `Pelunasan piutang ${m.label}`);
      }
    }
    if (missingRoles.length) blockers.push(`Pemetaan akun belum lengkap: ${missingRoles.join(", ")}.`);

    let status = "OPEN";
    if (daily?.status === "APPROVED") status = "APPROVED";
    else if (methods.every((m) => m.status === "KOSONG")) status = "KOSONG";

    // Hari baru boleh dikunci kalau penjualan POS-nya sudah diposting ke jurnal
    // (kalau tidak, jurnal rekonsiliasi mengkredit Kas/Piutang yang belum pernah didebit).
    const preStart = beforeStart(starts, oid, date);
    if (preStart && status === "OPEN") status = "BELUM_MULAI";
    const needsPosPost = status === "OPEN" && !postedSet.has(oid);
    const allBlockers = needsPosPost
      ? ["Penjualan POS tanggal ini belum diposting. Posting dulu di Integrasi POS.", ...blockers]
      : blockers;

    return {
      outlet_id: oid,
      outlet_name: outletName.get(oid) || row.outlet_name,
      outlet_code: codeOf.get(oid) || String(oid),
      status,
      locked: status === "APPROVED",
      methods,
      total,
      transfer_info: { bank_transfer: num(row.payments.BANK), member_balance: num(row.payments.DEPOSIT_MEMBER) },
      explanation,
      treatment,
      explanation_by: daily?.explanation_by ? userNames.get(Number(daily.explanation_by)) || `User #${daily.explanation_by}` : null,
      explanation_at: daily?.explanation_at || null,
      explain_requested: Boolean(daily?.explain_requested),
      request_note: daily?.request_note || null,
      requested_by: daily?.requested_by ? userNames.get(Number(daily.requested_by)) || `User #${daily.requested_by}` : null,
      needs_pos_post: needsPosPost,
      can_approve: status === "OPEN" && !allBlockers.length && lines.length > 0,
      blockers: status === "APPROVED" ? [] : preStart ? [startMessage(starts, oid, outletName.get(oid) || row.outlet_name)] : allBlockers,
      journal_id: daily?.journal_id || null,
      approved_at: daily?.approved_at || null,
      lines: lines.map((l) => ({
        account_code: l.account?.code || null,
        account_name: l.account?.name || null,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo,
        _account_id: l.account?.account_id || null,
      })),
    };
  });
}

// ── GET /rekon/day?date= ────────────────────────────────────────────────
export async function getRekonDay(req, res) {
  try {
    const { date } = req.query;
    if (!isDate(date)) return res.status(422).json({ message: "Tanggal tidak valid (YYYY-MM-DD)." });
    const data = await buildDay(date);
    // _account_id hanya untuk internal posting
    data.forEach((d) => d.lines.forEach((l) => delete l._account_id));
    return res.json({ date, data });
  } catch (err) {
    console.error("[getRekonDay]", err);
    return res.status(500).json({ message: "Gagal menghitung rekonsiliasi", error: err.message });
  }
}

// ── POST /rekon/explain {date, outlet_id, explanation, treatment} ───────
export async function saveExplanation(req, res) {
  try {
    const { date, outlet_id, explanation = "", treatment = "SELISIH_KAS" } = req.body || {};
    if (!isDate(date) || !outlet_id) return res.status(422).json({ message: "Tanggal dan cabang wajib diisi." });
    if (!["SELISIH_KAS", "PIUTANG_KARYAWAN"].includes(treatment)) {
      return res.status(422).json({ message: "Perlakuan selisih tidak valid." });
    }
    const [ex] = await pool.query(`SELECT status FROM tr_recon_daily WHERE outlet_id=? AND rec_date=?`, [outlet_id, date]);
    if (ex[0]?.status === "APPROVED") return res.status(422).json({ message: "Hari ini sudah dikunci." });
    await pool.query(
      `INSERT INTO tr_recon_daily (outlet_id, rec_date, explanation, treatment, explanation_by, explanation_at, explain_requested)
       VALUES (?, ?, ?, ?, ?, NOW(), 0)
       ON DUPLICATE KEY UPDATE explanation=VALUES(explanation), treatment=VALUES(treatment),
         explanation_by=VALUES(explanation_by), explanation_at=NOW(), explain_requested=0`,
      [outlet_id, date, String(explanation).trim().slice(0, 500), treatment, req.user?.id || null]
    );
    return res.json({ message: "Penjelasan selisih disimpan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan penjelasan", error: err.message });
  }
}

// ── POST /rekon/request-explanation {date, outlet_id, note} — "Minta penjelasan ulang" ─
export async function requestExplanation(req, res) {
  try {
    const { date, outlet_id, note = "" } = req.body || {};
    if (!isDate(date) || !outlet_id) return res.status(422).json({ message: "Tanggal dan cabang wajib diisi." });
    const [ex] = await pool.query(`SELECT status FROM tr_recon_daily WHERE outlet_id=? AND rec_date=?`, [outlet_id, date]);
    if (ex[0]?.status === "APPROVED") return res.status(422).json({ message: "Hari ini sudah dikunci." });
    await pool.query(
      `INSERT INTO tr_recon_daily (outlet_id, rec_date, explain_requested, request_note, requested_by, requested_at) VALUES (?, ?, 1, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE explain_requested=1, request_note=VALUES(request_note), requested_by=VALUES(requested_by), requested_at=NOW()`,
      [outlet_id, date, String(note).trim().slice(0, 255) || null, req.user?.id || null]
    );
    return res.json({ message: "Penjelasan ulang diminta. Hari ini belum bisa dikunci sampai penjelasan diperbarui." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal meminta penjelasan ulang", error: err.message });
  }
}

// ── POST /rekon/approve {date, outlet_id} — Setujui & kunci hari ────────
export async function approveDay(req, res) {
  const { date, outlet_id } = req.body || {};
  const actorId = req.user?.id || null;
  if (!isDate(date) || !outlet_id) return res.status(422).json({ message: "Tanggal dan cabang wajib diisi." });
  const dateLockMsg = await lockDateMessage(date);
  if (dateLockMsg) return res.status(422).json({ message: dateLockMsg });

  const conn = await pool.getConnection();
  try {
    const all = await buildDay(date);
    const d = all.find((x) => x.outlet_id === Number(outlet_id));
    if (!d) return res.status(404).json({ message: "Cabang tidak ditemukan." });
    if (d.locked) return res.status(422).json({ message: "Hari ini sudah dikunci." });
    if (!d.can_approve) return res.status(422).json({ message: d.blockers[0] || "Rekonsiliasi belum bisa disetujui." });

    const totalDebit = toFixed2(d.lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = toFixed2(d.lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      return res.status(422).json({ message: "Jurnal rekonsiliasi tidak seimbang, dibatalkan." });
    }

    await conn.beginTransaction();
    const [lock] = await conn.query(`SELECT id, status FROM tr_recon_daily WHERE outlet_id=? AND rec_date=? FOR UPDATE`, [outlet_id, date]);
    if (lock[0]?.status === "APPROVED") {
      await conn.rollback();
      return res.status(422).json({ message: "Hari ini sudah dikunci." });
    }

    const base = `JU-REK-${d.outlet_code}-${yymmdd(date)}`;
    const [cnt] = await conn.query(`SELECT COUNT(*) AS n FROM tr_journal_entries WHERE source_ref = ?`, [base]);
    const entryNo = cnt[0].n === 0 ? base : `${base}-v${cnt[0].n + 1}`;

    const [h] = await conn.query(
      `INSERT INTO tr_journal_entries
         (entry_no, entry_date, description, status, total_amount, created_by, source_type, source_ref, outlet_id, approved_by, approved_at)
       VALUES (?, ?, ?, 'POSTED', ?, ?, 'REKONSILIASI', ?, ?, ?, NOW())`,
      [entryNo, date, `Rekonsiliasi ${d.outlet_name} ${date}`, totalDebit, actorId, base, d.outlet_id, actorId]
    );
    for (let i = 0; i < d.lines.length; i++) {
      const l = d.lines[i];
      await conn.query(
        `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [h.insertId, i + 1, l._account_id, l.debit, l.credit, l.memo || null, d.outlet_id]
      );
    }
    await conn.query(
      `INSERT INTO tr_recon_daily (outlet_id, rec_date, status, journal_id, approved_by, approved_at, snapshot)
       VALUES (?, ?, 'APPROVED', ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE status='APPROVED', journal_id=VALUES(journal_id), approved_by=VALUES(approved_by),
         approved_at=NOW(), snapshot=VALUES(snapshot)`,
      [d.outlet_id, date, h.insertId, actorId, JSON.stringify({ total: d.total, methods: d.methods })]
    );
    try {
      await conn.query(
        `INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('tr_journal_entries', ?, 'CREATE', ?, ?)`,
        [h.insertId, actorId, JSON.stringify({ entry_no: entryNo, source: "REKONSILIASI", outlet_id: d.outlet_id, date })]
      );
    } catch (e) {
      console.warn("[approveDay] audit gagal:", e.message);
    }
    await conn.commit();
    return res.status(201).json({ message: `Hari dikunci. Jurnal ${entryNo} diposting.`, entry_no: entryNo, id: h.insertId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[approveDay]", err);
    return res.status(500).json({ message: "Gagal menyetujui rekonsiliasi", error: err.message });
  } finally {
    conn.release();
  }
}

// ════════════════════════════ SETORAN KAS ════════════════════════════════
// ── GET /rekon/deposits?from=&to=&outlet= ───────────────────────────────
export async function getDeposits(req, res) {
  try {
    const { from, to, outlet } = req.query;
    if (!isDate(from) || !isDate(to)) return res.status(422).json({ message: "Rentang tanggal tidak valid." });

    const params = [from, to];
    let cond = "";
    if (outlet) {
      cond = " AND t.outlet_id = ?";
      params.push(Number(outlet));
    }
    const [cashRows] = await myWaschenPool.query(
      `SELECT t.outlet_id, DATE_FORMAT(l.created_at, '%Y-%m-%d') AS d, COALESCE(SUM(l.amount), 0) AS cash
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
       WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND l.log_type IN ('DP','Lunas','Pelunasan') AND l.payment_method LIKE 'Tunai%'
         AND t.is_delete_requested = 0${cond}
       GROUP BY t.outlet_id, d`,
      params
    );
    const dParams = [from, to];
    let dCond = "";
    if (outlet) {
      dCond = " AND outlet_id = ?";
      dParams.push(Number(outlet));
    }
    const [deps] = await pool.query(
      `SELECT *, DATE_FORMAT(sales_date,'%Y-%m-%d') AS sd, DATE_FORMAT(deposit_date,'%Y-%m-%d') AS dd
       FROM tr_cash_deposit WHERE sales_date BETWEEN ? AND ?${dCond}`,
      dParams
    );
    const outlets = await getOutlets();
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));
    const depBy = new Map(deps.map((d) => [`${d.outlet_id}|${d.sd}`, d]));
    const [explRows] = await pool.query(
      `SELECT outlet_id, DATE_FORMAT(rec_date,'%Y-%m-%d') AS d, explanation, status FROM tr_recon_daily WHERE rec_date BETWEEN ? AND ?`,
      [from, to]
    );
    const explBy = new Map(explRows.map((r) => [`${r.outlet_id}|${r.d}`, r]));

    const keys = new Map();
    cashRows.forEach((r) => {
      if (Number(r.cash) > 0) keys.set(`${r.outlet_id}|${r.d}`, { outlet_id: Number(r.outlet_id), d: r.d, cash: num(r.cash) });
    });
    deps.forEach((d) => {
      const k = `${d.outlet_id}|${d.sd}`;
      if (!keys.has(k)) keys.set(k, { outlet_id: Number(d.outlet_id), d: d.sd, cash: 0 });
    });

    const rows = [...keys.values()]
      .map((k) => {
        const dep = depBy.get(`${k.outlet_id}|${k.d}`);
        const amount = dep ? num(dep.amount) : null;
        const diff = dep ? toFixed2(amount - k.cash) : null;
        return {
          outlet_id: k.outlet_id,
          outlet_name: nameOf.get(k.outlet_id) || `Outlet #${k.outlet_id}`,
          sales_date: k.d,
          expected: k.cash,
          deposit_date: dep?.dd || null,
          amount,
          diff,
          proof_url: dep?.proof_url || null,
          notes: dep?.notes || null,
          status: !dep
            ? "BELUM"
            : near(amount, k.cash)
              ? "COCOK"
              : explBy.get(`${k.outlet_id}|${k.d}`)?.explanation
                ? "SELISIH_DIJELASKAN"
                : "SELISIH",
          explanation: explBy.get(`${k.outlet_id}|${k.d}`)?.explanation || null,
          locked: explBy.get(`${k.outlet_id}|${k.d}`)?.status === "APPROVED",
        };
      })
      .sort((a, b) => (a.sales_date === b.sales_date ? a.outlet_id - b.outlet_id : a.sales_date < b.sales_date ? 1 : -1));

    return res.json({ data: rows, outlets });
  } catch (err) {
    console.error("[getDeposits]", err);
    return res.status(500).json({ message: "Gagal memuat setoran kas", error: err.message });
  }
}

async function isLocked(outletId, date) {
  const [r] = await pool.query(`SELECT status FROM tr_recon_daily WHERE outlet_id=? AND rec_date=?`, [outletId, date]);
  return r[0]?.status === "APPROVED";
}

// ── POST /rekon/deposits ────────────────────────────────────────────────
export async function saveDeposit(req, res) {
  try {
    const { outlet_id, sales_date, deposit_date, amount, notes, proof_url } = req.body || {};
    if (!outlet_id || !isDate(sales_date) || !isDate(deposit_date)) {
      return res.status(422).json({ message: "Cabang, tanggal penjualan, dan tanggal setor wajib diisi." });
    }
    const amt = toFixed2(amount);
    if (!(amt > 0)) return res.status(422).json({ message: "Nominal setoran harus lebih dari 0." });
    if (deposit_date < sales_date) return res.status(422).json({ message: "Tanggal setor tidak boleh sebelum tanggal penjualan." });
    if (proof_url && !String(proof_url).startsWith("/uploads/rekon/")) return res.status(422).json({ message: "Bukti tidak valid." });
    if (await isLocked(outlet_id, sales_date)) return res.status(422).json({ message: "Hari ini sudah dikunci, setoran tidak bisa diubah." });

    await pool.query(
      `INSERT INTO tr_cash_deposit (outlet_id, sales_date, deposit_date, amount, proof_url, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE deposit_date=VALUES(deposit_date), amount=VALUES(amount),
         proof_url=VALUES(proof_url), notes=VALUES(notes), created_by=VALUES(created_by)`,
      [outlet_id, sales_date, deposit_date, amt, proof_url || null, notes ? String(notes).slice(0, 255) : null, req.user?.id || null]
    );
    return res.status(201).json({ message: "Setoran kas disimpan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan setoran", error: err.message });
  }
}

// ── DELETE /rekon/deposits?outlet_id=&sales_date= ───────────────────────
export async function deleteDeposit(req, res) {
  try {
    const { outlet_id, sales_date } = req.query;
    if (!outlet_id || !isDate(sales_date)) return res.status(422).json({ message: "Data tidak lengkap." });
    if (await isLocked(outlet_id, sales_date)) return res.status(422).json({ message: "Hari ini sudah dikunci." });
    await pool.query(`DELETE FROM tr_cash_deposit WHERE outlet_id=? AND sales_date=?`, [outlet_id, sales_date]);
    return res.json({ message: "Setoran dihapus." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menghapus setoran", error: err.message });
  }
}
