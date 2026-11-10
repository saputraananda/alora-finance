import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import ExcelJS from "exceljs";
import { pool, safeQuery, myWaschenPool, getOutlets, getUserNames } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { computeDay, loadAccountMap } from "../pos/pos.controller.js";
import { loadOutletOverrides } from "../../utils/accountResolver.js";
import { loadStartDates, beforeStart, startMessage } from "../../utils/outletStart.js";

// ════════════════════════════════════════════════════════════════════════════
// REKONSILIASI HARIAN — per cabang, per hari, per metode bayar
//   POS  =  Setoran tunai / Settlement QRIS & EDC  (+ MDR)
// Aturan dari "Konsep Akuntansi Laundry Multi-Cabang" (hal. 12–15):
//   • Tunai dicocokkan dengan bukti setor; QRIS/EDC dengan laporan settlement.
//   • Kas kurang → dijelaskan; jadi Selisih Kas / Piutang Karyawan. Kas lebih → Pendapatan Lain.
//   • MDR otomatis: Dr Beban MDR, Cr Piutang QRIS/EDC.
//   • Settlement belum cair → tetap di piutang, hari belum bisa dikunci.
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

// ── Upload (slip setoran) & file settlement ─────────────────────────────
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
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    const ok = /\.(csv|xlsx)$/i.test(file.originalname);
    cb(ok ? null : new Error("File settlement harus berformat CSV atau XLSX."), ok);
  },
});
const wrap = (mw) => (req, res, next) =>
  mw(req, res, (err) => (err ? res.status(422).json({ message: err.message }) : next()));
export const slipMiddleware = wrap(slipUpload.single("file"));
export const settlementFileMiddleware = wrap(memUpload.single("file"));

export function uploadSlip(req, res) {
  if (!req.file) return res.status(422).json({ message: "File tidak ditemukan." });
  return res.status(201).json({ url: `/uploads/rekon/${req.file.filename}`, name: req.file.originalname });
}

// ── Helpers ─────────────────────────────────────────────────────────────
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const yymmdd = (d) => `${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}`;
const num = (v) => toFixed2(v || 0);
const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
const methodOf = (provider) => (String(provider).trim().toUpperCase().startsWith("QRIS") ? "QRIS" : "EDC");

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

  const [[deps], [sets], [dailies], [postedRows]] = await Promise.all([
    pool.query(`SELECT * FROM tr_cash_deposit WHERE sales_date = ?`, [date]),
    pool.query(
      `SELECT outlet_id, method, COUNT(*) AS n, SUM(gross) AS gross, SUM(mdr) AS mdr, SUM(net) AS net,
              MIN(settle_date) AS settle_date
       FROM tr_settlement WHERE trx_date = ? GROUP BY outlet_id, method`,
      [date]
    ),
    pool.query(`SELECT * FROM tr_recon_daily WHERE rec_date = ?`, [date]),
    pool.query(
      `SELECT b.outlet_id FROM tr_pos_batch b JOIN tr_journal_entries je ON je.id = b.journal_id
       WHERE b.batch_date = ? AND je.status = 'POSTED'`,
      [date]
    ),
  ]);
  const postedSet = new Set(postedRows.map((r) => Number(r.outlet_id)));
  const userNames = await getUserNames(dailies.flatMap((d) => [d.explanation_by, d.requested_by]));
  const depBy = new Map(deps.map((d) => [Number(d.outlet_id), d]));
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
      if (!s) return { key, label, pos: posAmount, bank: null, mdr: 0, diff: 0, status: "BELUM", note: "Belum cair" };
      const net = num(s.net);
      const mdr = num(s.mdr);
      const diff = toFixed2(net + mdr - posAmount);
      const pct = cfg.get(key)?.mdr_percent;
      const expected = pct == null ? null : toFixed2((s.gross ? Number(s.gross) : posAmount) * Number(pct) / 100);
      const mdrWarn = expected != null && Math.abs(mdr - expected) > Math.max(10, expected * 0.02);
      return {
        key, label, pos: posAmount, bank: net, mdr, diff,
        mdr_expected: expected, mdr_warn: mdrWarn,
        status: near(net + mdr, posAmount) ? "COCOK" : "SELISIH",
        settle_date: s.settle_date ? String(s.settle_date).slice(0, 10) : null,
        gross: num(s.gross),
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
    if (tunai.status === "BELUM") blockers.push("Tunai belum disetor. Catat setoran di tab Setoran kas.");
    if (qris.status === "BELUM") blockers.push("Settlement QRIS belum cair / belum diimpor.");
    if (edc.status === "BELUM") blockers.push("Settlement EDC belum cair / belum diimpor.");
    if (qris.status === "SELISIH") blockers.push("Selisih QRIS harus diselesaikan dulu (periksa file settlement).");
    if (edc.status === "SELISIH") blockers.push("Selisih EDC harus diselesaikan dulu (periksa file settlement).");
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
        add("BANK", m.bank, 0, `Settlement ${m.label}`);
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

// ═══════════════════════════ SETTLEMENT QRIS / EDC ═══════════════════════
const HEADER_ALIASES = {
  settle_date: ["tanggal_cair", "tgl_cair", "cair", "settle_date", "settlement_date", "tanggal_settlement"],
  provider: ["penyedia", "provider", "mesin", "merchant", "acquirer"],
  trx_date: ["tanggal_transaksi", "tgl_transaksi", "transaksi", "trx_date", "transaction_date"],
  outlet: ["cabang", "kode_cabang", "outlet", "kode_outlet"],
  gross: ["bruto", "gross", "total", "nominal"],
  mdr: ["mdr", "fee", "biaya", "potongan"],
  net: ["neto", "net", "nett", "diterima"],
};

const normHeader = (h) => String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function mapHeaders(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => {
    const n = normHeader(h);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (idx[key] === undefined && aliases.includes(n)) idx[key] = i;
    }
  });
  return idx;
}

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

function parseDateCell(v) {
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 12 * 3600 * 1000); // hindari geser zona waktu
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function parseMoney(v) {
  if (typeof v === "number") return toFixed2(v);
  const s = String(v ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  // Format Indonesia: titik = ribuan, koma = desimal
  const cleaned = s.replace(/[^\d.,]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/\./g, "");
  const n = parseFloat(normalized);
  if (Number.isNaN(n)) return null;
  return toFixed2(neg ? -n : n);
}

// ── POST /rekon/settlements/import (multipart: file) ────────────────────
export async function importSettlements(req, res) {
  try {
    if (!req.file) return res.status(422).json({ message: "Pilih file settlement (CSV atau XLSX)." });
    const isXlsx = /\.xlsx$/i.test(req.file.originalname);
    const table = isXlsx ? await parseXlsx(req.file.buffer) : parseCsv(req.file.buffer.toString("utf8"));
    if (table.length < 2) return res.status(422).json({ message: "File kosong atau tidak ada baris data." });

    const idx = mapHeaders(table[0]);
    const required = ["provider", "trx_date", "outlet", "gross"];
    const missing = required.filter((k) => idx[k] === undefined);
    if (missing.length) {
      return res.status(422).json({
        message: `Kolom wajib tidak ditemukan: ${missing.join(", ")}. Unduh template untuk contoh format.`,
      });
    }

    const outletsRaw = await myWaschenPool.query(`SELECT id, outlet_code, name FROM mst_outlet`).then(([r]) => r);
    const byKey = new Map();
    outletsRaw.forEach((o) => {
      byKey.set(String(o.outlet_code).trim().toLowerCase(), Number(o.id));
      byKey.set(String(o.name).trim().toLowerCase(), Number(o.id));
    });

    let inserted = 0;
    let duplicate = 0;
    const errors = [];
    for (let r = 1; r < table.length; r++) {
      const row = table[r];
      const line = r + 1;
      const get = (k) => (idx[k] === undefined ? undefined : row[idx[k]]);
      const provider = String(get("provider") ?? "").trim();
      const trx = parseDateCell(get("trx_date"));
      const settle = parseDateCell(get("settle_date"));
      const oid = byKey.get(String(get("outlet") ?? "").trim().toLowerCase());
      let gross = parseMoney(get("gross"));
      let mdr = parseMoney(get("mdr"));
      let net = parseMoney(get("net"));
      if (!provider || !trx || !oid || gross === null) {
        errors.push(`Baris ${line}: ${!provider ? "penyedia kosong" : !trx ? "tanggal transaksi tidak valid" : !oid ? `cabang "${get("outlet")}" tidak dikenal` : "bruto tidak valid"}.`);
        continue;
      }
      if (mdr === null && net === null) { errors.push(`Baris ${line}: isi minimal MDR atau neto.`); continue; }
      if (net === null) net = toFixed2(gross - mdr);
      if (mdr === null) mdr = toFixed2(gross - net);
      if (!near(gross, net + mdr)) { errors.push(`Baris ${line}: bruto ≠ neto + MDR.`); continue; }
      if (await isLocked(oid, trx)) { errors.push(`Baris ${line}: hari ${trx} sudah dikunci.`); continue; }

      const [ins] = await pool.query(
        `INSERT IGNORE INTO tr_settlement (outlet_id, method, provider, trx_date, settle_date, gross, mdr, net, source, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IMPOR', ?)`,
        [oid, methodOf(provider), provider.slice(0, 60), trx, settle, gross, mdr, net, req.user?.id || null]
      );
      if (ins.affectedRows) inserted++;
      else duplicate++;
    }
    return res.status(errors.length && !inserted ? 422 : 201).json({
      message: `${inserted} baris diimpor${duplicate ? `, ${duplicate} duplikat dilewati` : ""}${errors.length ? `, ${errors.length} baris bermasalah` : ""}.`,
      inserted,
      duplicate,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error("[importSettlements]", err);
    return res.status(500).json({ message: "Gagal mengimpor settlement", error: err.message });
  }
}

// ── GET /rekon/settlements?from=&to=&outlet= ────────────────────────────
export async function getSettlements(req, res) {
  try {
    const { from, to, outlet } = req.query;
    if (!isDate(from) || !isDate(to)) return res.status(422).json({ message: "Rentang tanggal tidak valid." });
    const params = [from, to];
    let cond = "";
    if (outlet) {
      cond = " AND s.outlet_id = ?";
      params.push(Number(outlet));
    }
    const [rows] = await pool.query(
      `SELECT s.id, s.outlet_id, s.method, s.provider, s.gross, s.mdr, s.net, s.source,
              DATE_FORMAT(s.trx_date,'%Y-%m-%d') AS trx_date, DATE_FORMAT(s.settle_date,'%Y-%m-%d') AS settle_date,
              (SELECT status FROM tr_recon_daily d WHERE d.outlet_id = s.outlet_id AND d.rec_date = s.trx_date) AS day_status
       FROM tr_settlement s
       WHERE s.trx_date BETWEEN ? AND ?${cond}
       ORDER BY s.trx_date DESC, s.outlet_id, s.id DESC`,
      params
    );
    const outlets = await getOutlets();
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));

    // Status per baris terhadap POS (Referensi hal. 12): jumlah bruto per cabang+tanggal+metode dibandingkan
    // dengan pembayaran QRIS/EDC di POS pada hari itu.
    const [posRows] = await myWaschenPool.query(
      `SELECT t.outlet_id, DATE_FORMAT(l.created_at,'%Y-%m-%d') AS d,
              SUM(CASE WHEN l.payment_method LIKE 'QRIS%' THEN l.amount ELSE 0 END) AS qris,
              SUM(CASE WHEN l.payment_method LIKE 'EDC%' THEN l.amount ELSE 0 END) AS edc
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
       WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND l.log_type IN ('DP','Lunas','Pelunasan') AND t.is_delete_requested = 0
       GROUP BY t.outlet_id, d`,
      [from, to]
    );
    const posBy = new Map();
    posRows.forEach((r) => {
      posBy.set(`${r.outlet_id}|QRIS|${r.d}`, num(r.qris));
      posBy.set(`${r.outlet_id}|EDC|${r.d}`, num(r.edc));
    });
    const groupGross = new Map();
    rows.forEach((r) => {
      const k = `${r.outlet_id}|${r.method}|${r.trx_date}`;
      groupGross.set(k, toFixed2((groupGross.get(k) || 0) + Number(r.gross)));
    });
    const [cfgRows] = await pool.query(`SELECT code, mdr_percent FROM mst_payment_method`);
    const pctOf = new Map(cfgRows.map((c) => [c.code, c.mdr_percent == null ? null : Number(c.mdr_percent)]));

    rows.forEach((r) => {
      r.outlet_name = nameOf.get(Number(r.outlet_id)) || `Outlet #${r.outlet_id}`;
      r.locked = r.day_status === "APPROVED";
      const k = `${r.outlet_id}|${r.method}|${r.trx_date}`;
      r.pos_amount = posBy.get(k) ?? 0;
      r.group_gross = groupGross.get(k) || 0;
      r.match_status = !r.settle_date ? "BELUM_CAIR" : near(r.group_gross, r.pos_amount) ? "COCOK" : "SELISIH";
      const pct = pctOf.get(r.method);
      const expected = pct == null ? null : toFixed2((Number(r.gross) * pct) / 100);
      r.mdr_expected = expected;
      r.mdr_warn = expected != null && Math.abs(Number(r.mdr) - expected) > Math.max(10, expected * 0.02);
    });
    return res.json({ data: rows, outlets });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat settlement", error: err.message });
  }
}

// ── POST /rekon/settlements — input satu baris manual ───────────────────
export async function addSettlement(req, res) {
  try {
    const { outlet_id, provider, trx_date, settle_date, gross, mdr, net } = req.body || {};
    if (!outlet_id || !provider || !isDate(trx_date)) return res.status(422).json({ message: "Cabang, penyedia, dan tanggal transaksi wajib diisi." });
    if (settle_date && !isDate(settle_date)) return res.status(422).json({ message: "Tanggal cair tidak valid." });
    const g = toFixed2(gross);
    if (!(g > 0)) return res.status(422).json({ message: "Bruto harus lebih dari 0." });
    let m = mdr === "" || mdr == null ? null : toFixed2(mdr);
    let n = net === "" || net == null ? null : toFixed2(net);
    if (m === null && n === null) return res.status(422).json({ message: "Isi MDR atau neto." });
    if (n === null) n = toFixed2(g - m);
    if (m === null) m = toFixed2(g - n);
    if (!near(g, n + m)) return res.status(422).json({ message: "Bruto harus sama dengan neto + MDR." });
    if (await isLocked(outlet_id, trx_date)) return res.status(422).json({ message: "Hari ini sudah dikunci." });

    const [ins] = await pool.query(
      `INSERT IGNORE INTO tr_settlement (outlet_id, method, provider, trx_date, settle_date, gross, mdr, net, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?)`,
      [outlet_id, methodOf(provider), String(provider).trim().slice(0, 60), trx_date, settle_date || null, g, m, n, req.user?.id || null]
    );
    if (!ins.affectedRows) return res.status(422).json({ message: "Baris yang sama sudah ada." });
    return res.status(201).json({ message: "Settlement ditambahkan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menambah settlement", error: err.message });
  }
}

// ── DELETE /rekon/settlements/:id ───────────────────────────────────────
export async function deleteSettlement(req, res) {
  try {
    const [r] = await pool.query(`SELECT outlet_id, DATE_FORMAT(trx_date,'%Y-%m-%d') AS d FROM tr_settlement WHERE id=?`, [req.params.id]);
    if (!r[0]) return res.status(404).json({ message: "Data tidak ditemukan." });
    if (await isLocked(r[0].outlet_id, r[0].d)) return res.status(422).json({ message: "Hari ini sudah dikunci." });
    await pool.query(`DELETE FROM tr_settlement WHERE id=?`, [req.params.id]);
    return res.json({ message: "Baris settlement dihapus." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menghapus", error: err.message });
  }
}

// ── GET /rekon/settlements/template ─────────────────────────────────────
export async function settlementTemplate(_req, res) {
  const outlets = await getOutlets();
  const code = (await myWaschenPool.query(`SELECT outlet_code FROM mst_outlet ORDER BY id LIMIT 1`).then(([r]) => r[0]?.outlet_code).catch(() => null)) || "RH";
  const csv =
    "﻿" +
    [
      "tanggal_cair;penyedia;tanggal_transaksi;cabang;bruto;mdr;neto",
      `2026-11-02;QRIS;2026-11-01;${code};2500000;17500;2482500`,
      `2026-11-02;EDC BCA;2026-11-01;${code};700000;7000;693000`,
    ].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="template-settlement.csv"');
  void outlets;
  return res.send(csv);
}
