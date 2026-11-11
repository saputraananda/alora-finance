import { mainPool, pool as alfiPool } from '../../db/pool.js';
import { isFinance, loadMe, financeGateOn } from '../../utils/pengajuanAccess.js';

// ════════════════════════════════════════════════════════════════════════════
// PEMBELIAN › PENGAJUAN  (baca saja — data milik SuperApp, database utama)
//
// File ini baca saja. Aksi tulis (approve/tolak/bayar) ada di pengajuanActions.controller.js.
//
// Status: 1 Diajukan · 2 Disetujui SPV · 3 Disetujui Direktur · 4 Disetujui GA ·
//         5 Disetujui SPV Finance (menunggu bayar) · 6 Terbayar · 7 Selesai · 9 Ditolak
// ════════════════════════════════════════════════════════════════════════════

const q = async (sql, params = []) => (await mainPool.query(sql, params))[0];

// Antrean Finance: pengajuan biasa status 4, reimburse status 2 (sama dengan SuperApp).
const COND_ANTREAN = `((pr.type = 'pengajuan' AND pr.status = 4) OR (pr.type = 'reimburse' AND pr.status = 2))`;
const COND_BAYAR = `pr.status = 5`;
const COND_KREDIT = `pr.payment_method = 'kredit' AND pr.status >= 6 AND pr.status != 9`;

const AMOUNT_SQL = `COALESCE(NULLIF(pr.nominal_bayar, 0), pr.estimasi_harga * pr.qty, 0)`;

const OUTLET_SQL = `COALESCE((SELECT GROUP_CONCAT(DISTINCT mo.full_name ORDER BY mo.full_name SEPARATOR ', ')
                      FROM tr_purchase_request_scope prs
                      JOIN mst_outlet mo ON mo.id = prs.outlet_id
                      WHERE prs.pr_id = pr.pr_id), o.full_name)`;

const CLASS_SQL = `(SELECT GROUP_CONCAT(mc.classification_name ORDER BY mc.classification_name SEPARATOR ', ')
                    FROM tr_purchase_request_classification prc
                    JOIN mst_purchase_classification mc ON mc.id = prc.classification_id
                    WHERE prc.pr_id = pr.pr_id)`;

const PAID_SQL = `COALESCE((SELECT SUM(p.nominal_bayar) FROM tr_purchase_request_payment p WHERE p.pr_id = pr.pr_id), 0)`;

const FROM_SQL = `
  FROM tr_purchase_request pr
  LEFT JOIN mst_employee   e ON e.employee_id   = pr.employee_id
  LEFT JOIN mst_department d ON d.department_id = pr.department_id
  LEFT JOIN mst_outlet     o ON o.id            = pr.outlet_id`;

const SELECT_SQL = `
  SELECT pr.pr_id, pr.pr_code, pr.type, pr.status, pr.nama_barang, pr.qty, pr.tanggal_pengajuan,
         pr.payment_method, pr.jatuh_tempo, pr.paid_at,
         ${AMOUNT_SQL} AS amount,
         e.full_name AS pengaju_name, d.department_name,
         ${OUTLET_SQL} AS outlet_name,
         ${CLASS_SQL} AS classification_name,
         ${PAID_SQL} AS total_paid`;

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

function buildFilters(req, tabCondition) {
  const conditions = ['pr.is_deleted = 0'];
  const params = [];
  if (tabCondition) conditions.push(tabCondition);

  const search = String(req.query.search || '').trim();
  if (search) {
    conditions.push('(pr.nama_barang LIKE ? OR pr.pr_code LIKE ? OR e.full_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const type = String(req.query.type || '').trim();
  if (type === 'pengajuan' || type === 'reimburse') {
    conditions.push('pr.type = ?');
    params.push(type);
  }
  const status = Number(req.query.status);
  if (req.query.status && Number.isInteger(status)) {
    conditions.push('pr.status = ?');
    params.push(status);
  }
  const method = String(req.query.payment_method || '').trim();
  if (method === 'cash' || method === 'kredit') {
    conditions.push('pr.payment_method = ?');
    params.push(method);
  }
  const companyId = Number(req.query.company_id);
  if (req.query.company_id && Number.isInteger(companyId)) {
    // Sama seperti SuperApp: cocokkan kolom company_id ATAU salah satu baris scope (multi-kategori)
    conditions.push(`(pr.company_id = ? OR EXISTS (SELECT 1 FROM tr_purchase_request_scope prs WHERE prs.pr_id = pr.pr_id AND prs.company_id = ?))`);
    params.push(companyId, companyId);
  }
  const deptId = Number(req.query.department_id);
  if (req.query.department_id && Number.isInteger(deptId)) {
    conditions.push('pr.department_id = ?');
    params.push(deptId);
  }
  if (isDate(req.query.date_from)) {
    conditions.push('pr.tanggal_pengajuan >= ?');
    params.push(req.query.date_from);
  }
  if (isDate(req.query.date_to)) {
    conditions.push('pr.tanggal_pengajuan <= ?');
    params.push(req.query.date_to);
  }
  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

// GET /purchasing/me
export async function getMe(req, res) {
  try {
    const me = await loadMe(req);
    const gateOn = financeGateOn();
    if (!me) {
      // Tanpa data karyawan: boleh melihat bila pembatasan mati, tetapi aksi tulis butuh data karyawan
      return res.json({ employee_id: null, name: req.user?.fullName || null, position: req.user?.position || null, job_level_id: null, is_finance: !gateOn, can_approve_finance: false, gate_on: gateOn });
    }
    const finance = isFinance(me.position_name);
    res.json({
      employee_id: me.employee_id,
      name: me.full_name,
      position: me.position_name,
      job_level_id: me.job_level_id,
      is_finance: finance || !gateOn,
      gate_on: gateOn,
      // Keputusan: siapa pun Finance yang login ke alfi boleh approve (syarat job level SPV SuperApp tidak dipakai)
      can_approve_finance: finance || !gateOn,
    });
  } catch (err) {
    console.error('[purchasing.getMe]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat data pengguna.' });
  }
}

// GET /purchasing/summary — angka untuk badge & kartu ringkasan
export async function getSummary(req, res) {
  try {
    const f = buildFilters({ query: { date_from: req.query.date_from, date_to: req.query.date_to } }, null);
    const [row] = await q(
      `SELECT
         SUM(CASE WHEN ${COND_ANTREAN} THEN 1 ELSE 0 END) AS antrean_count,
         SUM(CASE WHEN ${COND_ANTREAN} THEN ${AMOUNT_SQL} ELSE 0 END) AS antrean_amount,
         SUM(CASE WHEN ${COND_BAYAR} THEN 1 ELSE 0 END) AS bayar_count,
         SUM(CASE WHEN ${COND_BAYAR} THEN ${AMOUNT_SQL} ELSE 0 END) AS bayar_amount,
         SUM(CASE WHEN pr.status = 6 THEN 1 ELSE 0 END) AS terbayar_count,
         SUM(CASE WHEN pr.status = 9 THEN 1 ELSE 0 END) AS ditolak_count,
         COUNT(*) AS total_count
       ${FROM_SQL} ${f.where}`,
      f.params
    );
    const kredit = await q(
      `SELECT pr.pr_id, ${AMOUNT_SQL} AS target, ${PAID_SQL} AS paid ${FROM_SQL}
       ${buildFilters({ query: {} }, COND_KREDIT).where}`
    );
    let kreditOpen = 0;
    let kreditSisa = 0;
    for (const k of kredit) {
      const sisa = Math.max(0, Number(k.target) - Number(k.paid));
      if (sisa > 0) {
        kreditOpen += 1;
        kreditSisa += sisa;
      }
    }
    const n = (v) => Number(v) || 0;
    res.json({
      antrean: { count: n(row.antrean_count), amount: n(row.antrean_amount) },
      bayar: { count: n(row.bayar_count), amount: n(row.bayar_amount) },
      terbayar_count: n(row.terbayar_count),
      ditolak_count: n(row.ditolak_count),
      total_count: n(row.total_count),
      kredit: { open: kreditOpen, sisa: kreditSisa },
    });
  } catch (err) {
    console.error('[purchasing.getSummary]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat ringkasan pengajuan.' });
  }
}

// GET /purchasing/requests?tab=semua|antrean|bayar&...
export async function listRequests(req, res) {
  try {
    const tab = String(req.query.tab || 'semua');
    const tabCond = tab === 'antrean' ? COND_ANTREAN : tab === 'bayar' ? COND_BAYAR : null;
    const f = buildFilters(req, tabCond);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const all = String(req.query.limit || '').toLowerCase() === 'all';
    const limit = all ? 100000 : Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const [{ total }] = await q(`SELECT COUNT(*) AS total ${FROM_SQL} ${f.where}`, f.params);
    const order = tab === 'semua' ? 'pr.created_at DESC' : 'pr.created_at ASC';
    const data = await q(
      `${SELECT_SQL} ${FROM_SQL} ${f.where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...f.params, limit, (page - 1) * limit]
    );
    res.json({ data, total: Number(total), page, limit });
  } catch (err) {
    console.error('[purchasing.listRequests]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar pengajuan.' });
  }
}

// GET /purchasing/credit?status=unpaid|paid
export async function listCredit(req, res) {
  try {
    const f = buildFilters(req, COND_KREDIT);
    const rows = await q(`${SELECT_SQL} ${FROM_SQL} ${f.where} ORDER BY pr.created_at DESC`, f.params);
    const enriched = rows.map((r) => {
      const target = Number(r.amount) || 0;
      const paid = Number(r.total_paid) || 0;
      const sisa = Math.max(0, target - paid);
      return { ...r, amount: target, total_paid: paid, sisa, is_lunas: sisa <= 0 && (target > 0 || paid > 0) };
    });
    const filter = String(req.query.paid || '');
    const data = filter === 'unpaid' ? enriched.filter((r) => !r.is_lunas)
      : filter === 'paid' ? enriched.filter((r) => r.is_lunas)
      : enriched;
    const sum = (key) => enriched.reduce((s, r) => s + (Number(r[key]) || 0), 0);
    res.json({
      data,
      total: data.length,
      summary: {
        target: sum('amount'),
        paid: sum('total_paid'),
        sisa: sum('sisa'),
        count_all: enriched.length,
        count_unpaid: enriched.filter((r) => !r.is_lunas).length,
        count_paid: enriched.filter((r) => r.is_lunas).length,
      },
    });
  } catch (err) {
    console.error('[purchasing.listCredit]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat data kredit.' });
  }
}

// GET /purchasing/requests/:id
export async function getRequest(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid.' });

    const [pr] = await q(
      `SELECT pr.*, e.full_name AS pengaju_name, d.department_name, s.satuan_name,
              bnk.bank_name, ${OUTLET_SQL} AS outlet_name, ${AMOUNT_SQL} AS amount
       FROM tr_purchase_request pr
       LEFT JOIN mst_employee   e   ON e.employee_id   = pr.employee_id
       LEFT JOIN mst_department d   ON d.department_id = pr.department_id
       LEFT JOIN mst_satuan     s   ON s.satuan_id     = pr.satuan_id
       LEFT JOIN mst_outlet     o   ON o.id            = pr.outlet_id
       LEFT JOIN mst_bank       bnk ON bnk.bank_id     = pr.bank_id
       WHERE pr.pr_id = ? AND pr.is_deleted = 0`,
      [id]
    );
    if (!pr) return res.status(404).json({ success: false, message: 'Pengajuan tidak ditemukan.' });

    const [attachments, logs, classifications, allocations, payments, scope] = await Promise.all([
      q(`SELECT attachment_id, file_path, original_name, mime_type, file_size_kb
         FROM tr_purchase_request_attachment WHERE pr_id = ? ORDER BY uploaded_at ASC`, [id]),
      q(`SELECT action, by_name, note, logged_at
         FROM tr_purchase_request_log WHERE pr_id = ? ORDER BY logged_at ASC`, [id]),
      q(`SELECT c.id, c.classification_name, prc.nominal
         FROM tr_purchase_request_classification prc
         JOIN mst_purchase_classification c ON c.id = prc.classification_id
         WHERE prc.pr_id = ? ORDER BY c.classification_name`, [id]),
      q(`SELECT c.classification_name, a.outlet_id, o.full_name AS outlet_name, a.nominal
         FROM tr_purchase_request_allocation a
         JOIN mst_purchase_classification c ON c.id = a.classification_id
         LEFT JOIN mst_outlet o ON o.id = a.outlet_id
         WHERE a.pr_id = ? ORDER BY c.classification_name, o.full_name`, [id]),
      q(`SELECT nominal_bayar, proof_path, note, paid_by_name, paid_at
         FROM tr_purchase_request_payment WHERE pr_id = ? ORDER BY paid_at ASC, payment_id ASC`, [id]),
      q(`SELECT prs.company_id, c.company_name, prs.outlet_id, o.full_name AS outlet_name
         FROM tr_purchase_request_scope prs
         LEFT JOIN mst_company c ON c.company_id = prs.company_id
         LEFT JOIN mst_outlet o ON o.id = prs.outlet_id
         WHERE prs.pr_id = ? ORDER BY c.company_name, o.full_name`, [id]),
    ]);
    const [journals] = await alfiPool.query(
      `SELECT pj.event_type, pj.amount, pj.journal_id, e.entry_no FROM tr_purchase_journal pj
       LEFT JOIN tr_journal_entries e ON e.id = pj.journal_id WHERE pj.pr_id = ?`,
      [id]
    );

    const totalPaid = payments.reduce((s, p) => s + (Number(p.nominal_bayar) || 0), 0);
    res.json({ data: pr, attachments, logs, classifications, allocations, payments, scope, journals, total_paid: totalPaid });
  } catch (err) {
    console.error('[purchasing.getRequest]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat detail pengajuan.' });
  }
}

// GET /purchasing/classifications — klasifikasi (SuperApp) + akun yang sudah dipetakan (alfi)
export async function listClassifications(req, res) {
  try {
    const data = await q(
      `SELECT c.id, c.classification_name, c.is_active,
              (SELECT COUNT(*) FROM tr_purchase_request_classification prc WHERE prc.classification_id = c.id) AS usage_count
       FROM mst_purchase_classification c
       ORDER BY c.is_active DESC, c.classification_name`
    );
    const [maps] = await alfiPool.query(
      `SELECT m.classification_id, m.account_id, a.code, a.name
       FROM mst_purchase_class_account m LEFT JOIN mst_coa a ON a.id = m.account_id`
    );
    const byId = new Map(maps.map((m) => [Number(m.classification_id), m]));
    const [accounts] = await alfiPool.query(
      `SELECT id, code, name, type FROM mst_coa
       WHERE is_active = 1 AND is_header = 0 AND type IN ('BEBAN','ASET')
       ORDER BY code`
    );
    res.json({
      data: data.map((r) => {
        const m = byId.get(Number(r.id));
        return { ...r, account_id: m?.account_id ?? null, account_code: m?.code ?? null, account_name: m?.name ?? null };
      }),
      accounts,
    });
  } catch (err) {
    console.error('[purchasing.listClassifications]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat klasifikasi.' });
  }
}

// PUT /purchasing/classifications/:id/account   body: { account_id | null }
export async function saveClassificationAccount(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
    const [cls] = await q(`SELECT id, classification_name FROM mst_purchase_classification WHERE id = ?`, [id]);
    if (!cls) return res.status(404).json({ success: false, message: 'Klasifikasi tidak ditemukan.' });

    const accountId = req.body?.account_id ? Number(req.body.account_id) : null;
    if (accountId) {
      const [[acc]] = await alfiPool.query(
        `SELECT id FROM mst_coa WHERE id = ? AND is_active = 1 AND is_header = 0 AND type IN ('BEBAN','ASET')`,
        [accountId]
      );
      if (!acc) return res.status(400).json({ success: false, message: 'Akun tidak valid (harus akun beban atau aset yang aktif).' });
    }
    const me = await loadMe(req);
    await alfiPool.query(
      `INSERT INTO mst_purchase_class_account (classification_id, classification_name, account_id, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE classification_name = VALUES(classification_name), account_id = VALUES(account_id), updated_by = VALUES(updated_by)`,
      [id, cls.classification_name, accountId, me?.employee_id ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[purchasing.saveClassificationAccount]', err);
    res.status(500).json({ success: false, message: 'Gagal menyimpan pemetaan akun.' });
  }
}

// GET /purchasing/companies — untuk filter Kategori
export async function listCompanies(req, res) {
  try {
    const data = await q(`SELECT company_id, company_name FROM mst_company WHERE is_active = 1 ORDER BY company_name`);
    res.json({ data });
  } catch (err) {
    console.error('[purchasing.listCompanies]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat kategori.' });
  }
}

// GET /purchasing/departments — untuk filter Departemen
export async function listDepartments(req, res) {
  try {
    const data = await q(`SELECT department_id, department_name FROM mst_department ORDER BY department_name`);
    res.json({ data });
  } catch (err) {
    console.error('[purchasing.listDepartments]', err);
    res.status(500).json({ success: false, message: 'Gagal memuat departemen.' });
  }
}
