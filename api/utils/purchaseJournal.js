import { mainPool, pool as alfiPool } from '../db/pool.js';
import { dayLockMessage } from './dayLock.js';

// ════════════════════════════════════════════════════════════════════════════
// JURNAL OTOMATIS PENGAJUAN (pembayaran yang dicatat Finance)
//
//   Tunai : Dr Akun klasifikasi (beban/aset)   Cr Bank
//   Kredit: Dr Akun klasifikasi (beban/aset)   Cr Utang Usaha
//   Biaya admin (bila ada): Dr Beban Administrasi Bank   Cr Bank
//
// Aturan sementara (menunggu validasi finance — lihat daftar validasi):
//   • Hanya perusahaan yang dibukukan di alfi: Waschen Laundry (5) & PT Waschen Alora (1).
//   • Sumber dana tunai memakai peran akun BANK (SuperApp tidak mencatat kas/bank).
//   • Klasifikasi yang belum dipetakan ke akun → tidak dijurnal, status BELUM_DIPETAKAN.
//   • Satu kejadian = satu jurnal (tr_purchase_journal, unik per pr_id + jenis + payment_id).
// ════════════════════════════════════════════════════════════════════════════

export const JOURNAL_COMPANY_IDS = [1, 5];
const UTANG_USAHA_CODE = '2-1001';
const fx = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

export async function postPurchaseJournal(prId, actorId = null) {
  const [[pr]] = await mainPool.query(
    `SELECT pr_id, pr_code, nama_barang, type, status, payment_method, nominal_bayar, admin_fee,
            company_id, outlet_id, DATE_FORMAT(paid_at, '%Y-%m-%d') AS paid_date
     FROM tr_purchase_request WHERE pr_id = ? AND is_deleted = 0`,
    [prId]
  );
  if (!pr) return { status: 'TIDAK_ADA', message: 'Pengajuan tidak ditemukan.' };
  if (![6, 7].includes(Number(pr.status))) return { status: 'BELUM_DIBAYAR', message: 'Pengajuan belum dibayar.' };

  const [[done]] = await alfiPool.query(
    `SELECT pj.journal_id, e.entry_no FROM tr_purchase_journal pj
     LEFT JOIN tr_journal_entries e ON e.id = pj.journal_id
     WHERE pj.pr_id = ? AND pj.event_type = 'BAYAR' AND pj.payment_id = 0`,
    [prId]
  ).then(([r]) => [r]);
  if (done) return { status: 'SUDAH', journal_id: done.journal_id, entry_no: done.entry_no, message: 'Sudah dijurnal.' };

  const total = Number(pr.nominal_bayar) || 0;
  if (total <= 0) return { status: 'TANPA_NOMINAL', message: 'Nominal bayar belum terisi — belum bisa dijurnal.' };
  if (!pr.paid_date) return { status: 'TANPA_TANGGAL', message: 'Tanggal bayar belum terisi.' };

  // Baris biaya: alokasi (klasifikasi × perusahaan × outlet); cadangan: klasifikasi saja
  let [rows] = await mainPool.query(
    `SELECT a.classification_id, c.classification_name, a.company_id, a.outlet_id, a.nominal
     FROM tr_purchase_request_allocation a
     JOIN mst_purchase_classification c ON c.id = a.classification_id
     WHERE a.pr_id = ?`,
    [prId]
  );
  if (!rows.length) {
    const [cl] = await mainPool.query(
      `SELECT prc.classification_id, c.classification_name, prc.nominal
       FROM tr_purchase_request_classification prc
       JOIN mst_purchase_classification c ON c.id = prc.classification_id
       WHERE prc.pr_id = ?`,
      [prId]
    );
    rows = cl.map((r) => ({ ...r, company_id: pr.company_id, outlet_id: pr.outlet_id }));
  }
  if (!rows.length) return { status: 'TANPA_KLASIFIKASI', message: 'Klasifikasi belum terisi.' };
  if (rows.length === 1 && !Number(rows[0].nominal)) rows[0].nominal = total;
  if (rows.some((r) => !Number(r.nominal))) {
    return { status: 'TANPA_NOMINAL', message: 'Ada alokasi tanpa nominal — belum bisa dijurnal.' };
  }

  const inScope = rows.filter((r) => JOURNAL_COMPANY_IDS.includes(Number(r.company_id)));
  if (!inScope.length) {
    return { status: 'DILEWATI', message: 'Perusahaan pengajuan ini tidak dibukukan di alfi.' };
  }

  // Pemetaan klasifikasi → akun
  const ids = [...new Set(inScope.map((r) => Number(r.classification_id)))];
  const [maps] = await alfiPool.query(
    `SELECT classification_id, account_id FROM mst_purchase_class_account WHERE classification_id IN (?) AND account_id IS NOT NULL`,
    [ids]
  );
  const accOf = new Map(maps.map((m) => [Number(m.classification_id), Number(m.account_id)]));
  const missing = [...new Set(inScope.filter((r) => !accOf.has(Number(r.classification_id))).map((r) => r.classification_name))];
  if (missing.length) {
    return { status: 'BELUM_DIPETAKAN', missing, message: `Klasifikasi belum dipetakan ke akun: ${missing.join(', ')}.` };
  }

  // Akun sumber dana
  const kredit = pr.payment_method === 'kredit';
  let fundId;
  if (kredit) {
    const [[u]] = await alfiPool.query(`SELECT id FROM mst_coa WHERE code = ? AND is_active = 1`, [UTANG_USAHA_CODE]).then(([r]) => [r]);
    fundId = u?.id;
    if (!fundId) return { status: 'AKUN_BELUM_ADA', message: `Akun Utang Usaha (${UTANG_USAHA_CODE}) tidak ditemukan.` };
  } else {
    const [[b]] = await alfiPool.query(`SELECT account_id FROM mst_account_map WHERE role = 'BANK'`).then(([r]) => [r]);
    fundId = b?.account_id;
    if (!fundId) return { status: 'AKUN_BELUM_ADA', message: "Peran akun 'Bank' belum dipetakan di Pengaturan." };
  }
  const fee = Number(pr.admin_fee) || 0;
  let feeAcc = null;
  if (fee > 0) {
    const [[f]] = await alfiPool.query(`SELECT account_id FROM mst_account_map WHERE role = 'BEBAN_ADMIN_BANK'`).then(([r]) => [r]);
    feeAcc = f?.account_id;
    if (!feeAcc) return { status: 'AKUN_BELUM_ADA', message: "Peran akun 'Beban Administrasi Bank' belum dipetakan." };
  }
  let bankId = fundId;
  if (fee > 0 && kredit) {
    const [[bk]] = await alfiPool.query(`SELECT account_id FROM mst_account_map WHERE role = 'BANK'`).then(([r]) => [r]);
    bankId = bk?.account_id;
    if (!bankId) return { status: 'AKUN_BELUM_ADA', message: "Peran akun 'Bank' belum dipetakan di Pengaturan." };
  }

  // Kunci hari (per outlet yang dipakai)
  const outletIds = [...new Set(inScope.map((r) => r.outlet_id).filter(Boolean).map(Number))];
  const lock = await dayLockMessage(pr.paid_date, outletIds);
  if (lock) return { status: 'TERKUNCI', message: lock };

  // Susun baris: debit per (akun, outlet), lalu kredit
  const debit = new Map();
  for (const r of inScope) {
    const key = `${accOf.get(Number(r.classification_id))}|${r.outlet_id || 0}`;
    debit.set(key, (debit.get(key) || 0) + Number(r.nominal));
  }
  const lines = [...debit.entries()].map(([k, v]) => {
    const [acc, out] = k.split('|');
    return { account_id: Number(acc), outlet_id: Number(out) || null, debit: v, credit: 0, memo: pr.nama_barang };
  });
  const debitSum = lines.reduce((s, l) => s + l.debit, 0);
  lines.push({ account_id: fundId, outlet_id: null, debit: 0, credit: debitSum, memo: kredit ? 'Utang usaha' : 'Pembayaran pengajuan' });
  if (fee > 0) {
    lines.push({ account_id: feeAcc, outlet_id: null, debit: fee, credit: 0, memo: 'Biaya admin' });
    lines.push({ account_id: bankId, outlet_id: null, debit: 0, credit: fee, memo: 'Biaya admin' });
  }
  const grand = lines.reduce((s, l) => s + l.debit, 0);

  const entryNo = `JU-PGJ-${pr.pr_id}`;
  const conn = await alfiPool.getConnection();
  try {
    await conn.beginTransaction();
    const [h] = await conn.query(
      `INSERT INTO tr_journal_entries (entry_no, entry_date, description, status, total_amount, created_by, source_type, source_ref, outlet_id, approved_by, approved_at)
       VALUES (?, ?, ?, 'POSTED', ?, ?, 'PENGAJUAN', ?, NULL, ?, NOW())`,
      [entryNo, pr.paid_date, `Pengajuan ${pr.pr_code} - ${pr.nama_barang}`.slice(0, 500), fx(grand), actorId, pr.pr_code, actorId]
    );
    let n = 1;
    for (const l of lines) {
      await conn.query(
        `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [h.insertId, n++, l.account_id, fx(l.debit), fx(l.credit), String(l.memo || '').slice(0, 200), l.outlet_id]
      );
    }
    await conn.query(
      `INSERT INTO tr_purchase_journal (pr_id, event_type, payment_id, journal_id, amount, created_by) VALUES (?, 'BAYAR', 0, ?, ?, ?)`,
      [prId, h.insertId, fx(grand), actorId]
    );
    try {
      await conn.query(
        `INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('tr_journal_entries', ?, 'CREATE', ?, ?)`,
        [h.insertId, actorId, JSON.stringify({ entry_no: entryNo, source: 'PENGAJUAN', pr_code: pr.pr_code })]
      );
    } catch {
      /* audit tidak menggagalkan */
    }
    await conn.commit();
    return { status: 'DIJURNAL', journal_id: h.insertId, entry_no: entryNo, amount: grand, message: `Jurnal ${entryNo} dibuat.` };
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.code === 'ER_DUP_ENTRY') return { status: 'SUDAH', message: 'Sudah dijurnal.' };
    throw err;
  } finally {
    conn.release();
  }
}
