import { pool, myWaschenPool, safeQuery, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { cutoffRange, currentCutoffMonth } from "../dashboard/dashboard.controller.js";
import { loadStartDates, beforeStart } from "../../utils/outletStart.js";

// ════════════════════════════════════════════════════════════════════════════
// TUTUP BUKU > CHECKLIST PERIODE
// Sembilan langkah sebelum laporan bulanan dikunci (Konsep hal. 26, Referensi hal. 26).
// Status dihitung otomatis dari data. Langkah yang modulnya belum dibangun ditandai
// UNAVAILABLE dan membuat periode belum bisa dikunci.
// ════════════════════════════════════════════════════════════════════════════


export const CLOSING_ROLES = { ALOKASI_BIAYA_PUSAT: { label: "Alokasi Biaya Pusat", code: "5-1011" } };

const LIVE = "je.status IN ('POSTED','REVERSED')";
const ROUNDING = { JUTA: 1e6, RIBU: 1e3, NONE: 1 };

// ── Hitung alokasi biaya pusat satu periode ─────────────────────────────
// Biaya pusat = semua beban berdimensi "Pusat" (tanpa cabang) pada periode, di luar akun alokasi itu sendiri.
// Dasar alokasi = porsi pendapatan tiap cabang (dari jurnal). Pembulatan sisa ke cabang terbesar.
async function computeAllocation(p, rounding = "JUTA") {
  const [[role]] = await pool.query(`SELECT m.account_id, a.code, a.name FROM mst_account_map m JOIN mst_coa a ON a.id = m.account_id WHERE m.role = 'ALOKASI_BIAYA_PUSAT'`).then(([r]) => [r]);
  const allocId = role?.account_id || 0;
  const [[central]] = await pool.query(
    `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS amt
     FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id JOIN mst_coa a ON a.id = jl.account_id
     WHERE ${LIVE} AND a.type = 'BEBAN' AND jl.outlet_id IS NULL AND jl.account_id <> ? AND je.entry_date BETWEEN ? AND ?`,
    [allocId, p.start, p.end]
  ).then(([r]) => [r]);
  const [revRows] = await pool.query(
    `SELECT jl.outlet_id, SUM(jl.credit - jl.debit) AS revenue
     FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id JOIN mst_coa a ON a.id = jl.account_id
     WHERE ${LIVE} AND a.type = 'PENDAPATAN' AND jl.outlet_id IS NOT NULL AND je.entry_date BETWEEN ? AND ?
     GROUP BY jl.outlet_id HAVING revenue > 0`,
    [p.start, p.end]
  );
  const outlets = await getOutlets();
  const nameOf = new Map(outlets.map((o) => [o.id, o.name]));
  const totalCentral = toFixed2(central.amt);
  const totalRev = revRows.reduce((s, r) => s + Number(r.revenue), 0);
  const unit = ROUNDING[rounding] || 1;
  const rows = revRows
    .map((r) => {
      const share = totalRev > 0 ? Number(r.revenue) / totalRev : 0;
      return {
        outlet_id: Number(r.outlet_id),
        outlet_name: nameOf.get(Number(r.outlet_id)) || `Outlet #${r.outlet_id}`,
        revenue: toFixed2(r.revenue),
        share: toFixed2(share * 100),
        amount: totalCentral > 0 ? Math.round((totalCentral * share) / unit) * unit : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  // Selisih pembulatan dibebankan ke cabang dengan pendapatan terbesar agar total = biaya pusat
  const diff = toFixed2(totalCentral - rows.reduce((s, r) => s + r.amount, 0));
  if (rows.length && Math.abs(diff) > 0.004) rows[0].amount = toFixed2(rows[0].amount + diff);

  const [[existing]] = await pool.query(
    `SELECT id, entry_no, status FROM tr_journal_entries WHERE source_type = 'ALOKASI' AND source_ref = ? ORDER BY id DESC LIMIT 1`,
    [`ALO-${p.key}`]
  ).then(([r]) => [r]);
  return { role, totalCentral, totalRev: toFixed2(totalRev), rows, existing: existing || null };
}

// ── GET /closing/allocation?year=&month=&rounding= ──────────────────────
export async function getAllocation(req, res) {
  try {
    const p = periodOf(req.query);
    const rounding = ROUNDING[req.query.rounding] ? req.query.rounding : "JUTA";
    const a = await computeAllocation(p, rounding);
    const lines = a.rows
      .filter((r) => r.amount > 0)
      .flatMap((r) => [
        { account: a.role ? `${a.role.code} ${a.role.name}` : null, outlet: r.outlet_name, debit: r.amount, credit: 0 },
        { account: a.role ? `${a.role.code} ${a.role.name}` : null, outlet: "Pusat", debit: 0, credit: r.amount },
      ]);
    return res.json({
      period: { year: p.year, month: p.month, key: p.key, from: p.start, to: p.end },
      base: "Porsi pendapatan",
      rounding,
      central_total: a.totalCentral,
      revenue_total: a.totalRev,
      rows: a.rows,
      lines,
      account: a.role ? `${a.role.code} ${a.role.name}` : null,
      existing: a.existing,
      can_post: Boolean(a.role) && a.totalCentral > 0 && a.rows.length > 0 && (!a.existing || a.existing.status === "REVERSED"),
    });
  } catch (err) {
    console.error("[getAllocation]", err);
    return res.status(500).json({ message: "Gagal menghitung alokasi", error: err.message });
  }
}

// ── POST /closing/allocation {year, month, rounding} — "Posting alokasi" ─
export async function postAllocation(req, res) {
  const conn = await pool.getConnection();
  try {
    const p = periodOf(req.body || {});
    const rounding = ROUNDING[req.body?.rounding] ? req.body.rounding : "JUTA";
    const a = await computeAllocation(p, rounding);
    if (!a.role) return res.status(422).json({ message: "Peran 'Alokasi Biaya Pusat' belum dipetakan di Pengaturan." });
    if (a.existing && a.existing.status !== "REVERSED") return res.status(422).json({ message: `Alokasi periode ini sudah diposting (${a.existing.entry_no}). Balik jurnalnya dulu untuk mengulang.` });
    if (!(a.totalCentral > 0)) return res.status(422).json({ message: "Tidak ada biaya pusat (beban tanpa cabang) pada periode ini." });
    if (!a.rows.length) return res.status(422).json({ message: "Belum ada pendapatan cabang di jurnal periode ini sebagai dasar alokasi." });

    await conn.beginTransaction();
    const ref = `ALO-${p.key}`;
    const [[cnt]] = await conn.query(`SELECT COUNT(*) AS n FROM tr_journal_entries WHERE source_ref = ?`, [ref]).then(([r]) => [r]);
    const entryNo = cnt.n ? `JU-${ref}-v${cnt.n + 1}` : `JU-${ref}`;
    // Jurnal penyesuaian akhir periode: dicatat pada tanggal akhir cutoff, tidak terikat kunci harian cabang.
    const [h] = await conn.query(
      `INSERT INTO tr_journal_entries (entry_no, entry_date, description, status, total_amount, created_by, source_type, source_ref, approved_by, approved_at)
       VALUES (?, ?, ?, 'POSTED', ?, ?, 'ALOKASI', ?, ?, NOW())`,
      [entryNo, p.end, `Alokasi biaya pusat ${p.key} (dasar porsi pendapatan)`, a.totalCentral, req.user?.id || null, ref, req.user?.id || null]
    );
    let n = 1;
    for (const r of a.rows.filter((x) => x.amount > 0)) {
      await conn.query(
        `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [h.insertId, n++, a.role.account_id, r.amount, `Alokasi ${r.share}% ke ${r.outlet_name}`, r.outlet_id]
      );
      await conn.query(
        `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, 0, ?, ?, NULL)`,
        [h.insertId, n++, a.role.account_id, r.amount, `Alokasi ke ${r.outlet_name}`]
      );
    }
    try {
      await conn.query(
        `INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('tr_journal_entries', ?, 'CREATE', ?, ?)`,
        [h.insertId, req.user?.id || null, JSON.stringify({ entry_no: entryNo, source: "ALOKASI", period: p.key, total: a.totalCentral })]
      );
    } catch {
      /* audit tidak menggagalkan */
    }
    await conn.commit();
    return res.status(201).json({ message: `Alokasi diposting sebagai ${entryNo}.`, entry_no: entryNo });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[postAllocation]", err);
    return res.status(500).json({ message: "Gagal memposting alokasi", error: err.message });
  } finally {
    conn.release();
  }
}

const pad2 = (n) => String(n).padStart(2, "0");
const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

function periodOf(q) {
  const cur = currentCutoffMonth();
  const year = parseInt(q.year, 10) || cur.year;
  const month = parseInt(q.month, 10) || cur.month;
  return { year, month, key: `${year}-${pad2(month)}`, ...cutoffRange(year, month) };
}

// ── GET /closing/checklist ──────────────────────────────────────────────
export async function getChecklist(req, res) {
  try {
    const p = periodOf(req.query);
    const today = todayWib();
    const lastDay = p.end < addDays(today, -1) ? p.end : addDays(today, -1); // hari lengkap terakhir
    const periodOver = p.end < today;

    // Aktivitas POS per cabang per hari selama periode (sampai kemarin)
    const [salesAct] = lastDay >= p.start
      ? await myWaschenPool.query(
          `SELECT outlet_id, DATE_FORMAT(order_date,'%Y-%m-%d') AS d FROM tr_transaction
           WHERE order_date >= ? AND order_date < DATE_ADD(?, INTERVAL 1 DAY) AND is_delete_requested = 0
           GROUP BY outlet_id, d`,
          [p.start, lastDay]
        )
      : [[]];
    const [payAct] = lastDay >= p.start
      ? await myWaschenPool.query(
          `SELECT t.outlet_id, DATE_FORMAT(l.created_at,'%Y-%m-%d') AS d,
                  SUM(CASE WHEN l.payment_method LIKE 'QRIS%' THEN l.amount ELSE 0 END) AS qris,
                  SUM(CASE WHEN l.payment_method LIKE 'EDC%' THEN l.amount ELSE 0 END) AS edc
           FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
           WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
             AND l.log_type IN ('DP','Lunas','Pelunasan') AND t.is_delete_requested = 0
           GROUP BY t.outlet_id, d`,
          [p.start, lastDay]
        )
      : [[]];
    const starts = await loadStartDates();
    const days = new Map(); // "outlet|date" → {qris, edc}
    salesAct.forEach((r) => {
      if (!beforeStart(starts, r.outlet_id, r.d)) days.set(`${r.outlet_id}|${r.d}`, { qris: 0, edc: 0 });
    });
    payAct.forEach((r) => {
      if (beforeStart(starts, r.outlet_id, r.d)) return;
      const k = `${r.outlet_id}|${r.d}`;
      const cur = days.get(k) || { qris: 0, edc: 0 };
      cur.qris = Number(r.qris);
      cur.edc = Number(r.edc);
      days.set(k, cur);
    });
    const total = days.size;

    const [[batchRows], [lockRows], [setRows]] = await Promise.all([
      pool.query(
        `SELECT b.outlet_id, DATE_FORMAT(b.batch_date,'%Y-%m-%d') AS d
         FROM tr_pos_batch b JOIN tr_journal_entries je ON je.id = b.journal_id
         WHERE je.status = 'POSTED' AND b.batch_date BETWEEN ? AND ?`,
        [p.start, p.end]
      ),
      pool.query(`SELECT outlet_id, DATE_FORMAT(rec_date,'%Y-%m-%d') AS d FROM tr_recon_daily WHERE status='APPROVED' AND rec_date BETWEEN ? AND ?`, [p.start, p.end]),
      pool.query(`SELECT outlet_id, method, DATE_FORMAT(trx_date,'%Y-%m-%d') AS d FROM tr_settlement WHERE trx_date BETWEEN ? AND ?`, [p.start, p.end]),
    ]);
    const posted = new Set(batchRows.map((r) => `${r.outlet_id}|${r.d}`));
    const locked = new Set(lockRows.map((r) => `${r.outlet_id}|${r.d}`));
    const settled = new Set(setRows.map((r) => `${r.outlet_id}|${r.method}|${r.d}`));

    let postedN = 0;
    let lockedN = 0;
    let settleTotal = 0;
    let settleDone = 0;
    for (const [k, v] of days) {
      if (posted.has(k)) postedN += 1;
      if (locked.has(k)) lockedN += 1;
      const [o, d] = k.split("|");
      for (const m of ["QRIS", "EDC"]) {
        if ((m === "QRIS" ? v.qris : v.edc) > 0) {
          settleTotal += 1;
          if (settled.has(`${o}|${m}|${d}`)) settleDone += 1;
        }
      }
    }

    // Deposit member: saldo POS vs akun Deposit (posisi akhir periode / hari ini)
    const [[map]] = await pool.query(`SELECT account_id FROM mst_account_map WHERE role = 'DEPOSIT_MEMBER'`).then(([r]) => [r]);
    let depositDiff = null;
    if (map?.account_id) {
      const [[pos]] = await myWaschenPool.query(`SELECT COALESCE(SUM(deposit_balance),0) AS bal FROM mst_customer`).then(([r]) => [r]);
      const [[acc]] = await pool.query(
        `SELECT COALESCE(SUM(jl.credit - jl.debit),0) AS bal FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id
         WHERE je.status IN ('POSTED','REVERSED') AND jl.account_id = ? AND je.entry_date <= ?`,
        [map.account_id, p.end < today ? p.end : today]
      ).then(([r]) => [r]);
      depositDiff = toFixed2(Number(pos.bal) - Number(acc.bal));
    }

    const [[closing]] = await pool.query(`SELECT * FROM tr_period_closing WHERE period_key = ?`, [p.key]).then(([r]) => [r.length ? r : [null]]);
    const outlets = await getOutlets();

    // Mutasi rekening koran periode ini (semua rekening aktif)
    const [[bankStmt]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(m.statement_id IS NULL) AS unmatched
       FROM tr_bank_statement s
       LEFT JOIN (SELECT DISTINCT statement_id FROM tr_bank_match) m ON m.statement_id = s.id
       WHERE s.trx_date BETWEEN ? AND ?`,
      [p.start, p.end]
    ).then(([r]) => [r]).catch(() => [[{ total: 0, unmatched: 0 }]]);
    bankStmt.total = Number(bankStmt.total || 0);
    bankStmt.unmatched = Number(bankStmt.unmatched || 0);
    const [[allocJ]] = await pool.query(
      `SELECT entry_no, status FROM tr_journal_entries WHERE source_type = 'ALOKASI' AND source_ref = ? ORDER BY id DESC LIMIT 1`,
      [`ALO-${p.key}`]
    ).then(([r]) => [r.length ? r : [null]]);

    const [[depJ]] = await pool.query(
      `SELECT entry_no, status FROM tr_journal_entries WHERE source_type = 'PENYUSUTAN' AND source_ref = ? ORDER BY id DESC LIMIT 1`,
      [`SUSUT-${p.key}`]
    ).then(([r]) => [r.length ? r : [null]]);
    const [[assetCount]] = await pool.query(`SELECT COUNT(*) AS n FROM mst_asset WHERE status = 'AKTIF'`).then(([r]) => [r]).catch(() => [[{ n: 0 }]]);

    const ratio = (done, tot) => ({ done, total: tot });
    const st = (done, tot) => (tot > 0 && done === tot ? "DONE" : "PENDING");
    const steps = [
      { no: 1, title: "Semua hari POS tersinkron dan diposting", status: st(postedN, total), progress: ratio(postedN, total), unit: "cabang-hari", detail: total === 0 ? "Belum ada transaksi pada periode ini." : null, link: "/finance-ho/integrasi-pos" },
      { no: 2, title: "Rekonsiliasi harian selesai (hari dikunci)", status: st(lockedN, total), progress: ratio(lockedN, total), unit: "cabang-hari", link: "/finance-ho/rekonsiliasi" },
      {
        no: 3,
        title: "Settlement dan rekonsiliasi bank cocok",
        status: settleDone === settleTotal && bankStmt.total > 0 && bankStmt.unmatched === 0 ? "DONE" : "PENDING",
        progress: ratio(settleDone, settleTotal),
        unit: "settlement QRIS/EDC",
        detail:
          bankStmt.total === 0
            ? "Belum ada mutasi rekening koran diimpor."
            : `Mutasi bank: ${bankStmt.total - bankStmt.unmatched} / ${bankStmt.total} cocok`,
        link: "/finance-ho/rekonsiliasi?tab=bank",
      },
      {
        no: 4,
        title: "Saldo deposit POS = akun Deposit",
        status: depositDiff == null ? "UNAVAILABLE" : Math.abs(depositDiff) < 1 ? "DONE" : "PENDING",
        progress: null,
        detail: depositDiff == null ? "Akun Deposit belum dipetakan." : Math.abs(depositDiff) < 1 ? "Cocok" : `Selisih Rp ${new Intl.NumberFormat("id-ID").format(depositDiff)}`,
        link: "/finance-ho/pelanggan/deposit",
      },
      { no: 5, title: "Tagihan korporat terbit, aging dicek", status: "UNAVAILABLE", progress: null, detail: "Modul tagihan korporat belum tersedia." },
      { no: 6, title: "Opname dan pemakaian bahan", status: "UNAVAILABLE", progress: null, detail: "Modul Persediaan belum tersedia." },
      {
        no: 7,
        title: "Penyusutan dan akrual",
        status: depJ && depJ.status === "POSTED" ? "DONE" : "PENDING",
        progress: null,
        detail:
          depJ && depJ.status === "POSTED"
            ? `Penyusutan diposting ${depJ.entry_no}. Akrual (listrik, gaji) dicatat lewat jurnal manual.`
            : assetCount.n
              ? "Penyusutan periode ini belum dijalankan."
              : "Belum ada aset terdaftar. Akrual dicatat lewat jurnal manual.",
        link: "/finance-ho/aset-tetap",
      },
      {
        no: 8,
        title: "Alokasi biaya pusat",
        status: allocJ && allocJ.status === "POSTED" ? "DONE" : "PENDING",
        progress: null,
        detail: allocJ && allocJ.status === "POSTED" ? `Diposting ${allocJ.entry_no}` : "Belum diposting.",
        link: "/finance-ho/tutup-buku?tab=alokasi",
      },
      {
        no: 9,
        title: "Review laba rugi per cabang",
        status: closing?.review_done ? "DONE" : "PENDING",
        progress: null,
        detail: closing?.review_done ? `Direview ${String(closing.review_at).slice(0, 10)}` : "Tandai setelah laba rugi per cabang diperiksa.",
        link: "/finance-ho/laporan",
        manual: true,
      },
    ];

    const done = steps.filter((s) => s.status === "DONE").length;
    return res.json({
      period: { year: p.year, month: p.month, key: p.key, from: p.start, to: p.end, over: periodOver },
      outlets: outlets.length,
      steps,
      summary: {
        done,
        total: steps.length,
        unavailable: steps.filter((s) => s.status === "UNAVAILABLE").length,
        can_lock: done === steps.length,
      },
    });
  } catch (err) {
    console.error("[getChecklist]", err);
    return res.status(500).json({ message: "Gagal menyusun checklist tutup buku", error: err.message });
  }
}

// ── POST /closing/review {year, month, done} ────────────────────────────
export async function setReview(req, res) {
  try {
    const p = periodOf(req.body || {});
    const done = req.body?.done ? 1 : 0;
    await pool.query(
      `INSERT INTO tr_period_closing (period_key, review_done, review_by, review_at) VALUES (?, ?, ?, ${done ? "NOW()" : "NULL"})
       ON DUPLICATE KEY UPDATE review_done = VALUES(review_done), review_by = VALUES(review_by), review_at = VALUES(review_at)`,
      [p.key, done, req.user?.id || null]
    );
    return res.json({ message: done ? "Review laba rugi ditandai selesai." : "Tanda review dicabut." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan review", error: err.message });
  }
}
