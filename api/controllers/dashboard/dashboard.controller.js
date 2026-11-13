import { pool } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { parseUnit, unitShare } from "../../utils/unit.js";

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD HO FINANCE
// ════════════════════════════════════════════════════════════════════════════

// ── Periode cutoff Waschen: 26 bulan sebelumnya → 25 bulan berjalan ─────
const pad2 = (n) => String(n).padStart(2, "0");

export function cutoffRange(year, month) {
    const sy = month === 1 ? year - 1 : year;
    const sm = month === 1 ? 12 : month - 1;
    return { start: `${sy}-${pad2(sm)}-26`, end: `${year}-${pad2(month)}-25` };
}

export function shiftMonth(year, month, delta) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    return [d.getUTCFullYear(), d.getUTCMonth() + 1];
}

// Hari ini (WIB) → periode cutoff yang sedang berjalan
export function currentCutoffMonth() {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()).split("-").map(Number);
    const [yy, mm] = d >= 26 ? shiftMonth(y, m, 1) : [y, m];
    return { year: yy, month: mm };
}

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const addDays = (s, n) => {
    const d = new Date(`${s}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/**
 * Rentang tanggal dashboard dari query `from`/`to` (YYYY-MM-DD).
 * Tanpa itu: periode cutoff dari `year`/`month`, atau periode yang sedang berjalan.
 * `cutoff` terisi bila rentangnya persis satu periode cutoff (dipakai untuk anggaran & pembanding).
 */
export function resolveRange(query = {}) {
    let from;
    let to;
    if (isDate(query.from) && isDate(query.to) && query.from <= query.to) {
        from = query.from;
        to = query.to;
    } else {
        const cur = currentCutoffMonth();
        const r = cutoffRange(parseInt(query.year, 10) || cur.year, parseInt(query.month, 10) || cur.month);
        from = r.start;
        to = r.end;
    }
    let cutoff = null;
    if (to.slice(8, 10) === "25") {
        const y = Number(to.slice(0, 4));
        const m = Number(to.slice(5, 7));
        const r = cutoffRange(y, m);
        if (r.start === from && r.end === to) cutoff = { year: y, month: m };
    }
    return { from, to, cutoff };
}

// Periode pembanding: periode cutoff sebelumnya, atau rentang sama panjang tepat sebelum `from`
export function previousRange({ from, to, cutoff }) {
    if (cutoff) {
        const [py, pm] = shiftMonth(cutoff.year, cutoff.month, -1);
        const r = cutoffRange(py, pm);
        return { from: r.start, to: r.end };
    }
    const n = dayDiff(to, from) + 1;
    const pTo = addDays(from, -1);
    return { from: addDays(pTo, -(n - 1)), to: pTo };
}

// Pendapatan & beban dari jurnal yang sudah diposting (opsional per cabang)
async function sumProfitLoss(from, to, outletId) {
    const [[row]] = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN a.type = 'PENDAPATAN' THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN a.type = 'BEBAN' THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense
         FROM tr_journal_lines jl
         JOIN tr_journal_entries je ON je.id = jl.entry_id
         JOIN mst_coa a ON a.id = jl.account_id
         WHERE je.status IN ('POSTED','REVERSED') AND a.type IN ('PENDAPATAN','BEBAN')
           AND je.entry_date BETWEEN ? AND ?${outletId ? " AND jl.outlet_id = ?" : ""}`,
        outletId ? [from, to, outletId] : [from, to]
    );
    return { revenue: toFixed2(row.revenue), expense: toFixed2(row.expense) };
}

/**
 * GET /api/finance-ho/dashboard?from&to&outlet
 * Angka keuangan dari jurnal untuk widget Laba/Rugi, Beban Perusahaan, dan Jurnal Terkini.
 * Dengan ?unit=waschen|cleanox angkanya dialokasikan menurut porsi unit (lihat utils/unit.js).
 */
export async function getFinanceDashboard(req, res) {
    try {
        const range = resolveRange(req.query);
        const prev = previousRange(range);
        const outletId = req.query.outlet ? Number(req.query.outlet) : null;
        const oc = outletId ? " AND jl.outlet_id = ?" : "";
        const op = outletId ? [outletId] : [];

        // Filter unit: jurnal belum punya dimensi unit, jadi pendapatan & beban dialokasikan
        // sesuai porsi unit itu dari penjualan POS pada rentang yang sama (cara sama dengan alokasi biaya pusat).
        const unit = parseUnit(req.query);
        const share = await unitShare(unit, range.from, range.to, outletId);
        const prevShare = await unitShare(unit, prev.from, prev.to, outletId);
        const scale = (p, s) => ({ revenue: toFixed2(p.revenue * s), expense: toFixed2(p.expense * s) });
        const cur = scale(await sumProfitLoss(range.from, range.to, outletId), share);
        const old = scale(await sumProfitLoss(prev.from, prev.to, outletId), prevShare);
        const netProfit = toFixed2(cur.revenue - cur.expense);
        const prevProfit = toFixed2(old.revenue - old.expense);

        // Beban per akun → 5 terbesar + sisanya ("Lainnya") dengan rincian 3 akun teratasnya
        const [expRows] = await pool.query(
            `SELECT a.code AS account_code, a.name AS account_name, COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
             FROM tr_journal_lines jl
             JOIN tr_journal_entries je ON je.id = jl.entry_id
             JOIN mst_coa a ON a.id = jl.account_id
             WHERE je.status IN ('POSTED','REVERSED') AND a.type = 'BEBAN'
               AND je.entry_date BETWEEN ? AND ?${oc}
             GROUP BY a.id, a.code, a.name
             HAVING amount > 0
             ORDER BY amount DESC`,
            [range.from, range.to, ...op]
        );
        const accounts = expRows.map((r) => ({ account_code: r.account_code, name: r.account_name, amount: toFixed2(r.amount * share) }));
        const top = accounts.slice(0, 5);
        const rest = accounts.slice(5);

        // Anggaran beban hanya bermakna untuk satu periode cutoff penuh, dan anggaran belum dipisah per unit
        let budget = null;
        if (range.cutoff && unit === "all") {
            const [[b]] = await pool.query(
                `SELECT COALESCE(SUM(b.amount), 0) AS total FROM tr_budgets b JOIN mst_coa a ON a.id = b.account_id
                 WHERE a.type = 'BEBAN' AND b.period = ?`,
                [`${range.cutoff.year}-${pad2(range.cutoff.month)}-01`]
            );
            const total = toFixed2(b.total);
            if (total > 0) budget = { total, used_percent: toFixed2((cur.expense / total) * 100) };
        }

        const [recentJournals] = await pool.query(
            `SELECT je.id, je.entry_no, DATE_FORMAT(je.entry_date, '%Y-%m-%d') AS entry_date, je.description,
                    je.total_amount, je.status, COUNT(jl.id) AS total_lines
             FROM tr_journal_entries je
             LEFT JOIN tr_journal_lines jl ON jl.entry_id = je.id
             WHERE je.status IN ('POSTED','REVERSED')
             GROUP BY je.id
             ORDER BY je.entry_date DESC, je.id DESC
             LIMIT 5`
        );

        return res.json({
            data: {
                period: { from: range.from, to: range.to, prev_from: prev.from, prev_to: prev.to, is_cutoff: Boolean(range.cutoff), outlet_id: outletId },
                unit: unit === "all" ? null : { key: unit, share: toFixed2(share * 100) }, // porsi pendapatan POS (%)
                kpis: {
                    revenue: cur.revenue,
                    expense: cur.expense,
                    net_profit: netProfit,
                    net_margin: cur.revenue > 0 ? toFixed2((netProfit / cur.revenue) * 100) : 0,
                    prev_profit: prevProfit,
                    // perubahan laba terhadap periode pembanding; kosong bila pembanding 0
                    profit_change_percent: prevProfit !== 0 ? toFixed2(((netProfit - prevProfit) / Math.abs(prevProfit)) * 100) : null,
                },
                budget,
                expense_breakdown: {
                    total: cur.expense,
                    top,
                    other: {
                        amount: toFixed2(rest.reduce((s, r) => s + r.amount, 0)),
                        items: rest.slice(0, 3),
                    },
                },
                recent_journals: recentJournals.map((j) => ({ ...j, total_amount: toFixed2(j.total_amount) })),
            },
        });
    } catch (err) {
        console.error("[getFinanceDashboard] Error:", err);
        return res.status(500).json({ message: "Gagal mengambil data dashboard keuangan", error: err.message });
    }
}
