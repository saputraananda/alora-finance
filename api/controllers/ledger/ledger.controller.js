
import { pool } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";

// ════════════════════════════════════════════════════════════════════════════
// BUKU BESAR / GENERAL LEDGER
// ════════════════════════════════════════════════════════════════════════════


/**
 * GET /api/finance-ho/general-ledger
 * Mengambil buku besar per akun finansial dengan saldo awal, mutasi, dan saldo berjalan
 */
export async function getGeneralLedger(req, res) {
    try {
        const { account_id, from, to, outlet } = req.query;
        // Filter cabang: id cabang, atau PUSAT untuk baris tanpa cabang
        const oc = outlet === "PUSAT" ? " AND jl.outlet_id IS NULL" : outlet ? " AND jl.outlet_id = ?" : "";
        const op = outlet && outlet !== "PUSAT" ? [Number(outlet)] : [];

        if (!account_id) {
            return res.status(400).json({ message: "Pilih akun finansial terlebih dahulu." });
        }

        // 1. Ambil info akun
        const [accRows] = await pool.query(
            `SELECT id, code, name, type, normal_balance, is_header, is_active, memo
       FROM mst_coa WHERE id = ?`,
            [account_id]
        );

        if (accRows.length === 0) {
            return res.status(404).json({ message: "Akun finansial tidak ditemukan." });
        }

        const account = accRows[0];
        const normal = account.normal_balance; // 'DEBIT' atau 'KREDIT'

        // Range tanggal
        const fromDate = from || "1970-01-01";
        const toDate = to || new Date().toISOString().split("T")[0];

        // 2. Hitung Saldo Awal (Mutasi sebelum tanggal 'from' yang POSTED)
        const [priorRows] = await pool.query(
            `SELECT 
         COALESCE(SUM(jl.debit), 0) AS total_debit_prior,
         COALESCE(SUM(jl.credit), 0) AS total_credit_prior
       FROM tr_journal_lines jl
       JOIN tr_journal_entries je ON jl.entry_id = je.id
       WHERE jl.account_id = ?
         AND je.status IN ('POSTED','REVERSED')
         AND je.entry_date < ?${oc}`,
            [account_id, fromDate, ...op]
        );

        const debitPrior = Number(priorRows[0].total_debit_prior) || 0;
        const creditPrior = Number(priorRows[0].total_credit_prior) || 0;

        let beginningBalance = 0;
        if (normal === "DEBIT") {
            beginningBalance = toFixed2(debitPrior - creditPrior);
        } else {
            beginningBalance = toFixed2(creditPrior - debitPrior);
        }

        // 3. Ambil Mutasi pada Rentang Periode 'from' sampai 'to'
        const [mutationRows] = await pool.query(
            `SELECT 
         je.id AS entry_id,
         je.entry_no,
         DATE_FORMAT(je.entry_date, '%Y-%m-%d') AS entry_date,
         je.description AS journal_description,
         jl.id AS line_id,
         jl.line_no,
         jl.debit,
         jl.credit,
         jl.memo,
         jl.outlet_id,
         je.source_type
       FROM tr_journal_lines jl
       JOIN tr_journal_entries je ON jl.entry_id = je.id
       WHERE jl.account_id = ?
         AND je.status IN ('POSTED','REVERSED')
         AND je.entry_date >= ?
         AND je.entry_date <= ?${oc}
       ORDER BY je.entry_date ASC, je.id ASC, jl.line_no ASC`,
            [account_id, fromDate, toDate, ...op]
        );

        // 4. Hitung Saldo Berjalan (Running Balance)
        let runningBalance = beginningBalance;
        let periodDebit = 0;
        let periodCredit = 0;

        const mutations = mutationRows.map((m) => {
            const d = Number(m.debit) || 0;
            const c = Number(m.credit) || 0;
            periodDebit += d;
            periodCredit += c;

            if (normal === "DEBIT") {
                runningBalance = toFixed2(runningBalance + d - c);
            } else {
                runningBalance = toFixed2(runningBalance + c - d);
            }

            return {
                ...m,
                debit: d,
                credit: c,
                running_balance: runningBalance,
            };
        });

        periodDebit = toFixed2(periodDebit);
        periodCredit = toFixed2(periodCredit);
        const endingBalance = runningBalance;
        const netChange = normal === "DEBIT" ? toFixed2(periodDebit - periodCredit) : toFixed2(periodCredit - periodDebit);

        return res.json({
            data: {
                account,
                period: {
                    from: fromDate,
                    to: toDate,
                    outlet: outlet || null,
                },
                summary: {
                    beginning_balance: beginningBalance,
                    period_debit: periodDebit,
                    period_credit: periodCredit,
                    net_change: netChange,
                    ending_balance: endingBalance,
                },
                mutations,
            },
        });
    } catch (err) {
        console.error("[getGeneralLedger] Error:", err);
        return res.status(500).json({ message: "Gagal mengambil data buku besar", error: err.message });
    }
}