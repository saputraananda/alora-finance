import { mainPool } from '../../db/pool.js';
import { loadMe } from '../../utils/pengajuanAccess.js';
import { postPurchaseJournal } from '../../utils/purchaseJournal.js';
import { removeUploaded } from '../../utils/purchaseUpload.js';
import { sanitize, audit, loadPr, writeLog } from './pengajuanActions.controller.js';

// ════════════════════════════════════════════════════════════════════════════
// BAYAR  (status 5 → 6 pengajuan biasa · 5 → 7 reimburse) — MENULIS ke database SuperApp.
// Meniru processPayment di SuperApp (backend-superapp/.../pengajuan.controller.js).
//
// multipart/form-data:
//   classification_ids (JSON array / "1,2"), payment_method (cash|kredit),
//   termin_value + termin_unit (hari|bulan|tahun, wajib bila kredit),
//   nominal_bayar, admin_fee, payment_note, paid_at (YYYY-MM-DDTHH:mm),
//   allocations (JSON [{classification_id, company_id, outlet_id, nominal}]) bila ada >1 sel,
//   classification_splits (JSON {id: nominal}), attachments[] (bukti, wajib, maks 5)
//
// Setelah pembayaran tercatat, jurnal dibuat otomatis. Kegagalan jurnal TIDAK membatalkan
// pembayaran; pengajuan bisa dijurnalkan ulang lewat POST /requests/:id/journal.
// ════════════════════════════════════════════════════════════════════════════

const WASCHEN_COMPANY_ID = 5;
const rpFmt = (n) => `Rp ${new Intl.NumberFormat('id-ID').format(n)}`;

const parseJson = (raw) => {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const parseClassificationIds = (raw) => {
  if (raw == null || raw === '') return [];
  let list = raw;
  if (typeof raw === 'string') {
    const parsed = parseJson(raw);
    list = Array.isArray(parsed) ? parsed : raw.split(',');
  }
  if (!Array.isArray(list)) list = [list];
  return [...new Set(list.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
};

const parseClassificationSplits = (raw, ids, nominal) => {
  if (ids.length === 1) return { [ids[0]]: nominal ?? null };
  const obj = parseJson(raw);
  const out = {};
  for (const id of ids) {
    const v = obj && typeof obj === 'object' ? Number(obj[id] ?? obj[String(id)]) : NaN;
    out[id] = Number.isFinite(v) && v > 0 ? v : null;
  }
  return out;
};

async function getScopesOfPr(conn, prId) {
  const [rows] = await conn.query(
    `SELECT prs.company_id, c.company_name, prs.outlet_id, o.full_name AS outlet_name
     FROM tr_purchase_request_scope prs
     LEFT JOIN mst_company c ON c.company_id = prs.company_id
     LEFT JOIN mst_outlet  o ON o.id         = prs.outlet_id
     WHERE prs.pr_id = ? ORDER BY c.company_name, o.full_name`,
    [prId]
  );
  const companies = [];
  const outlets = [];
  for (const r of rows) {
    if (!companies.some((c) => c.company_id === r.company_id)) companies.push({ company_id: r.company_id, company_name: r.company_name });
    if (r.outlet_id && !outlets.some((o) => o.outlet_id === r.outlet_id)) outlets.push({ outlet_id: r.outlet_id, outlet_name: r.outlet_name });
  }
  return { companies, outlets };
}

const scopePayTargets = ({ companies = [], outlets = [] }) => {
  const targets = [];
  for (const c of companies) {
    const cid = Number(c.company_id);
    if (cid === WASCHEN_COMPANY_ID && outlets.length) {
      for (const o of outlets) targets.push({ company_id: cid, outlet_id: Number(o.outlet_id), company_name: c.company_name, outlet_name: o.outlet_name });
    } else {
      targets.push({ company_id: cid, outlet_id: null, company_name: c.company_name, outlet_name: null });
    }
  }
  return targets;
};

const sameAlloc = (a, b) =>
  Number(a.classification_id) === Number(b.classification_id) &&
  Number(a.company_id) === Number(b.company_id) &&
  Number(a.outlet_id || 0) === Number(b.outlet_id || 0);

function parseAllocations(raw, classIds, targets, nominalBayar, splitsRaw) {
  if (!targets.length) return { rows: [], error: null };
  const cells = [];
  for (const cid of classIds) {
    for (const t of targets) cells.push({ classification_id: cid, company_id: t.company_id, outlet_id: t.outlet_id, company_name: t.company_name, outlet_name: t.outlet_name });
  }
  if (cells.length === 1) return { rows: [{ ...cells[0], nominal: nominalBayar ?? null }], error: null };

  const list = parseJson(raw);
  if ((!Array.isArray(list) || !list.length) && targets.length === 1) {
    const splits = parseClassificationSplits(splitsRaw, classIds, nominalBayar);
    return {
      rows: classIds.map((cid) => ({
        classification_id: cid,
        company_id: targets[0].company_id,
        outlet_id: targets[0].outlet_id,
        company_name: targets[0].company_name,
        outlet_name: targets[0].outlet_name,
        nominal: splits[cid] ?? null,
      })),
      error: null,
    };
  }
  if (!Array.isArray(list) || !list.length) return { rows: [], error: 'Alokasi per kategori wajib diisi.' };

  const rows = cells.map((cell) => {
    const hit = list.find((r) => sameAlloc(r, cell));
    const n = hit == null ? NaN : Number(hit.nominal);
    return { ...cell, nominal: Number.isFinite(n) && n > 0 ? Math.round(n) : null };
  });
  if (nominalBayar) {
    const sum = rows.reduce((s, r) => s + (Number(r.nominal) || 0), 0);
    if (sum !== Math.round(Number(nominalBayar))) return { rows: [], error: 'Total alokasi harus sama dengan nominal bayar.' };
  }
  return { rows, error: null };
}

const splitsFromAllocations = (classIds, rows) => {
  const out = {};
  for (const id of classIds) {
    const sum = rows.filter((r) => Number(r.classification_id) === Number(id)).reduce((s, r) => s + (Number(r.nominal) || 0), 0);
    out[id] = sum || null;
  }
  return out;
};

function classificationLabel(classRows, splits, allocRows, targetsCount) {
  const nameById = new Map(classRows.map((c) => [Number(c.id), c.classification_name]));
  if (allocRows.length > 1 && targetsCount > 1) {
    return allocRows
      .map((r) => `${nameById.get(Number(r.classification_id)) || '—'} · ${r.outlet_name || r.company_name || '—'}${r.nominal ? ` (${rpFmt(r.nominal)})` : ''}`)
      .join(', ');
  }
  return classRows.map((c) => (splits[c.id] ? `${c.classification_name} (${rpFmt(splits[c.id])})` : c.classification_name)).join(', ');
}

// POST /purchasing/requests/:id/pay
export async function payRequest(req, res) {
  const files = req.files || [];
  const fail = (code, message) => {
    removeUploaded(files);
    return res.status(code).json({ success: false, message });
  };
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return fail(400, 'ID tidak valid.');
  const me = await loadMe(req);
  if (!me) return fail(422, 'Akun ini belum terhubung ke data karyawan, sehingga tidak bisa melakukan aksi. Hubungi admin.');

  const b = req.body || {};
  const classIds = parseClassificationIds(b.classification_ids ?? b.classification_id);
  if (!classIds.length) return fail(400, 'Klasifikasi wajib dipilih.');
  const method = ['cash', 'kredit'].includes(b.payment_method) ? b.payment_method : null;
  if (!method) return fail(400, 'Metode pembayaran (Tunai/Kredit) wajib dipilih.');
  if (!files.length) return fail(400, 'Bukti pembayaran wajib dilampirkan.');

  let terminValue = null;
  let terminUnit = null;
  let jatuhTempo = null;
  if (method === 'kredit') {
    terminValue = b.termin_value ? Number(b.termin_value) : null;
    terminUnit = ['hari', 'bulan', 'tahun'].includes(b.termin_unit) ? b.termin_unit : null;
    if (!terminValue || !terminUnit) return fail(400, 'Termin wajib diisi untuk pembayaran kredit.');
    const d = new Date();
    if (terminUnit === 'hari') d.setDate(d.getDate() + terminValue);
    else if (terminUnit === 'bulan') d.setMonth(d.getMonth() + terminValue);
    else d.setFullYear(d.getFullYear() + terminValue);
    jatuhTempo = d.toISOString().split('T')[0];
  }
  const note = b.payment_note ? sanitize(b.payment_note) : null;
  const nominal = Number(b.nominal_bayar) || null;
  const adminFee = Number(b.admin_fee) || null;
  const paidRaw = b.paid_at ? String(b.paid_at).trim() : '';
  const paidAt = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(paidRaw) ? paidRaw.replace('T', ' ') : null;

  const conn = await mainPool.getConnection();
  try {
    await conn.beginTransaction();
    const pr = await loadPr(conn, id);
    if (!pr) {
      await conn.rollback();
      return fail(404, 'Pengajuan tidak ditemukan.');
    }
    if (Number(pr.status) !== 5) {
      await conn.rollback();
      return fail(400, 'Pengajuan belum siap untuk pembayaran, atau sudah diproses.');
    }

    const [classRows] = await conn.query(
      `SELECT id, classification_name FROM mst_purchase_classification WHERE is_active = 1 AND id IN (?) ORDER BY classification_name`,
      [classIds]
    );
    if (!classRows.length) {
      await conn.rollback();
      return fail(400, 'Klasifikasi tidak valid.');
    }
    const cIds = classRows.map((c) => c.id);

    const targets = scopePayTargets(await getScopesOfPr(conn, id));
    const parsed = parseAllocations(b.allocations, cIds, targets, nominal, b.classification_splits);
    if (parsed.error) {
      await conn.rollback();
      return fail(400, parsed.error);
    }
    const splits = parsed.rows.length ? splitsFromAllocations(cIds, parsed.rows) : parseClassificationSplits(b.classification_splits, cIds, nominal);
    const classLabel = classificationLabel(classRows, splits, parsed.rows, targets.length);

    const reimburse = pr.type === 'reimburse';
    const toStatus = reimburse ? 7 : 6;
    const proofPath = `purchase/${files[0].filename}`;
    const paidSql = paidAt ? '?' : 'NOW()';
    const paidParam = paidAt ? [paidAt] : [];
    const completeSql = reimburse ? `, completed_by = ?, completed_at = ${paidSql}, invoice_proof_path = ?` : '';

    const [upd] = await conn.query(
      `UPDATE tr_purchase_request SET
          status = ?, classification_id = ?, payment_method = ?,
          termin_value = ?, termin_unit = ?, jatuh_tempo = ?,
          nominal_bayar = ?, admin_fee = ?,
          paid_by = ?, paid_at = ${paidSql},
          payment_proof_path = ?, payment_note = ?
          ${completeSql},
          updated_at = NOW()
       WHERE pr_id = ? AND status = 5`,
      [
        toStatus, cIds[0], method, terminValue, terminUnit, jatuhTempo, nominal, adminFee,
        me.employee_id, ...paidParam, proofPath, note,
        ...(reimburse ? [me.employee_id, ...paidParam, proofPath] : []),
        id,
      ]
    );
    if (!upd.affectedRows) {
      await conn.rollback();
      return fail(409, 'Status pengajuan baru saja berubah. Muat ulang daftar.');
    }

    // Klasifikasi & alokasi
    await conn.query(`DELETE FROM tr_purchase_request_classification WHERE pr_id = ?`, [id]);
    await conn.query(
      `INSERT IGNORE INTO tr_purchase_request_classification (pr_id, classification_id, nominal) VALUES ${cIds.map(() => '(?, ?, ?)').join(', ')}`,
      cIds.flatMap((cid) => [id, cid, splits[cid] ?? null])
    );
    if (parsed.rows.length) {
      await conn.query(`DELETE FROM tr_purchase_request_allocation WHERE pr_id = ?`, [id]);
      await conn.query(
        `INSERT INTO tr_purchase_request_allocation (pr_id, classification_id, company_id, outlet_id, nominal) VALUES ${parsed.rows.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
        parsed.rows.flatMap((r) => [id, r.classification_id, r.company_id, r.outlet_id, r.nominal])
      );
    }

    // Riwayat bayar (tunai). Kredit dicatat lewat cicilan.
    if (method === 'cash') {
      await conn.query(
        `INSERT INTO tr_purchase_request_payment (pr_id, nominal_bayar, proof_path, note, paid_by, paid_by_name, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ${paidSql})`,
        [id, nominal || 0, proofPath, note, me.employee_id, me.full_name, ...paidParam]
      );
    }
    for (const f of files) {
      await conn.query(
        `INSERT INTO tr_purchase_request_attachment (pr_id, file_path, original_name, mime_type, file_size_kb) VALUES (?, ?, ?, ?, ?)`,
        [id, `purchase/${f.filename}`, f.originalname, f.mimetype, Math.round(f.size / 1024)]
      );
    }

    const termLbl = method === 'kredit' ? ` | Termin: ${terminValue} ${terminUnit} (jatuh tempo: ${jatuhTempo})` : '';
    const nomLbl = nominal ? ` | ${method === 'kredit' ? 'Total Tagihan Kredit' : 'Nominal Bayar'}: ${rpFmt(nominal)}` : '';
    const feeLbl = adminFee ? ` | Biaya Admin: ${rpFmt(adminFee)}` : '';
    const noteLbl = note ? ` | ${note}` : '';
    await writeLog(
      conn, id, 'paid', me.employee_id, me.full_name,
      reimburse
        ? `Pembayaran reimburse dilakukan | Metode: ${method} | Klasifikasi: ${classLabel}${nomLbl}${feeLbl}${noteLbl}`
        : `${method === 'kredit' ? 'PR diterbitkan (Kredit)' : 'Pembayaran dilakukan'} | Metode: ${method} | Klasifikasi: ${classLabel}${termLbl}${nomLbl}${feeLbl}${noteLbl}`
    );
    if (reimburse) {
      await writeLog(conn, id, 'completed', me.employee_id, me.full_name, 'Reimburse selesai — bukti pembayaran dilampirkan oleh Team Finance');
    }
    await conn.commit();
    await audit(req, id, 'UPDATE', { pr_code: pr.pr_code, action: 'bayar', from: 5, to: toStatus, method, nominal, by: me.full_name, via: 'alfi' });

    let journal;
    try {
      journal = await postPurchaseJournal(id, req.user?.id ?? null);
    } catch (e) {
      console.error('[purchasing.payRequest/journal]', e);
      journal = { status: 'GAGAL', message: 'Pembayaran tercatat, tetapi jurnal gagal dibuat. Coba jurnalkan ulang.' };
    }
    res.json({
      success: true,
      message: reimburse ? 'Pembayaran reimburse dicatat — reimburse selesai.' : method === 'kredit' ? 'PR kredit diterbitkan.' : 'Pembayaran dicatat.',
      journal,
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    removeUploaded(files);
    console.error('[purchasing.payRequest]', err);
    res.status(500).json({ success: false, message: 'Gagal memproses pembayaran.' });
  } finally {
    conn.release();
  }
}

// POST /purchasing/requests/:id/reject-payment   body: { reason }   (status 5 → 9)
export async function rejectPayment(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
  const me = await loadMe(req);
  if (!me) return res.status(422).json({ success: false, message: 'Akun ini belum terhubung ke data karyawan, sehingga tidak bisa melakukan aksi. Hubungi admin.' });
  const reason = sanitize(req.body?.reason);
  if (!reason) return res.status(400).json({ success: false, message: 'Alasan penolakan wajib diisi.' });

  const conn = await mainPool.getConnection();
  try {
    await conn.beginTransaction();
    const pr = await loadPr(conn, id);
    if (!pr) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Pengajuan tidak ditemukan.' });
    }
    if (Number(pr.status) !== 5) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Pengajuan tidak bisa ditolak pada status ini.' });
    }
    const [upd] = await conn.query(
      `UPDATE tr_purchase_request SET status = 9, rejected_by = ?, rejected_at = NOW(), rejection_reason = ?, updated_at = NOW()
       WHERE pr_id = ? AND status = 5`,
      [me.employee_id, reason, id]
    );
    if (!upd.affectedRows) {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Status pengajuan baru saja berubah. Muat ulang daftar.' });
    }
    await writeLog(conn, id, 'rejected_payment', me.employee_id, me.full_name, reason);
    await conn.commit();
    await audit(req, id, 'REJECT', { pr_code: pr.pr_code, from: 5, to: 9, by: me.full_name, reason, via: 'alfi' });
    res.json({ success: true, message: `${pr.pr_code} ditolak.` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('[purchasing.rejectPayment]', err);
    res.status(500).json({ success: false, message: 'Gagal menolak pembayaran.' });
  } finally {
    conn.release();
  }
}

// POST /purchasing/requests/:id/journal — jurnalkan (ulang) pengajuan yang sudah dibayar
export async function journalRequest(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
    const journal = await postPurchaseJournal(id, req.user?.id ?? null);
    const ok = ['DIJURNAL', 'SUDAH'].includes(journal.status);
    res.status(ok ? 200 : 422).json({ success: ok, message: journal.message, journal });
  } catch (err) {
    console.error('[purchasing.journalRequest]', err);
    res.status(500).json({ success: false, message: 'Gagal membuat jurnal.' });
  }
}

// POST /purchasing/requests/:id/attachments — tambah lampiran dari detail (multipart: attachments[], maks 10).
// Meniru addAttachments di SuperApp: lampiran ditambahkan, riwayat dicatat, status tidak berubah.
export async function addAttachments(req, res) {
  const files = req.files || [];
  const fail = (code, message) => {
    removeUploaded(files);
    return res.status(code).json({ success: false, message });
  };
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return fail(400, 'ID tidak valid.');
    const me = await loadMe(req);
    if (!me) return fail(422, 'Akun ini belum terhubung ke data karyawan, sehingga tidak bisa melakukan aksi. Hubungi admin.');
    if (!files.length) return fail(400, 'Tidak ada file yang diunggah.');

    const conn = await mainPool.getConnection();
    try {
      await conn.beginTransaction();
      const pr = await loadPr(conn, id);
      if (!pr) {
        await conn.rollback();
        return fail(404, 'Pengajuan tidak ditemukan.');
      }
      for (const f of files) {
        await conn.query(
          `INSERT INTO tr_purchase_request_attachment (pr_id, file_path, original_name, mime_type, file_size_kb) VALUES (?, ?, ?, ?, ?)`,
          [id, `purchase/${f.filename}`, f.originalname, f.mimetype, Math.round(f.size / 1024)]
        );
      }
      await writeLog(conn, id, 'updated', me.employee_id, me.full_name, `Lampiran ditambahkan oleh Finance (${files.length} file)`);
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    res.json({ success: true, message: `${files.length} lampiran ditambahkan.` });
  } catch (err) {
    removeUploaded(files);
    console.error('[purchasing.addAttachments]', err);
    res.status(500).json({ success: false, message: 'Gagal menambah lampiran.' });
  }
}
