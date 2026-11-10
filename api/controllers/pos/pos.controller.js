import { pool, safeQuery, myWaschenPool } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { lockedOutlets, dayLockMessage } from "../../utils/dayLock.js";
import { loadOutletOverrides } from "../../utils/accountResolver.js";
import crypto from "crypto";
import { loadStartDates, beforeStart, startMessage } from "../../utils/outletStart.js";

// ════════════════════════════════════════════════════════════════════════════
// INTEGRASI POS (my-waschen → Jurnal alfi)
// Sumber data: DB my-waschen (BACA SAJA). Hasil: satu jurnal per outlet per hari.
//
//   Pendapatan diakui saat nota dibuat (order_date):
//       Dr Piutang Usaha            Cr Pendapatan Layanan
//   Pembayaran yang masuk hari itu (tr_payment_log):
//       Dr Kas / Bank / Piutang QRIS / Piutang EDC / Deposit Member
//       Cr Piutang Usaha
// ════════════════════════════════════════════════════════════════════════════

// Peran akun → akun COA bawaan (kode). Bisa diganti lewat tabel mst_account_map.
export const ROLES = {
  KAS: { label: "Kas (Tunai)", code: "1-1002" },
  BANK: { label: "Bank (Transfer Bank)", code: "1-1003" },
  PIUTANG_QRIS: { label: "Piutang QRIS", code: "1-1007" },
  PIUTANG_EDC: { label: "Piutang EDC", code: "1-1008" },
  PIUTANG_USAHA: { label: "Piutang Usaha (Nota)", code: "1-1005" },
  DEPOSIT_MEMBER: { label: "Deposit Member", code: "2-1004" },
  PENDAPATAN: { label: "Pendapatan Layanan (bawaan)", code: "4-1001" },
  PENDAPATAN_B2B: { label: "Pendapatan B2B / Event", code: "4-1002" },
  // Bawaan sama dengan Pendapatan Layanan agar angka tidak berubah sampai finance memetakan akun sendiri
  PENDAPATAN_KECEPATAN: { label: "Pendapatan Ekspres (biaya kecepatan)", code: "4-1001" },
  DISKON_PENJUALAN: { label: "Diskon Penjualan", code: "4-1001" },
};

// Peran sisi pembayaran (urutan tampil)
const PAYMENT_ROLES = ["KAS", "BANK", "PIUTANG_QRIS", "PIUTANG_EDC", "DEPOSIT_MEMBER"];

function methodToRole(method = "") {
  const m = String(method).trim().toLowerCase();
  if (m.startsWith("tunai")) return "KAS";
  if (m.startsWith("transfer")) return "BANK";
  if (m.startsWith("qris")) return "PIUTANG_QRIS";
  if (m.startsWith("edc")) return "PIUTANG_EDC";
  if (m.startsWith("potong saldo")) return "DEPOSIT_MEMBER";
  return null;
}

export async function loadAccountMap() {
  const [rows] = await pool.query(
    `SELECT m.role, m.account_id, a.code, a.name
     FROM mst_account_map m LEFT JOIN mst_coa a ON a.id = m.account_id`
  );
  const map = {};
  rows.forEach((r) => (map[r.role] = r));
  return map;
}

function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

// ── Hitung data POS satu hari untuk semua outlet ────────────────────────
export async function computeDay(date) {
  const [outlets] = await myWaschenPool.query(
    `SELECT id, outlet_code, name, full_name, is_event FROM mst_outlet ORDER BY id`
  );

  const [revRows] = await myWaschenPool.query(
    `SELECT outlet_id, COUNT(*) AS notes, COALESCE(SUM(grand_total), 0) AS revenue,
            COALESCE(SUM(speed_surcharge), 0) AS surcharge, COALESCE(SUM(discount_amount), 0) AS discount,
            COALESCE(SUM(total_weight_kg), 0) AS kg
     FROM tr_transaction
     WHERE order_date >= ? AND order_date < DATE_ADD(?, INTERVAL 1 DAY)
       AND is_delete_requested = 0
     GROUP BY outlet_id`,
    [date, date]
  );

  // Rincian pendapatan per kategori layanan (grand_total = Σ rincian + biaya kecepatan − diskon)
  const [partRows] = await myWaschenPool.query(
    `SELECT t.outlet_id, sv.category_id, COALESCE(sc.name, 'Tanpa kategori') AS category_name, SUM(d.subtotal) AS amount
     FROM tr_transaction_detail d
     JOIN tr_transaction t ON t.id = d.transaction_id
     LEFT JOIN mst_service sv ON sv.id = d.service_id
     LEFT JOIN mst_service_category sc ON sc.id = sv.category_id
     WHERE t.order_date >= ? AND t.order_date < DATE_ADD(?, INTERVAL 1 DAY) AND t.is_delete_requested = 0
     GROUP BY t.outlet_id, sv.category_id, sc.name`,
    [date, date]
  );
  const [svcMapRows] = await pool.query(
    `SELECT m.category_id, m.account_id, a.code, a.name
     FROM mst_service_account_map m LEFT JOIN mst_coa a ON a.id = m.account_id AND a.is_active = 1 AND a.is_header = 0`
  );
  const svcMap = new Map(svcMapRows.map((r) => [Number(r.category_id), r]));
  const partsBy = new Map();
  partRows.forEach((r) => {
    const k = Number(r.outlet_id);
    if (!partsBy.has(k)) partsBy.set(k, []);
    const m = r.category_id != null ? svcMap.get(Number(r.category_id)) : null;
    partsBy.get(k).push({
      category_id: r.category_id == null ? null : Number(r.category_id),
      category_name: r.category_name,
      amount: toFixed2(r.amount),
      account: m && m.code ? { account_id: m.account_id, code: m.code, name: m.name } : null,
    });
  });

  const [payRows] = await myWaschenPool.query(
    `SELECT t.outlet_id, l.payment_method, COALESCE(SUM(l.amount), 0) AS amount
     FROM tr_payment_log l
     JOIN tr_transaction t ON t.id = l.transaction_id
     WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND l.log_type IN ('DP', 'Lunas', 'Pelunasan')
       AND t.is_delete_requested = 0
     GROUP BY t.outlet_id, l.payment_method`,
    [date, date]
  );

  // Validasi: nomor nota dobel & pembayaran tanpa metode bayar
  const [dupRows] = await myWaschenPool.query(
    `SELECT outlet_id, order_no, COUNT(*) AS n
     FROM tr_transaction
     WHERE order_date >= ? AND order_date < DATE_ADD(?, INTERVAL 1 DAY) AND is_delete_requested = 0
     GROUP BY outlet_id, order_no HAVING COUNT(*) > 1`,
    [date, date]
  );
  const [noMethodRows] = await myWaschenPool.query(
    `SELECT t.outlet_id, t.order_no, l.amount
     FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
     WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND l.log_type IN ('DP', 'Lunas', 'Pelunasan') AND t.is_delete_requested = 0
       AND (l.payment_method IS NULL OR TRIM(l.payment_method) = '')
     LIMIT 100`,
    [date, date]
  );
  const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
  const issuesBy = new Map();
  const pushIssue = (oid, issue) => {
    const k = Number(oid);
    if (!issuesBy.has(k)) issuesBy.set(k, []);
    issuesBy.get(k).push(issue);
  };
  dupRows.forEach((r) => pushIssue(r.outlet_id, { type: "DUP_NOTA", order_no: r.order_no, text: `Nomor nota ${r.order_no} dobel (${r.n}x)` }));
  noMethodRows.forEach((r) =>
    pushIssue(r.outlet_id, { type: "NO_METHOD", order_no: r.order_no, text: `Nota ${r.order_no} senilai ${rp(r.amount)} tidak punya metode bayar` })
  );

  const revByOutlet = new Map(revRows.map((r) => [Number(r.outlet_id), r]));
  const payByOutlet = new Map();
  payRows.forEach((r) => {
    const k = Number(r.outlet_id);
    if (!payByOutlet.has(k)) payByOutlet.set(k, []);
    payByOutlet.get(k).push(r);
  });

  return outlets.map((o) => {
    const rev = revByOutlet.get(Number(o.id));
    const revenue = toFixed2(rev?.revenue || 0);
    const pay = {};
    PAYMENT_ROLES.forEach((r) => (pay[r] = 0));
    const unmapped = [];
    const issues = [...(issuesBy.get(Number(o.id)) || [])];
    for (const p of payByOutlet.get(Number(o.id)) || []) {
      const role = methodToRole(p.payment_method);
      const amt = toFixed2(p.amount);
      if (!role) {
        unmapped.push({ method: p.payment_method, amount: amt });
        // metode kosong sudah dilaporkan per nota di atas
        if (String(p.payment_method ?? "").trim()) {
          issues.push({ type: "UNKNOWN_METHOD", method: p.payment_method, text: `Metode bayar "${p.payment_method}" belum dikenal (Rp ${rp(amt)})` });
        }
      } else pay[role] = toFixed2(pay[role] + amt);
    }
    const paymentsTotal = toFixed2(PAYMENT_ROLES.reduce((s, r) => s + pay[r], 0));
    const isEvent = Number(o.is_event) === 1;
    const revenueParts = partsBy.get(Number(o.id)) || [];
    // Kategori layanan yang belum dipetakan ke akun → gagal validasi (outlet Event memakai akun B2B, tidak perlu)
    if (!isEvent) {
      revenueParts
        .filter((p) => !p.account && p.amount)
        .forEach((p) =>
          issues.push({
            type: "UNMAPPED_SERVICE",
            category_id: p.category_id,
            text: `Kategori layanan "${p.category_name}" belum dipetakan ke akun pendapatan (Rp ${rp(p.amount)})`,
          })
        );
    }
    return {
      outlet_id: Number(o.id),
      outlet_name: o.name,
      outlet_code: o.outlet_code,
      is_event: isEvent,
      notes_count: Number(rev?.notes || 0),
      volume_kg: toFixed2(rev?.kg || 0),
      revenue_parts: revenueParts,
      surcharge: toFixed2(rev?.surcharge || 0),
      discount: toFixed2(rev?.discount || 0),
      revenue,
      payments: pay,
      payments_total: paymentsTotal,
      unmapped,
      issues,
    };
  });
}

// Susun baris jurnal dari hasil hitung + pemetaan akun
function buildLines(row, accMap) {
  const lines = [];
  const missing = [];
  const need = (role) => {
    const a = accMap[role];
    if (!a || !a.account_id) {
      if (!missing.includes(role)) missing.push(role);
      return null;
    }
    return a;
  };

  if (row.revenue > 0) {
    lines.push({ account: need("PIUTANG_USAHA"), debit: row.revenue, credit: 0, memo: `Nota dibuat ${row.notes_count} transaksi` });
    if (row.is_event) {
      // Outlet Event/B2B: seluruh pendapatan ke akun B2B
      lines.push({ account: need("PENDAPATAN_B2B"), debit: 0, credit: row.revenue, memo: `Pendapatan ${row.outlet_name}` });
    } else {
      // Pendapatan dipecah per akun hasil pemetaan kategori layanan
      const byAcc = new Map();
      let partsTotal = 0;
      for (const p of row.revenue_parts || []) {
        partsTotal += p.amount;
        if (!p.account) continue; // sudah jadi isu "belum dipetakan"
        const k = p.account.account_id;
        if (!byAcc.has(k)) byAcc.set(k, { account: p.account, amount: 0, names: [] });
        const g = byAcc.get(k);
        g.amount = toFixed2(g.amount + p.amount);
        g.names.push(p.category_name);
      }
      for (const g of byAcc.values()) {
        const memo = g.names.length > 3 ? `${g.names.slice(0, 3).join(", ")} +${g.names.length - 3} kategori` : g.names.join(", ");
        lines.push({ account: g.account, debit: 0, credit: g.amount, memo: `Pendapatan: ${memo}` });
      }
      if (row.surcharge > 0) lines.push({ account: need("PENDAPATAN_KECEPATAN"), debit: 0, credit: row.surcharge, memo: "Biaya kecepatan / ekspres" });
      if (row.discount > 0) lines.push({ account: need("DISKON_PENJUALAN"), debit: row.discount, credit: 0, memo: "Diskon penjualan" });
      // Sisa pembulatan (seharusnya 0) agar jurnal tetap seimbang dengan total nota
      const residual = toFixed2(row.revenue - (partsTotal + row.surcharge - row.discount));
      if (Math.abs(residual) > 0.004) {
        lines.push({ account: need("PENDAPATAN"), debit: residual < 0 ? -residual : 0, credit: residual > 0 ? residual : 0, memo: "Selisih pembulatan nota" });
      }
    }
  }
  if (row.payments_total > 0) {
    for (const role of PAYMENT_ROLES) {
      if (row.payments[role] > 0) {
        lines.push({ account: need(role), debit: row.payments[role], credit: 0, memo: ROLES[role].label });
      }
    }
    lines.push({
      account: need("PIUTANG_USAHA"),
      debit: 0,
      credit: row.payments_total,
      memo: "Pelunasan / pembayaran nota",
    });
  }
  return { lines, missing };
}

function lineView(l) {
  return {
    account_code: l.account?.code || null,
    account_name: l.account?.name || null,
    debit: l.debit,
    credit: l.credit,
    memo: l.memo,
  };
}

async function loadBatches(date) {
  const [rows] = await pool.query(
    `SELECT b.*, je.entry_no, je.status AS journal_status
     FROM tr_pos_batch b LEFT JOIN tr_journal_entries je ON je.id = b.journal_id
     WHERE b.batch_date = ?`,
    [date]
  );
  return new Map(rows.map((r) => [Number(r.outlet_id), r]));
}

// Status batch: KOSONG · VALID (siap posting) · GAGAL (gagal validasi) · TERKUNCI ·
//               DIPOSTING · BERUBAH (data POS berubah setelah diposting) · DIBALIK
function statusOf(row, batch, locked = false) {
  if (!batch || batch.journal_status === "REVERSED") {
    const empty = row.revenue === 0 && row.payments_total === 0 && !row.unmapped.length && !row.issues.length;
    if (!batch && empty) return "KOSONG";
    if (locked) return "TERKUNCI";
    if (row.issues.length || row.unmapped.length) return "GAGAL";
    return batch ? "DIBALIK" : "VALID";
  }
  const changed =
    Math.abs(toFixed2(batch.revenue) - row.revenue) > 0.001 ||
    Math.abs(toFixed2(batch.payments) - row.payments_total) > 0.001;
  return changed ? "BERUBAH" : "DIPOSTING";
}

// ── Tarik & catat data POS satu hari (jadwal malam, tombol "Tarik ulang data", tampilan pertama) ──
export async function syncDay(date, source = "MANUAL", preRows = null) {
  const rows = preRows || (await computeDay(date));
  let changed = 0;
  let count = 0;
  for (const r of rows) {
    const empty = r.revenue === 0 && r.payments_total === 0 && !r.issues.length && !r.unmapped.length;
    if (empty) continue; // cabang tanpa transaksi tidak dicatat
    count += 1;
    const hash = crypto
      .createHash("sha1")
      .update(JSON.stringify([r.revenue, r.payments_total, r.notes_count, r.payments, r.issues.map((i) => i.type + (i.order_no || i.method || ""))]))
      .digest("hex");
    const status = r.issues.length || r.unmapped.length ? "GAGAL" : "VALID";
    const [old] = await pool.query(`SELECT data_hash FROM tr_pos_sync_log WHERE outlet_id=? AND sync_date=?`, [r.outlet_id, date]);
    if (old[0] && old[0].data_hash !== hash) changed += 1;
    await pool.query(
      `INSERT INTO tr_pos_sync_log (outlet_id, sync_date, status, revenue, payments, notes_count, issues_count, data_hash, source, first_received_at, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE status=VALUES(status), revenue=VALUES(revenue), payments=VALUES(payments), notes_count=VALUES(notes_count),
         issues_count=VALUES(issues_count), data_hash=VALUES(data_hash), source=VALUES(source), last_synced_at=NOW()`,
      [r.outlet_id, date, status, r.revenue, r.payments_total, r.notes_count, r.issues.length + r.unmapped.length, hash, source]
    );
  }
  return { date, outlets: count, changed };
}

async function loadSyncLog(date) {
  const [rows] = await pool.query(`SELECT * FROM tr_pos_sync_log WHERE sync_date = ?`, [date]);
  return new Map(rows.map((r) => [Number(r.outlet_id), r]));
}

// ── POST /pos/sync {date} — "Tarik ulang data" ──────────────────────────
export async function postSync(req, res) {
  try {
    const { date } = req.body || {};
    if (!isValidDate(date)) return res.status(422).json({ message: "Tanggal tidak valid." });
    const r = await syncDay(date, "MANUAL");
    return res.json({
      message: r.changed ? `Data ditarik ulang. ${r.changed} cabang berubah sejak penarikan sebelumnya.` : "Data ditarik ulang. Tidak ada perubahan.",
      ...r,
    });
  } catch (err) {
    console.error("[postSync] Error:", err);
    return res.status(500).json({ message: "Gagal menarik data POS", error: err.message });
  }
}

// ── GET /pos/day?date=YYYY-MM-DD ────────────────────────────────────────
export async function getPosDay(req, res) {
  try {
    const date = req.query.date;
    if (!isValidDate(date)) return res.status(422).json({ message: "Tanggal tidak valid (YYYY-MM-DD)." });

    const [accMap, rows, batches, ov, starts] = await Promise.all([loadAccountMap(), computeDay(date), loadBatches(date), loadOutletOverrides(), loadStartDates()]);
    // Hari yang belum pernah ditarik dicatat saat pertama dibuka
    let syncLog = await loadSyncLog(date);
    if (syncLog.size === 0 && rows.some((r) => r.revenue || r.payments_total)) {
      await syncDay(date, "AUTO", rows);
      syncLog = await loadSyncLog(date);
    }
    const lockedIds = new Set(await lockedOutlets(date, rows.map((r) => r.outlet_id)));
    const ymd = date.replace(/-/g, "");

    const data = rows.map((row) => {
      const batch = batches.get(row.outlet_id);
      const locked = lockedIds.has(row.outlet_id);
      const { lines, missing } = buildLines(row, ov.forOutlet(row.outlet_id, accMap));
      return {
        ...row,
        status: !batch && beforeStart(starts, row.outlet_id, date) ? "BELUM_MULAI" : statusOf(row, batch, locked),
        start_note: beforeStart(starts, row.outlet_id, date) ? startMessage(starts, row.outlet_id, row.outlet_name) : null,
        locked,
        batch_code: `POS-${row.outlet_code || row.outlet_id}-${ymd}`,
        received_at: syncLog.get(row.outlet_id)?.first_received_at || null,
        synced_at: syncLog.get(row.outlet_id)?.last_synced_at || null,
        posted_at: batch?.posted_at || null,
        journal_id: batch?.journal_id || null,
        journal_no: batch?.entry_no || null,
        missing_roles: missing,
        lines: lines.map(lineView),
      };
    });

    const mapping = Object.entries(ROLES).map(([role, def]) => ({
      role,
      label: def.label,
      account_code: accMap[role]?.code || null,
      account_name: accMap[role]?.name || null,
    }));

    return res.json({ date, data, mapping });
  } catch (err) {
    console.error("[getPosDay] Error:", err);
    return res.status(500).json({ message: "Gagal mengambil data POS", error: err.message });
  }
}

// ── Posting satu outlet (dipakai juga oleh post-all) ────────────────────
async function postOutletDay(date, outletId, actorId) {
  const conn = await pool.getConnection();
  try {
    const [accMap, rows, ov] = await Promise.all([loadAccountMap(), computeDay(date), loadOutletOverrides()]);
    const row = rows.find((r) => r.outlet_id === Number(outletId));
    if (!row) return { ok: false, message: "Outlet tidak ditemukan." };
    const starts = await loadStartDates();
    if (beforeStart(starts, row.outlet_id, date)) return { ok: false, message: startMessage(starts, row.outlet_id, row.outlet_name) };
    const lockMsg = await dayLockMessage(date, [row.outlet_id]);
    if (lockMsg) return { ok: false, message: lockMsg };
    if (row.issues.length || row.unmapped.length) {
      const shown = row.issues.slice(0, 3).map((i) => i.text).join("; ");
      const more = row.issues.length > 3 ? ` (+${row.issues.length - 3} lainnya)` : "";
      return { ok: false, message: `Gagal validasi: ${shown || "metode bayar tidak dikenal"}${more}.` };
    }
    const { lines, missing } = buildLines(row, ov.forOutlet(row.outlet_id, accMap));
    if (missing.length) {
      return { ok: false, message: `Pemetaan akun belum lengkap: ${missing.map((m) => ROLES[m].label).join(", ")}.` };
    }
    if (!lines.length) return { ok: false, message: "Tidak ada transaksi untuk diposting." };

    const totalDebit = toFixed2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = toFixed2(lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      return { ok: false, message: "Jurnal tidak seimbang, posting dibatalkan." };
    }

    await conn.beginTransaction();

    const [existing] = await conn.query(
      `SELECT b.id, b.journal_id, je.status AS journal_status
       FROM tr_pos_batch b LEFT JOIN tr_journal_entries je ON je.id = b.journal_id
       WHERE b.outlet_id = ? AND b.batch_date = ? FOR UPDATE`,
      [row.outlet_id, date]
    );
    if (existing.length && existing[0].journal_status !== "REVERSED") {
      await conn.rollback();
      return { ok: false, message: "Hari ini untuk outlet ini sudah diposting." };
    }

    const base = `JU-POS-${row.outlet_code || row.outlet_id}-${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
    const [cnt] = await conn.query(`SELECT COUNT(*) AS n FROM tr_journal_entries WHERE source_ref = ?`, [base]);
    const entryNo = cnt[0].n === 0 ? base : `${base}-v${cnt[0].n + 1}`;
    const description = `Penjualan POS ${row.outlet_name} ${date}`;

    const [h] = await conn.query(
      `INSERT INTO tr_journal_entries
         (entry_no, entry_date, description, status, total_amount, created_by, source_type, source_ref, outlet_id)
       VALUES (?, ?, ?, 'POSTED', ?, ?, 'POS', ?, ?)`,
      [entryNo, date, description, totalDebit, actorId, base, row.outlet_id]
    );
    const entryId = h.insertId;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await conn.query(
        `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entryId, i + 1, l.account.account_id, l.debit, l.credit, l.memo, row.outlet_id]
      );
    }

    if (existing.length) {
      await conn.query(
        `UPDATE tr_pos_batch SET revenue=?, payments=?, notes_count=?, journal_id=?, posted_by=?, posted_at=NOW() WHERE id=?`,
        [row.revenue, row.payments_total, row.notes_count, entryId, actorId, existing[0].id]
      );
    } else {
      await conn.query(
        `INSERT INTO tr_pos_batch (outlet_id, batch_date, revenue, payments, notes_count, journal_id, posted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.outlet_id, date, row.revenue, row.payments_total, row.notes_count, entryId, actorId]
      );
    }

    try {
      await conn.query(
        `INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value)
         VALUES ('tr_journal_entries', ?, 'CREATE', ?, ?)`,
        [entryId, actorId, JSON.stringify({ entry_no: entryNo, source: "POS", outlet_id: row.outlet_id, date })]
      );
    } catch (e) {
      console.warn("[postOutletDay] audit log gagal:", e.message);
    }

    await conn.commit();
    return { ok: true, entry_no: entryNo, id: entryId, outlet_name: row.outlet_name };
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[postOutletDay] Error:", err);
    return { ok: false, message: `Gagal memposting: ${err.message}` };
  } finally {
    conn.release();
  }
}

// ── POST /pos/post {date, outlet_id} ────────────────────────────────────
export async function postPos(req, res) {
  const { date, outlet_id } = req.body || {};
  if (!isValidDate(date) || !outlet_id) return res.status(422).json({ message: "Tanggal dan outlet wajib diisi." });
  const r = await postOutletDay(date, outlet_id, req.user?.id || null);
  if (!r.ok) return res.status(422).json({ message: r.message });
  return res.status(201).json({ message: `Jurnal ${r.entry_no} berhasil diposting.`, ...r });
}

// ── POST /pos/post-all {date} : posting semua outlet yang siap ──────────
export async function postPosAll(req, res) {
  const { date } = req.body || {};
  if (!isValidDate(date)) return res.status(422).json({ message: "Tanggal tidak valid." });
  const [rows, batches, starts] = await Promise.all([computeDay(date), loadBatches(date), loadStartDates()]);
  const results = [];
  for (const row of rows) {
    if (beforeStart(starts, row.outlet_id, date)) continue;
    const st = statusOf(row, batches.get(row.outlet_id), false);
    if (st !== "VALID" && st !== "DIBALIK") continue;
    const r = await postOutletDay(date, row.outlet_id, req.user?.id || null);
    results.push({ outlet_id: row.outlet_id, outlet_name: row.outlet_name, ...r });
  }
  const ok = results.filter((r) => r.ok).length;
  return res.json({
    message: results.length ? `${ok} dari ${results.length} outlet berhasil diposting.` : "Tidak ada outlet yang perlu diposting.",
    results,
  });
}

// ── GET /pos/detail?date=&outlet_id= — rincian batch sampai ke setiap nota ─
// Data POS hanya dibaca, tidak bisa diubah dari sini.
export async function getPosDetail(req, res) {
  try {
    const { date, outlet_id } = req.query;
    if (!isValidDate(date) || !outlet_id) return res.status(422).json({ message: "Tanggal dan outlet wajib diisi." });
    const oid = Number(outlet_id);

    const [nota] = await myWaschenPool.query(
      `SELECT t.id, t.order_no, DATE_FORMAT(t.order_date, '%H:%i') AS jam, c.name AS customer,
              t.order_category, t.total_weight_kg, t.total_pcs, t.grand_total, t.payment_status, t.payment_method,
              (SELECT GROUP_CONCAT(DISTINCT d.service_name ORDER BY d.id SEPARATOR ', ')
                 FROM tr_transaction_detail d WHERE d.transaction_id = t.id) AS layanan
       FROM tr_transaction t LEFT JOIN mst_customer c ON c.id = t.customer_id
       WHERE t.outlet_id = ? AND t.order_date >= ? AND t.order_date < DATE_ADD(?, INTERVAL 1 DAY) AND t.is_delete_requested = 0
       ORDER BY t.order_date, t.id LIMIT 2000`,
      [oid, date, date]
    );
    const [pembayaran] = await myWaschenPool.query(
      `SELECT DATE_FORMAT(l.created_at, '%H:%i') AS jam, t.order_no, l.log_type, l.payment_method, l.amount
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
       WHERE t.outlet_id = ? AND l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND l.log_type IN ('DP', 'Lunas', 'Pelunasan') AND t.is_delete_requested = 0
       ORDER BY l.created_at, l.id LIMIT 2000`,
      [oid, date, date]
    );
    const [deposit] = await myWaschenPool.query(
      `SELECT DATE_FORMAT(d.created_at, '%H:%i') AS jam, c.name AS customer, d.type, d.amount, d.payment_method, d.notes
       FROM tr_customer_deposit d LEFT JOIN mst_customer c ON c.id = d.customer_id
       WHERE d.outlet_id = ? AND d.created_at >= ? AND d.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY d.created_at, d.id LIMIT 2000`,
      [oid, date, date]
    );
    const [voids] = await myWaschenPool.query(
      `SELECT t.order_no, DATE_FORMAT(t.order_date, '%H:%i') AS jam, t.grand_total, t.delete_reason, t.delete_approval_status
       FROM tr_transaction t
       WHERE t.outlet_id = ? AND t.order_date >= ? AND t.order_date < DATE_ADD(?, INTERVAL 1 DAY) AND t.is_delete_requested = 1
       ORDER BY t.order_date LIMIT 500`,
      [oid, date, date]
    );

    return res.json({
      date,
      outlet_id: oid,
      nota: nota.map((n) => ({ ...n, grand_total: toFixed2(n.grand_total), total_weight_kg: Number(n.total_weight_kg) || 0, total_pcs: Number(n.total_pcs) || 0 })),
      pembayaran: pembayaran.map((p) => ({ ...p, amount: toFixed2(p.amount) })),
      deposit: deposit.map((d) => ({ ...d, amount: toFixed2(d.amount) })),
      void: voids.map((v) => ({ ...v, grand_total: toFixed2(v.grand_total) })),
    });
  } catch (err) {
    console.error("[getPosDetail] Error:", err);
    return res.status(500).json({ message: "Gagal mengambil rincian batch POS", error: err.message });
  }
}
