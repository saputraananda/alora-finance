import { pool, myWaschenPool, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { resolveRange } from "./dashboard.controller.js";
import { computeAging } from "../../utils/aging.js";
import { parseUnit } from "../../utils/unit.js";
import { loadStartDates, beforeStart } from "../../utils/outletStart.js";

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD — REKONSILIASI, PERLU TINDAKAN, AGING, REKON & KAS
//  • Status rekonsiliasi, perlu tindakan: dari data rekonsiliasi + aktivitas POS.
//  • Aging piutang: dibaca langsung dari nota POS yang belum lunas
//    (belum ada kebijakan jatuh tempo, jadi umur dihitung sejak nota dibuat).
//  • Pendapatan, beban, laba ada di dashboard.controller.js (dari jurnal).
// ════════════════════════════════════════════════════════════════════════════

const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export async function getDashboardOverview(req, res) {
  try {
    const outletId = req.query.outlet ? Number(req.query.outlet) : null;
    const { from: start, to: end } = resolveRange(req.query);

    const today = todayWib();
    const yesterday = addDays(today, -1);
    const winStart = [start, addDays(today, -14)].sort()[0]; // jendela aktivitas POS
    const winEnd = today;

    const outlets = await getOutlets();
    const scope = outlets.filter((o) => !outletId || o.id === outletId);

    // ── 1. Beban MDR periode ini (jurnal; akun peran BEBAN_MDR) ──────────
    const [[mdrRow]] = await pool.query(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
       FROM tr_journal_lines jl
       JOIN tr_journal_entries je ON je.id = jl.entry_id
       JOIN mst_account_map m ON m.account_id = jl.account_id AND m.role = 'BEBAN_MDR'
       WHERE je.status IN ('POSTED','REVERSED') AND je.entry_date BETWEEN ? AND ?${outletId ? " AND jl.outlet_id = ?" : ""}`,
      outletId ? [start, end, outletId] : [start, end]
    );

    // ── 3. Rekonsiliasi: hari terkunci dalam periode, selisih kas ────────
    const [dailyRows] = await pool.query(
      `SELECT outlet_id, DATE_FORMAT(rec_date,'%Y-%m-%d') AS d, status, snapshot
       FROM tr_recon_daily WHERE rec_date BETWEEN ? AND ?${outletId ? " AND outlet_id = ?" : ""}`,
      outletId ? [winStart, winEnd, outletId] : [winStart, winEnd]
    );
    const dailyBy = new Map();
    let cashDiffTotal = 0;
    let cashDiffDays = 0;
    dailyRows.forEach((r) => {
      let diff = 0;
      try {
        const snap = typeof r.snapshot === "string" ? JSON.parse(r.snapshot) : r.snapshot;
        diff = toFixed2(snap?.methods?.find((m) => m.key === "TUNAI")?.diff || 0);
      } catch {
        diff = 0;
      }
      dailyBy.set(`${r.outlet_id}|${r.d}`, { status: r.status, diff });
      if (r.status === "APPROVED" && r.d >= start && r.d <= end && Math.abs(diff) > 1) {
        cashDiffTotal += diff;
        cashDiffDays += 1;
      }
    });

    // ── 4. Aktivitas POS (untuk status hari & perlu tindakan) ────────────
    const oc = outletId ? " AND t.outlet_id = ?" : "";
    const oparam = outletId ? [outletId] : [];
    const [[salesAct], [payAct]] = await Promise.all([
      myWaschenPool.query(
        `SELECT t.outlet_id, DATE_FORMAT(t.order_date,'%Y-%m-%d') AS d, COUNT(*) AS n
         FROM tr_transaction t
         WHERE t.order_date >= ? AND t.order_date < DATE_ADD(?, INTERVAL 1 DAY) AND t.is_delete_requested = 0${oc}
         GROUP BY t.outlet_id, d`,
        [winStart, winEnd, ...oparam]
      ),
      myWaschenPool.query(
        `SELECT t.outlet_id, DATE_FORMAT(l.created_at,'%Y-%m-%d') AS d,
                SUM(CASE WHEN l.payment_method LIKE 'Tunai%' THEN l.amount ELSE 0 END) AS cash,
                SUM(CASE WHEN l.payment_method LIKE 'QRIS%' THEN l.amount ELSE 0 END) AS qris,
                SUM(CASE WHEN l.payment_method LIKE 'EDC%' THEN l.amount ELSE 0 END) AS edc
         FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
         WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
           AND l.log_type IN ('DP','Lunas','Pelunasan') AND t.is_delete_requested = 0${oc}
         GROUP BY t.outlet_id, d`,
        [winStart, winEnd, ...oparam]
      ),
    ]);
    const act = new Map(); // "outlet|date" → {sales, cash, qris, edc}
    const slot = (o, d) => {
      const k = `${o}|${d}`;
      if (!act.has(k)) act.set(k, { sales: 0, cash: 0, qris: 0, edc: 0 });
      return act.get(k);
    };
    salesAct.forEach((r) => (slot(Number(r.outlet_id), r.d).sales = Number(r.n)));
    payAct.forEach((r) => {
      const s = slot(Number(r.outlet_id), r.d);
      s.cash = Number(r.cash);
      s.qris = Number(r.qris);
      s.edc = Number(r.edc);
    });
    const starts = await loadStartDates();
    const hasActivity = (o, d) => {
      if (beforeStart(starts, o, d)) return false; // sebelum tanggal mulai cabang: diabaikan
      const a = act.get(`${o}|${d}`);
      return Boolean(a && (a.sales > 0 || a.cash > 0 || a.qris > 0 || a.edc > 0));
    };

    const [[batchRows], [depRows], [setRows]] = await Promise.all([
      pool.query(
        `SELECT b.outlet_id, DATE_FORMAT(b.batch_date,'%Y-%m-%d') AS d
         FROM tr_pos_batch b JOIN tr_journal_entries je ON je.id = b.journal_id
         WHERE je.status = 'POSTED' AND b.batch_date BETWEEN ? AND ?`,
        [winStart, winEnd]
      ),
      pool.query(`SELECT outlet_id, DATE_FORMAT(sales_date,'%Y-%m-%d') AS d FROM tr_cash_deposit WHERE sales_date BETWEEN ? AND ?`, [winStart, winEnd]),
      pool.query(`SELECT outlet_id, method, DATE_FORMAT(trx_date,'%Y-%m-%d') AS d FROM tr_settlement WHERE trx_date BETWEEN ? AND ?`, [winStart, winEnd]),
    ]);
    const posted = new Set(batchRows.map((r) => `${r.outlet_id}|${r.d}`));
    const deposited = new Set(depRows.map((r) => `${r.outlet_id}|${r.d}`));
    const settled = new Set(setRows.map((r) => `${r.outlet_id}|${r.method}|${r.d}`));

    // Hari berjalan dalam rentang (s/d kemarin) yang punya transaksi: berapa yang sudah dikunci & cocok
    let activeDays = 0;
    let cocokDays = 0;
    for (const o of scope) {
      for (let d = start; d <= end && d <= yesterday; d = addDays(d, 1)) {
        if (!hasActivity(o.id, d)) continue;
        activeDays += 1;
        const rec = dailyBy.get(`${o.id}|${d}`);
        if (rec?.status === "APPROVED" && Math.abs(rec.diff) <= 1) cocokDays += 1;
      }
    }

    // ── 4b. Volume cucian periode ini (kg) — dibaca langsung dari nota POS ─
    const [[vol]] = await myWaschenPool.query(
      `SELECT COALESCE(SUM(t.total_weight_kg), 0) AS kg, COALESCE(SUM(t.total_pcs), 0) AS pcs, COUNT(*) AS notes
       FROM tr_transaction t
       WHERE t.order_date >= ? AND t.order_date < DATE_ADD(?, INTERVAL 1 DAY) AND t.is_delete_requested = 0${oc}`,
      [start, end < today ? end : today, ...oparam]
    );
    const elapsedDays = Math.max(1, dayDiff(end < today ? end : today, start) + 1);

    // ── 4c. Belum settle: penjualan QRIS/EDC yang belum ada laporan cairnya ─
    const unsettled = [];
    for (const o of scope) {
      for (let d = addDays(today, -14); d <= yesterday; d = addDays(d, 1)) {
        const a = act.get(`${o.id}|${d}`);
        if (!a || beforeStart(starts, o.id, d)) continue;
        if (dailyBy.get(`${o.id}|${d}`)?.status === "APPROVED") continue;
        for (const [method, amount] of [["QRIS", a.qris], ["EDC", a.edc]]) {
          if (amount > 0 && !settled.has(`${o.id}|${method}|${d}`)) {
            unsettled.push({ outlet: o.name, method, date: d, age: dayDiff(today, d), amount });
          }
        }
      }
    }
    unsettled.sort((a, b) => b.age - a.age || b.amount - a.amount);
    const worst = unsettled[0] || null;

    // ── 5. Grid rekonsiliasi 8 hari terakhir (s/d kemarin) ───────────────
    const gridDays = Array.from({ length: 8 }, (_, i) => addDays(yesterday, -(7 - i)));
    const grid = scope.map((o) => ({
      outlet_id: o.id,
      outlet_name: o.name,
      days: gridDays.map((d) => {
        const rec = dailyBy.get(`${o.id}|${d}`);
        let status = "KOSONG";
        if (rec?.status === "APPROVED") status = Math.abs(rec.diff) > 1 ? "SELISIH" : "COCOK";
        else if (hasActivity(o.id, d)) status = "BELUM";
        return { date: d, status };
      }),
    }));

    // ── 6. Perlu tindakan ────────────────────────────────────────────────
    const actions = [];
    for (const o of scope) {
      for (let d = addDays(today, -14); d <= yesterday; d = addDays(d, 1)) {
        if (!hasActivity(o.id, d)) continue;
        const k = `${o.id}|${d}`;
        const age = dayDiff(today, d);
        const a = act.get(k);
        const locked = dailyBy.get(k)?.status === "APPROVED";
        if (!posted.has(k)) {
          actions.push({ type: "POS", severity: age >= 3 ? 3 : 2, age, text: `${o.name}: penjualan ${ddmm(d)} belum diposting ke jurnal`, link: "/finance-ho/integrasi-pos" });
        } else if (!locked && age >= 2) {
          actions.push({ type: "REKON", severity: age >= 4 ? 3 : 1, age, text: `${o.name}: rekonsiliasi ${ddmm(d)} belum dikunci`, link: "/finance-ho/rekonsiliasi" });
        }
        if (!locked && age >= 2) {
          if (a.qris > 0 && !settled.has(`${o.id}|QRIS|${d}`)) actions.push({ type: "QRIS", severity: 3, age, text: `QRIS ${o.name} ${ddmm(d)} belum cair ${age} hari`, link: "/finance-ho/rekonsiliasi" });
          if (a.edc > 0 && !settled.has(`${o.id}|EDC|${d}`)) actions.push({ type: "EDC", severity: 3, age, text: `EDC ${o.name} ${ddmm(d)} belum cair ${age} hari`, link: "/finance-ho/rekonsiliasi" });
          if (a.cash > 0 && !deposited.has(k)) actions.push({ type: "SETOR", severity: 2, age, text: `Setoran tunai ${o.name} ${ddmm(d)} belum dicatat`, link: "/finance-ho/rekonsiliasi" });
        }
      }
    }
    // Batch POS gagal validasi & data POS berubah setelah diposting (dari catatan penarikan data)
    const [syncRows] = await pool.query(
      `SELECT s.outlet_id, DATE_FORMAT(s.sync_date,'%Y-%m-%d') AS d, s.status, s.revenue, s.payments,
              b.revenue AS b_revenue, b.payments AS b_payments, je.status AS j_status
       FROM tr_pos_sync_log s
       LEFT JOIN tr_pos_batch b ON b.outlet_id = s.outlet_id AND b.batch_date = s.sync_date
       LEFT JOIN tr_journal_entries je ON je.id = b.journal_id
       WHERE s.sync_date BETWEEN ? AND ?`,
      [addDays(today, -14), today]
    ).catch(() => [[]]);
    for (const r of syncRows) {
      const o = scope.find((x) => x.id === Number(r.outlet_id));
      if (!o) continue;
      const age = dayDiff(today, r.d);
      const posted = r.j_status === "POSTED";
      if (!posted && r.status === "GAGAL") {
        actions.push({ type: "GAGAL", severity: 3, age, text: `Batch POS ${o.name} ${ddmm(r.d)} gagal validasi`, link: `/finance-ho/integrasi-pos?date=${r.d}&outlet=${o.id}` });
      } else if (posted && (Math.abs(Number(r.revenue) - Number(r.b_revenue)) > 0.5 || Math.abs(Number(r.payments) - Number(r.b_payments)) > 0.5)) {
        actions.push({ type: "BERUBAH", severity: 3, age, text: `Data POS ${o.name} ${ddmm(r.d)} berubah setelah diposting`, link: `/finance-ho/integrasi-pos?date=${r.d}&outlet=${o.id}` });
      }
    }
    actions.sort((a, b) => b.severity - a.severity || b.age - a.age);

    // ── 7. Aging piutang ritel (nota belum lunas) ────────────────────────
    const aging = await computeAging(outletId, today, 5, parseUnit(req.query));

    return res.json({
      data: {
        period: { start_date: start, end_date: end, outlet_id: outletId },
        kpis: {
          cash_diff_total: toFixed2(cashDiffTotal),
          cash_diff_days: cashDiffDays,
          active_days: activeDays,
          cocok_days: cocokDays,
          mdr_expense: toFixed2(mdrRow.amount),
          volume_kg: toFixed2(vol.kg),
          volume_kg_per_day: toFixed2(Number(vol.kg) / elapsedDays),
          volume_pcs: Number(vol.pcs),
          volume_notes: Number(vol.notes),
          unsettled: {
            count: unsettled.length,
            amount: toFixed2(unsettled.reduce((s, u) => s + u.amount, 0)),
            oldest_days: worst?.age || 0,
            worst: worst ? `${worst.method} ${worst.outlet}` : null,
          },
        },
        reconciliation_grid: grid,
        actions: { total: actions.length, items: actions.slice(0, 10) },
        aging,
      },
    });
  } catch (err) {
    console.error("[getDashboardOverview] Error:", err);
    return res.status(500).json({ message: "Gagal memuat ringkasan dashboard", error: err.message });
  }
}
