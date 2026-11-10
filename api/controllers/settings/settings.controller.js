import { pool, safeQuery, getOutlets, myWaschenPool } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { ROLES as POS_ROLES } from "../pos/pos.controller.js";
import { ROLES as REKON_ROLES } from "../rekon/rekon.controller.js";
import { BANK_ROLES } from "../rekon/bank.controller.js";
import { CLOSING_ROLES } from "../closing/closing.controller.js";
import { ASSET_ROLES } from "../assets/assets.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// PENGATURAN — Cabang & metode bayar, rekening bank, pemetaan akun
// (Referensi Tampilan Aplikasi, "Pengaturan > Cabang & metode bayar").
// Nilai seperti tarif MDR dan toleransi di PDF hanyalah contoh: dikosongkan,
// diisi finance sesuai kontrak dan kebijakan.
// ════════════════════════════════════════════════════════════════════════════


const OPENING_ROLES = { SALDO_AWAL_EKUITAS: { label: "Penyeimbang Saldo Awal (ekuitas)", code: "3-1002" } };
const allRoles = () => ({ ...POS_ROLES, ...REKON_ROLES, ...BANK_ROLES, ...CLOSING_ROLES, ...OPENING_ROLES, ...ASSET_ROLES });

// ════════════════════════════ SALDO AWAL ═════════════════════════════════
// Saldo diisi menurut saldo normal akun (positif = saldo normal). Selisih debit/kredit
// otomatis ke akun penyeimbang (peran SALDO_AWAL_EKUITAS). Diposting sebagai satu jurnal
// sumber SALDO_AWAL pada tanggal saldo awal. Mengulang = balik jurnalnya dulu.
async function openingState() {
  const [[dateRow]] = await pool.query(`SELECT v FROM mst_app_setting WHERE k = 'opening_date'`).then(([r]) => [r.length ? r : [null]]);
  const [lines] = await pool.query(
    `SELECT o.account_id, o.outlet_key, o.amount, a.code, a.name, a.type, a.normal_balance
     FROM tr_opening_balance o JOIN mst_coa a ON a.id = o.account_id ORDER BY a.code, o.outlet_key`
  );
  const [[posted]] = await pool.query(
    `SELECT id, entry_no, status, DATE_FORMAT(entry_date,'%Y-%m-%d') AS entry_date FROM tr_journal_entries WHERE source_type = 'SALDO_AWAL' ORDER BY id DESC LIMIT 1`
  ).then(([r]) => [r.length ? r : [null]]);
  const [[eq]] = await pool.query(`SELECT m.account_id, a.code, a.name FROM mst_account_map m JOIN mst_coa a ON a.id = m.account_id WHERE m.role = 'SALDO_AWAL_EKUITAS'`).then(([r]) => [r.length ? r : [null]]);
  let debit = 0;
  let credit = 0;
  lines.forEach((l) => {
    const amt = Number(l.amount);
    const isDebit = (l.normal_balance === "DEBIT") === amt >= 0;
    if (isDebit) debit += Math.abs(amt);
    else credit += Math.abs(amt);
  });
  return {
    date: dateRow?.v || "",
    lines: lines.map((l) => ({ ...l, outlet_id: l.outlet_key || null, amount: toFixed2(l.amount) })),
    debit: toFixed2(debit),
    credit: toFixed2(credit),
    balancing: toFixed2(debit - credit), // >0 → penyeimbang di kredit
    equity: eq ? { account_id: eq.account_id, label: `${eq.code} ${eq.name}` } : null,
    posted: posted || null,
  };
}

export async function getOpening(_req, res) {
  try {
    const [accRows] = await pool.query(`SELECT id, code, name, type, normal_balance FROM mst_coa WHERE is_active = 1 AND is_header = 0 AND type IN ('ASET','KEWAJIBAN','EKUITAS') ORDER BY code`);
    return res.json({ ...(await openingState()), accounts: accRows, outlets: await getOutlets() });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat saldo awal", error: err.message });
  }
}

export async function saveOpening(req, res) {
  const conn = await pool.getConnection();
  try {
    const { date, lines = [] } = req.body || {};
    if (date && Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return res.status(422).json({ message: "Tanggal saldo awal tidak valid." });
    const st = await openingState();
    if (st.posted && st.posted.status !== "REVERSED") return res.status(422).json({ message: `Saldo awal sudah diposting (${st.posted.entry_no}). Balik jurnalnya dulu untuk mengubah.` });
    const clean = [];
    const seen = new Set();
    for (const l of lines) {
      const id = Number(l.account_id);
      const ok = Number(l.outlet_id) || 0;
      const amt = toFixed2(l.amount);
      if (!id || !amt) continue;
      const k = `${id}|${ok}`;
      if (seen.has(k)) return res.status(422).json({ message: "Ada akun + cabang yang dobel di daftar saldo awal." });
      seen.add(k);
      clean.push([id, ok, amt, req.user?.id || null]);
    }
    await conn.beginTransaction();
    await conn.query(`DELETE FROM tr_opening_balance`);
    if (clean.length) await conn.query(`INSERT INTO tr_opening_balance (account_id, outlet_key, amount, updated_by) VALUES ?`, [clean]);
    await conn.query(`INSERT INTO mst_app_setting (k, v) VALUES ('opening_date', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`, [date || null]);
    await conn.commit();
    return res.json({ message: "Saldo awal disimpan (belum diposting)." });
  } catch (err) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ message: "Gagal menyimpan saldo awal", error: err.message });
  } finally {
    conn.release();
  }
}

export async function postOpening(req, res) {
  const conn = await pool.getConnection();
  try {
    const st = await openingState();
    if (!st.date) return res.status(422).json({ message: "Isi tanggal saldo awal dulu." });
    if (!st.lines.length) return res.status(422).json({ message: "Belum ada baris saldo awal." });
    if (st.posted && st.posted.status !== "REVERSED") return res.status(422).json({ message: `Saldo awal sudah diposting (${st.posted.entry_no}).` });
    if (Math.abs(st.balancing) > 0.004 && !st.equity) return res.status(422).json({ message: "Peran 'Penyeimbang Saldo Awal' belum dipetakan." });

    await conn.beginTransaction();
    const [[cnt]] = await conn.query(`SELECT COUNT(*) AS n FROM tr_journal_entries WHERE source_type = 'SALDO_AWAL'`).then(([r]) => [r]);
    const entryNo = cnt.n ? `JU-SALDO-AWAL-v${cnt.n + 1}` : "JU-SALDO-AWAL";
    const total = toFixed2(Math.max(st.debit, st.credit));
    const [h] = await conn.query(
      `INSERT INTO tr_journal_entries (entry_no, entry_date, description, status, total_amount, created_by, source_type, source_ref, approved_by, approved_at)
       VALUES (?, ?, 'Saldo awal', 'POSTED', ?, ?, 'SALDO_AWAL', 'SALDO_AWAL', ?, NOW())`,
      [entryNo, st.date, total, req.user?.id || null, req.user?.id || null]
    );
    let n = 1;
    for (const l of st.lines) {
      const isDebit = (l.normal_balance === "DEBIT") === l.amount >= 0;
      const v = Math.abs(l.amount);
      await conn.query(
        `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, ?, 'Saldo awal', ?)`,
        [h.insertId, n++, l.account_id, isDebit ? v : 0, isDebit ? 0 : v, l.outlet_id]
      );
    }
    if (Math.abs(st.balancing) > 0.004) {
      await conn.query(
        `INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, ?, 'Penyeimbang saldo awal', NULL)`,
        [h.insertId, n++, st.equity.account_id, st.balancing < 0 ? -st.balancing : 0, st.balancing > 0 ? st.balancing : 0]
      );
    }
    try {
      await conn.query(
        `INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('tr_journal_entries', ?, 'CREATE', ?, ?)`,
        [h.insertId, req.user?.id || null, JSON.stringify({ entry_no: entryNo, source: "SALDO_AWAL", lines: st.lines.length })]
      );
    } catch {
      /* audit tidak menggagalkan */
    }
    await conn.commit();
    return res.status(201).json({ message: `Saldo awal diposting sebagai ${entryNo}.` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ message: "Gagal memposting saldo awal", error: err.message });
  } finally {
    conn.release();
  }
}

// ── GET /settings/overview ──────────────────────────────────────────────
export async function getSettings(_req, res) {
  try {
    const [outlets, codeRows, [cabRows], [methodRows], [bankRows], [mapRows], [accRows]] = await Promise.all([
      getOutlets(),
      myWaschenPool.query(`SELECT id, outlet_code FROM mst_outlet`).then(([r]) => r).catch(() => []),
      pool.query(
        `SELECT s.*, a.code AS cash_code, a.name AS cash_name FROM mst_cabang_setting s LEFT JOIN mst_coa a ON a.id = s.cash_account_id`
      ),
      pool.query(`SELECT * FROM mst_payment_method ORDER BY sort_no`),
      pool.query(
        `SELECT b.*, a.code AS account_code, a.name AS account_name FROM mst_bank_account b LEFT JOIN mst_coa a ON a.id = b.account_id ORDER BY b.outlet_id, b.id`
      ),
      pool.query(`SELECT m.role, m.account_id, a.code, a.name FROM mst_account_map m LEFT JOIN mst_coa a ON a.id = m.account_id`),
      pool.query(`SELECT id, code, name, type FROM mst_coa WHERE is_active = 1 AND is_header = 0 ORDER BY code`),
    ]);
    const codeOf = new Map(codeRows.map((r) => [Number(r.id), r.outlet_code]));
    const cabBy = new Map(cabRows.map((r) => [Number(r.outlet_id), r]));

    // Kategori layanan POS → akun pendapatan (kategori baru di POS muncul sebagai "belum dipetakan")
    const [posCats] = await myWaschenPool
      .query(`SELECT sc.id, sc.name, COUNT(sv.id) AS services FROM mst_service_category sc LEFT JOIN mst_service sv ON sv.category_id = sc.id GROUP BY sc.id, sc.name ORDER BY sc.id`)
      .catch(() => [[]]);
    const [svcMap] = await pool.query(
      `SELECT m.category_id, m.account_id, a.code, a.name FROM mst_service_account_map m LEFT JOIN mst_coa a ON a.id = m.account_id`
    ).catch(() => [[]]);
    const svcBy = new Map(svcMap.map((r) => [Number(r.category_id), r]));
    const mapBy = new Map(mapRows.map((r) => [r.role, r]));

    return res.json({
      cabang: outlets.map((o) => {
        const s = cabBy.get(o.id);
        return {
          outlet_id: o.id,
          code: codeOf.get(o.id) || String(o.id),
          name: o.name,
          is_event: o.is_event,
          cash_account_id: s?.cash_account_id ?? null,
          cash_account: s?.cash_code ? `${s.cash_code} ${s.cash_name}` : null,
          warehouse_code: s?.warehouse_code || "",
          branch_head: s?.branch_head || "",
          start_date: s?.start_date ? String(s.start_date).slice(0, 10) : "",
        };
      }),
      methods: methodRows.map((m) => ({
        ...m,
        mdr_percent: m.mdr_percent == null ? null : Number(m.mdr_percent),
        mdr_fixed: m.mdr_fixed == null ? null : Number(m.mdr_fixed),
        tolerance: m.tolerance == null ? null : Number(m.tolerance),
        account: mapBy.get(m.role)?.code ? `${mapBy.get(m.role).code} ${mapBy.get(m.role).name}` : null,
      })),
      bank_accounts: bankRows.map((b) => ({ ...b, outlet_name: b.outlet_id ? outlets.find((o) => o.id === Number(b.outlet_id))?.name || `Outlet #${b.outlet_id}` : "Pusat" })),
      account_map: Object.entries(allRoles()).map(([role, def]) => ({
        role,
        label: def.label,
        account_id: mapBy.get(role)?.account_id ?? null,
        default_code: def.code,
      })),
      service_map: posCats.map((c) => {
        const m = svcBy.get(Number(c.id));
        return {
          category_id: Number(c.id),
          category_name: c.name,
          services: Number(c.services),
          account_id: m?.account_id ?? null,
          account: m?.code ? `${m.code} ${m.name}` : null,
          is_new: !m, // belum pernah ada di pemetaan
        };
      }),
      accounts: accRows,
    });
  } catch (err) {
    console.error("[getSettings]", err);
    return res.status(500).json({ message: "Gagal memuat pengaturan", error: err.message });
  }
}

const idOrNull = (v) => (v === "" || v == null ? null : Number(v));

// ── PUT /settings/cabang/:outletId ──────────────────────────────────────
export async function saveCabang(req, res) {
  try {
    const outletId = Number(req.params.outletId);
    const { cash_account_id, warehouse_code, branch_head, start_date } = req.body || {};
    const start = start_date ? String(start_date).slice(0, 10) : null;
    if (start && Number.isNaN(Date.parse(`${start}T00:00:00Z`))) return res.status(422).json({ message: "Tanggal mulai tidak valid." });
    const cash = idOrNull(cash_account_id);
    if (cash) {
      const [a] = await pool.query(`SELECT id, type, is_header, is_active FROM mst_coa WHERE id = ?`, [cash]);
      if (!a[0] || a[0].is_header || !a[0].is_active) return res.status(422).json({ message: "Akun kas tidak valid." });
      if (a[0].type !== "ASET") return res.status(422).json({ message: "Akun kas harus bertipe Aset." });
    }
    await pool.query(
      `INSERT INTO mst_cabang_setting (outlet_id, cash_account_id, warehouse_code, branch_head, start_date) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE cash_account_id = VALUES(cash_account_id), warehouse_code = VALUES(warehouse_code),
         branch_head = VALUES(branch_head), start_date = VALUES(start_date)`,
      [outletId, cash, String(warehouse_code || "").trim().slice(0, 30) || null, String(branch_head || "").trim().slice(0, 100) || null, start]
    );
    return res.json({ message: "Pengaturan cabang disimpan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan pengaturan cabang", error: err.message });
  }
}

// ── PUT /settings/method/:code ──────────────────────────────────────────
export async function saveMethod(req, res) {
  try {
    const { mdr_percent, mdr_fixed, settle_days, settle_note, dest_bank_id, tolerance } = req.body || {};
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const pct = num(mdr_percent);
    const fixed = num(mdr_fixed);
    const days = num(settle_days);
    const tol = num(tolerance);
    if (pct != null && (Number.isNaN(pct) || pct < 0 || pct > 100)) return res.status(422).json({ message: "MDR persen harus antara 0 dan 100." });
    if (fixed != null && (Number.isNaN(fixed) || fixed < 0)) return res.status(422).json({ message: "MDR nominal tidak valid." });
    if (days != null && (!Number.isInteger(days) || days < 0 || days > 30)) return res.status(422).json({ message: "Hari cair harus bilangan bulat 0–30." });
    if (tol != null && (Number.isNaN(tol) || tol < 0)) return res.status(422).json({ message: "Toleransi tidak valid." });
    const [r] = await pool.query(
      `UPDATE mst_payment_method SET mdr_percent=?, mdr_fixed=?, settle_days=?, settle_note=?, dest_bank_id=?, tolerance=? WHERE code=?`,
      [pct, fixed, days, String(settle_note || "").trim().slice(0, 60) || null, idOrNull(dest_bank_id), tol != null ? toFixed2(tol) : null, req.params.code]
    );
    if (!r.affectedRows) return res.status(404).json({ message: "Metode bayar tidak ditemukan." });
    return res.json({ message: "Metode bayar disimpan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan metode bayar", error: err.message });
  }
}

// ── Rekening bank ───────────────────────────────────────────────────────
function bankPayload(b = {}) {
  const bank_name = String(b.bank_name || "").trim().slice(0, 40);
  const account_no = String(b.account_no || "").replace(/\s+/g, "").slice(0, 40);
  const holder = String(b.holder || "").trim().slice(0, 120);
  if (!bank_name || !account_no || !holder) return { error: "Bank, nomor rekening, dan nama pemilik wajib diisi." };
  return { value: { bank_name, account_no, holder, outlet_id: idOrNull(b.outlet_id), account_id: idOrNull(b.account_id), is_active: b.is_active === false || b.is_active === 0 ? 0 : 1 } };
}

export async function createBank(req, res) {
  try {
    const p = bankPayload(req.body);
    if (p.error) return res.status(422).json({ message: p.error });
    const v = p.value;
    await pool.query(
      `INSERT INTO mst_bank_account (outlet_id, bank_name, account_no, holder, account_id, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
      [v.outlet_id, v.bank_name, v.account_no, v.holder, v.account_id, v.is_active]
    );
    return res.status(201).json({ message: "Rekening bank ditambahkan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menambah rekening", error: err.message });
  }
}

export async function updateBank(req, res) {
  try {
    const p = bankPayload(req.body);
    if (p.error) return res.status(422).json({ message: p.error });
    const v = p.value;
    const [r] = await pool.query(
      `UPDATE mst_bank_account SET outlet_id=?, bank_name=?, account_no=?, holder=?, account_id=?, is_active=? WHERE id=?`,
      [v.outlet_id, v.bank_name, v.account_no, v.holder, v.account_id, v.is_active, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ message: "Rekening tidak ditemukan." });
    return res.json({ message: "Rekening bank disimpan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan rekening", error: err.message });
  }
}

export async function deleteBank(req, res) {
  try {
    await pool.query(`UPDATE mst_payment_method SET dest_bank_id = NULL WHERE dest_bank_id = ?`, [req.params.id]);
    await pool.query(`DELETE FROM mst_bank_account WHERE id = ?`, [req.params.id]);
    return res.json({ message: "Rekening bank dihapus." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menghapus rekening", error: err.message });
  }
}

// ── PUT /settings/service-map/:categoryId ───────────────────────────────
export async function saveServiceMap(req, res) {
  try {
    const categoryId = Number(req.params.categoryId);
    const accountId = idOrNull(req.body?.account_id);
    if (!accountId) return res.status(422).json({ message: "Pilih akun pendapatan." });
    const [a] = await pool.query(`SELECT id, type, is_header, is_active FROM mst_coa WHERE id = ?`, [accountId]);
    if (!a[0] || a[0].is_header || !a[0].is_active) return res.status(422).json({ message: "Akun tidak valid (induk atau nonaktif)." });
    if (a[0].type !== "PENDAPATAN") return res.status(422).json({ message: "Akun layanan harus bertipe Pendapatan." });
    const [c] = await myWaschenPool.query(`SELECT name FROM mst_service_category WHERE id = ?`, [categoryId]);
    if (!c[0]) return res.status(404).json({ message: "Kategori layanan tidak ditemukan di POS." });
    await pool.query(
      `INSERT INTO mst_service_account_map (category_id, category_name, account_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE category_name = VALUES(category_name), account_id = VALUES(account_id)`,
      [categoryId, c[0].name, accountId]
    );
    return res.json({ message: `Kategori "${c[0].name}" dipetakan. Berlaku untuk posting berikutnya.` });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan pemetaan layanan", error: err.message });
  }
}

// ── PUT /settings/account-map/:role ─────────────────────────────────────
export async function saveAccountMap(req, res) {
  try {
    const role = req.params.role;
    if (!allRoles()[role]) return res.status(404).json({ message: "Peran akun tidak dikenal." });
    const accountId = idOrNull(req.body?.account_id);
    if (!accountId) return res.status(422).json({ message: "Pilih akun." });
    const [a] = await pool.query(`SELECT id, is_header, is_active FROM mst_coa WHERE id = ?`, [accountId]);
    if (!a[0] || a[0].is_header || !a[0].is_active) return res.status(422).json({ message: "Akun tidak valid (induk atau nonaktif)." });
    await pool.query(
      `INSERT INTO mst_account_map (role, account_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE account_id = VALUES(account_id)`,
      [role, accountId]
    );
    return res.json({ message: "Pemetaan akun disimpan. Berlaku untuk posting berikutnya." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan pemetaan", error: err.message });
  }
}
