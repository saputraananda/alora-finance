import { pool, myWaschenPool } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { dayLockMessage } from "../../utils/dayLock.js";
import { loadOutletOverrides } from "../../utils/accountResolver.js";
import { loadStartDates, beforeStart } from "../../utils/outletStart.js";
import { loadAccountMap } from "./pos.controller.js";
import { employeeNames } from "./nota.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// JURNAL SETORAN KASIR
// Satu jurnal per closing shift "Final" di POS (tr_cashier_shift), dibuat otomatis:
//     Dr Kas Sentral (dipegang Finance)     Cr Kas cabang
// Nominal = penerimaan TUNAI cabang pada hari closing sampai jam closing (pembayaran tr_payment_log bermetode Tunai).
// POS hanya menyimpan bukti setor, bukan nominal yang disetor, jadi Finance mengoreksi lewat "Edit" bila setoran aktual berbeda.
// ════════════════════════════════════════════════════════════════════════════

export const SETORAN_ROLES = { KAS_SENTRAL: { label: "Kas Sentral (dipegang Finance)", code: "1-1101" } };
const SOURCE = "SETORAN_KASIR";
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const MONTH = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const longDate = (d) => `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

const assetUrl = (p) => {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(process.env.POS_ASSET_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}${p.startsWith("/") ? "" : "/"}${p}` : null;
};

async function finalShifts(from, to, outlets = []) {
  const p = [from, to];
  let extra = "";
  if (outlets.length) { extra = " AND s.outlet_id IN (?)"; p.push(outlets); }
  const [rows] = await myWaschenPool.query(
    `SELECT s.id, s.outlet_id, s.shift_number, s.cashier_employee_id, s.closed_by_employee_id, s.closed_at, DATE_FORMAT(s.closed_at, '%Y-%m-%d') AS d,
            s.deposit_proof_url, s.deposit_notes, o.name AS outlet_name, o.outlet_code
     FROM tr_cashier_shift s LEFT JOIN mst_outlet o ON o.id = s.outlet_id
     WHERE s.status = 'Closed' AND s.close_type = 'Final' AND s.closed_at >= ? AND s.closed_at < DATE_ADD(?, INTERVAL 1 DAY)${extra}
     ORDER BY s.closed_at DESC, s.id DESC`,
    p
  );
  return rows;
}

async function cashReceived(shift) {
  const [r] = await myWaschenPool.query(
    `SELECT COALESCE(SUM(l.amount), 0) AS amt
     FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
     WHERE t.outlet_id = ? AND t.is_delete_requested = 0 AND l.payment_method LIKE 'Tunai%'
       AND l.log_type IN ('DP', 'Lunas', 'Pelunasan')
       AND l.created_at >= DATE(?) AND l.created_at <= ?`,
    [shift.outlet_id, shift.closed_at, shift.closed_at]
  );
  return toFixed2(r[0].amt);
}

const refOf = (shiftId) => `SHIFT-${shiftId}`;

// Buat jurnal untuk closing shift yang belum punya jurnal. Mengembalikan {created, skipped:[{shift, reason}]}
export async function syncSetoran(from, to, actorId = null) {
  const shifts = await finalShifts(from, to);
  if (!shifts.length) return { created: 0, skipped: [] };
  const [accMap, ov, starts] = await Promise.all([loadAccountMap(), loadOutletOverrides(), loadStartDates()]);
  const [have] = await pool.query(
    `SELECT source_ref FROM tr_journal_entries WHERE source_type = ? AND source_ref IN (?) AND status <> 'REVERSED'`,
    [SOURCE, shifts.map((s) => refOf(s.id))]
  );
  const done = new Set(have.map((r) => r.source_ref));
  const names = await employeeNames(shifts.flatMap((s) => [s.cashier_employee_id, s.closed_by_employee_id]));
  let created = 0;
  const skipped = [];
  for (const s of shifts) {
    if (done.has(refOf(s.id))) continue;
    // Koreksi yang sudah pernah dibuat (jurnal lama dibalik, versi baru aktif) juga dianggap ada
    const [any] = await pool.query(`SELECT id FROM tr_journal_entries WHERE source_type = ? AND source_ref = ? LIMIT 1`, [SOURCE, refOf(s.id)]);
    if (any.length) continue;
    if (beforeStart(starts, s.outlet_id, s.d)) { skipped.push({ shift_id: s.id, reason: "Sebelum tanggal mulai cabang" }); continue; }
    const lockMsg = await dayLockMessage(s.d, [s.outlet_id]);
    if (lockMsg) { skipped.push({ shift_id: s.id, reason: lockMsg }); continue; }
    const amount = await cashReceived(s);
    if (amount <= 0) { skipped.push({ shift_id: s.id, reason: "Tidak ada penerimaan tunai" }); continue; }
    const m = ov.forOutlet(s.outlet_id, accMap);
    const sentral = m.KAS_SENTRAL;
    if (!sentral?.account_id) { skipped.push({ shift_id: s.id, reason: "Akun Kas Sentral belum dipetakan (Pengaturan › Pemetaan Akun)" }); continue; }
    if (!m.KAS?.account_id) { skipped.push({ shift_id: s.id, reason: "Akun Kas belum dipetakan" }); continue; }
    const kasir = names.get(Number(s.closed_by_employee_id)) || names.get(Number(s.cashier_employee_id)) || "kasir";
    const entryNo = `SK-${s.outlet_code || s.outlet_id}-${s.d.slice(2, 4)}${s.d.slice(5, 7)}${s.d.slice(8, 10)}-${s.id}`;
    const desc = `Setoran ${s.outlet_name} tanggal ${longDate(s.d)}`;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [h] = await conn.query(
        `INSERT INTO tr_journal_entries (entry_no, entry_date, description, status, total_amount, created_by, source_type, source_ref, outlet_id)
         VALUES (?, ?, ?, 'POSTED', ?, ?, ?, ?, ?)`,
        [entryNo, s.d, desc, amount, actorId, SOURCE, refOf(s.id), s.outlet_id]
      );
      const lines = [
        [sentral.account_id, amount, 0, `Setoran tunai ${s.outlet_name} shift ${s.shift_number} (${kasir})`],
        [m.KAS.account_id, 0, amount, `Tunai penjualan ${s.outlet_name} ${s.d}`],
      ];
      for (let i = 0; i < lines.length; i++) {
        await conn.query(`INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [h.insertId, i + 1, lines[i][0], lines[i][1], lines[i][2], lines[i][3], s.outlet_id]);
      }
      await conn.commit();
      created += 1;
    } catch (err) {
      await conn.rollback().catch(() => {});
      skipped.push({ shift_id: s.id, reason: `Gagal: ${err.message}` });
    } finally {
      conn.release();
    }
  }
  return { created, skipped };
}

// ── POST /pos/setoran/sync {from,to} ─────────────────────────────────────
export async function postSetoranSync(req, res) {
  try {
    const { from, to } = req.body || {};
    if (!isDate(from) || !isDate(to)) return res.status(422).json({ message: "Tanggal tidak valid." });
    const r = await syncSetoran(from, to, req.user?.id || null);
    return res.json({ message: r.created ? `${r.created} jurnal setoran dibuat.` : "Tidak ada jurnal baru.", ...r });
  } catch (err) {
    console.error("[postSetoranSync]", err);
    return res.status(500).json({ message: "Gagal membuat jurnal setoran", error: err.message });
  }
}

// ── GET /pos/setoran?from=&to=&outlets=&search=&page= ─────────────────────
export async function getSetoran(req, res) {
  try {
    const { from, to } = req.query;
    if (!isDate(from) || !isDate(to)) return res.status(422).json({ message: "Periode tidak valid." });
    // Jurnal otomatis: closing shift Final yang belum dijurnal langsung dibuatkan jurnalnya (tanpa tombol)
    try {
      await syncSetoran(from, to, req.user?.id || null);
    } catch (e) {
      console.warn("[getSetoran] jurnal otomatis gagal:", e.message);
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 10;
    const outlets = String(req.query.outlets || "").split(",").map(Number).filter(Boolean);
    const search = String(req.query.search || "").trim();

    // Jurnal setoran yang ada, diurutkan sesuai tanggal closing
    const w = ["je.source_type = ?", "je.entry_date >= ?", "je.entry_date <= ?", "je.reverses_entry_id IS NULL"];
    const p = [SOURCE, from, to];
    if (outlets.length) { w.push("je.outlet_id IN (?)"); p.push(outlets); }
    if (search) { w.push("(je.entry_no LIKE ? OR je.description LIKE ?)"); p.push(`%${search}%`, `%${search}%`); }
    const base = `FROM tr_journal_entries je WHERE ${w.join(" AND ")}`;
    const [[tot]] = await pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN je.status <> 'REVERSED' THEN je.total_amount END), 0) AS amt ${base}`, p);
    const [rows] = await pool.query(
      `SELECT je.id, je.entry_no, DATE_FORMAT(je.entry_date, '%Y-%m-%d') AS entry_date, je.description, je.status, je.total_amount, je.source_ref, je.outlet_id,
              je.reversed_by_entry_id,
              (SELECT SUM(jl.debit) FROM tr_journal_lines jl WHERE jl.entry_id = je.id) AS debit,
              (SELECT SUM(jl.credit) FROM tr_journal_lines jl WHERE jl.entry_id = je.id) AS credit
       ${base} ORDER BY je.entry_date DESC, je.id DESC LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit]
    );
    const shiftIds = rows.map((r) => Number(String(r.source_ref || "").replace("SHIFT-", ""))).filter(Boolean);
    const shiftBy = new Map();
    if (shiftIds.length) {
      const [sh] = await myWaschenPool.query(
        `SELECT s.id, s.shift_number, s.cashier_employee_id, s.closed_by_employee_id, s.closed_at, s.deposit_proof_url, o.name AS outlet_name
         FROM tr_cashier_shift s LEFT JOIN mst_outlet o ON o.id = s.outlet_id WHERE s.id IN (?)`,
        [shiftIds]
      );
      sh.forEach((s) => shiftBy.set(Number(s.id), s));
    }
    const names = await employeeNames([...shiftBy.values()].flatMap((s) => [s.cashier_employee_id, s.closed_by_employee_id]));

    // Closing shift yang belum punya jurnal (di periode yang sama)
    const fin = await finalShifts(from, to, outlets);
    const [haveAll] = fin.length ? await pool.query(`SELECT source_ref FROM tr_journal_entries WHERE source_type = ? AND source_ref IN (?)`, [SOURCE, fin.map((s) => refOf(s.id))]) : [[]];
    const haveSet = new Set(haveAll.map((r) => r.source_ref));
    const pending = fin.filter((s) => !haveSet.has(refOf(s.id))).length;

    return res.json({
      rows: rows.map((r) => {
        const s = shiftBy.get(Number(String(r.source_ref || "").replace("SHIFT-", "")));
        return {
          id: Number(r.id),
          entry_no: r.entry_no,
          date: r.entry_date,
          outlet_name: s?.outlet_name || "-",
          cashier: s ? names.get(Number(s.closed_by_employee_id)) || names.get(Number(s.cashier_employee_id)) || null : null,
          shift_number: s?.shift_number ?? null,
          description: r.description,
          debit: toFixed2(r.debit),
          credit: toFixed2(r.credit),
          status: r.status === "REVERSED" ? "Dikoreksi" : "Posted",
          reversed: r.status === "REVERSED",
          proof: assetUrl(s?.deposit_proof_url),
          has_proof: Boolean(s?.deposit_proof_url),
        };
      }),
      summary: { count: Number(tot.n), amount: toFixed2(tot.amt), pending },
      pagination: { page, limit, total: Number(tot.n), totalPages: Math.max(1, Math.ceil(Number(tot.n) / limit)) },
    });
  } catch (err) {
    console.error("[getSetoran]", err);
    return res.status(500).json({ message: "Gagal memuat jurnal setoran", error: err.message });
  }
}

// ── GET /pos/setoran/:id — rincian untuk modal edit ─────────────────────
export async function getSetoranDetail(req, res) {
  try {
    const id = Number(req.params.id);
    const [[je]] = await pool.query(`SELECT * FROM tr_journal_entries WHERE id = ? AND source_type = ?`, [id, SOURCE]);
    if (!je) return res.status(404).json({ message: "Jurnal setoran tidak ditemukan." });
    const [lines] = await pool.query(
      `SELECT jl.line_no, jl.account_id, a.code, a.name, jl.debit, jl.credit, jl.memo
       FROM tr_journal_lines jl JOIN mst_coa a ON a.id = jl.account_id WHERE jl.entry_id = ? ORDER BY jl.line_no`,
      [id]
    );
    const [accounts] = await pool.query(`SELECT id, code, name, type FROM mst_coa WHERE is_active = 1 AND is_header = 0 ORDER BY code`);
    return res.json({
      entry: { id, entry_no: je.entry_no, date: String(je.entry_date instanceof Date ? je.entry_date.toISOString() : je.entry_date).slice(0, 10), description: je.description, status: je.status, source_ref: je.source_ref, outlet_id: je.outlet_id },
      lines: lines.map((l) => ({ ...l, debit: toFixed2(l.debit), credit: toFixed2(l.credit) })),
      accounts,
    });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat rincian jurnal", error: err.message });
  }
}

// ── PUT /pos/setoran/:id {description, lines:[{account_id,debit,credit,memo}]} ──
// Jurnal yang sudah tercatat tidak diubah di tempat: dibuat jurnal balik, lalu jurnal baru yang benar (jejak audit utuh).
export async function koreksiSetoran(req, res) {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const actorId = req.user?.id || null;
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const description = String(req.body?.description || "").trim().slice(0, 500);
    if (lines.length < 2) return res.status(422).json({ message: "Jurnal minimal punya 2 baris." });
    const clean = lines.map((l) => ({ account_id: Number(l.account_id), debit: toFixed2(l.debit || 0), credit: toFixed2(l.credit || 0), memo: String(l.memo || "").slice(0, 255) }));
    if (clean.some((l) => !l.account_id || l.debit < 0 || l.credit < 0 || (l.debit > 0 && l.credit > 0) || (l.debit === 0 && l.credit === 0))) {
      return res.status(422).json({ message: "Setiap baris harus punya akun dan salah satu nominal (debit atau kredit) lebih dari 0." });
    }
    const td = toFixed2(clean.reduce((s, l) => s + l.debit, 0));
    const tc = toFixed2(clean.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(td - tc) > 0.001) return res.status(422).json({ message: `Jurnal tidak seimbang (debit ${td}, kredit ${tc}).` });
    const [acc] = await pool.query(`SELECT id FROM mst_coa WHERE id IN (?) AND is_active = 1 AND is_header = 0`, [[...new Set(clean.map((l) => l.account_id))]]);
    if (acc.length !== new Set(clean.map((l) => l.account_id)).size) return res.status(422).json({ message: "Ada akun yang tidak aktif atau akun induk." });

    await conn.beginTransaction();
    const [[orig]] = await conn.query(`SELECT * FROM tr_journal_entries WHERE id = ? AND source_type = ? FOR UPDATE`, [id, SOURCE]);
    if (!orig) { await conn.rollback(); return res.status(404).json({ message: "Jurnal setoran tidak ditemukan." }); }
    if (orig.status !== "POSTED") { await conn.rollback(); return res.status(422).json({ message: "Jurnal ini sudah dikoreksi sebelumnya. Buka versi terbarunya." }); }
    const date = String(orig.entry_date instanceof Date ? new Date(orig.entry_date.getTime() - orig.entry_date.getTimezoneOffset() * 60000).toISOString() : orig.entry_date).slice(0, 10);
    const lockMsg = await dayLockMessage(date, [orig.outlet_id]);
    if (lockMsg) { await conn.rollback(); return res.status(422).json({ message: lockMsg }); }

    const [origLines] = await conn.query(`SELECT * FROM tr_journal_lines WHERE entry_id = ? ORDER BY line_no`, [id]);
    const [[cnt]] = await conn.query(`SELECT COUNT(*) AS n FROM tr_journal_entries WHERE source_type = ? AND source_ref = ?`, [SOURCE, orig.source_ref]);
    const base = String(orig.entry_no).replace(/-(K|v)\d+$/, "");
    const revNo = `${base}-K${cnt.n}`; // jurnal balik
    const newNo = `${base}-v${Number(cnt.n) + 1}`; // jurnal yang benar

    const [rev] = await conn.query(
      `INSERT INTO tr_journal_entries (entry_no, entry_date, description, status, total_amount, reverses_entry_id, created_by, outlet_id, source_type, source_ref)
       VALUES (?, ?, ?, 'POSTED', ?, ?, ?, ?, 'SETORAN_KASIR', ?)`,
      [revNo, date, `Pembalik ${orig.entry_no}: ${orig.description}`, orig.total_amount, orig.id, actorId, orig.outlet_id, orig.source_ref]
    );
    for (let i = 0; i < origLines.length; i++) {
      const l = origLines[i];
      await conn.query(`INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [rev.insertId, i + 1, l.account_id, l.credit, l.debit, l.memo ? `[Pembalik] ${l.memo}` : null, l.outlet_id ?? null]);
    }
    await conn.query(`UPDATE tr_journal_entries SET status = 'REVERSED', reversed_by_entry_id = ? WHERE id = ?`, [rev.insertId, orig.id]);

    const [nw] = await conn.query(
      `INSERT INTO tr_journal_entries (entry_no, entry_date, description, status, total_amount, created_by, outlet_id, source_type, source_ref)
       VALUES (?, ?, ?, 'POSTED', ?, ?, ?, 'SETORAN_KASIR', ?)`,
      [newNo, date, description || orig.description, td, actorId, orig.outlet_id, orig.source_ref]
    );
    for (let i = 0; i < clean.length; i++) {
      const l = clean[i];
      await conn.query(`INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [nw.insertId, i + 1, l.account_id, l.debit, l.credit, l.memo || null, orig.outlet_id]);
    }
    try {
      await conn.query(`INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, before_value, after_value) VALUES ('tr_journal_entries', ?, 'UPDATE', ?, ?, ?)`, [
        orig.id, actorId, JSON.stringify({ entry_no: orig.entry_no, lines: origLines.map((l) => ({ a: l.account_id, d: l.debit, c: l.credit })) }), JSON.stringify({ entry_no: newNo, lines: clean }),
      ]);
    } catch (e) { console.warn("[koreksiSetoran] audit log gagal:", e.message); }
    await conn.commit();
    return res.json({ message: `Setoran dikoreksi. Jurnal baru ${newNo}.`, id: nw.insertId, entry_no: newNo });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[koreksiSetoran]", err);
    return res.status(500).json({ message: "Gagal mengoreksi jurnal setoran", error: err.message });
  } finally {
    conn.release();
  }
}
