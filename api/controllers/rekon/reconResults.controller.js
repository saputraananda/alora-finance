import { pool, myWaschenPool, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { loadAccountMap, autoPostDay } from "../pos/pos.controller.js";
import { loadOutletOverrides } from "../../utils/accountResolver.js";
import { lockDateMessage } from "../../utils/dayLock.js";
import { ACTIVE_MATCH } from "./reconWorkspace.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// HASIL REKONSILIASI (Account Receivable › Hasil Rekonsiliasi)
// Satu baris = satu pencocokan (Rekonsiliasi transaksi). Finance memilih baris lalu "Transfer to GL":
// satu jurnal REKONSILIASI per pencocokan, bertanggal mutasi bank.
//
//   Tunai (POS_CASH)      : Dr Bank · Cr Kas (Cr Kas Sentral bila sudah dijurnal Setoran Kasir)
//   QRIS/EDC (POS_ONLINE) : Dr Bank · Cr Piutang QRIS / Piutang EDC
//   Transfer nota (POS_TRF) & jurnal (JOURNAL): sudah masuk Bank lewat jurnal asalnya → tanpa jurnal baru,
//                           kecuali ada selisih yang dialokasikan (jurnal koreksi Bank).
//   Selisih kurang: Bank Charge → Beban MDR (QRIS/EDC) / Beban Administrasi Bank (lainnya); Piutang → Piutang Karyawan (tunai) / Piutang Usaha
//   Selisih lebih : Deposit → Deposit Member; Pelunasan → kredit piutang yang dilunasi
// ════════════════════════════════════════════════════════════════════════════

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const TOL = 0.5;
const ALLOC_LABEL = { BANK_CHARGE: "Bank Charge", PIUTANG: "Piutang", DEPOSIT: "Deposit", PELUNASAN: "Pelunasan kekurangan" };

// Muat pencocokan aktif + itemnya. filter: {from,to} (tanggal mutasi bank) atau {ids}
async function loadMatches({ from, to, ids }) {
  const where = ids ? `m.id IN (?)` : `EXISTS (SELECT 1 FROM tr_recon_match_item b JOIN tr_bank_statement s ON s.id = CAST(b.ref_key AS UNSIGNED) WHERE b.match_id = m.id AND b.side = 'BANK' AND s.trx_date BETWEEN ? AND ?)`;
  const [ms] = await pool.query(
    `SELECT m.id, m.bank_account_id, m.status, m.difference, m.explanation, m.alloc_type, m.alloc_party, m.alloc_ref_match_id, m.gl_journal_id,
            gj.entry_no AS gl_entry_no, gj.status AS gl_status
     FROM tr_recon_match m LEFT JOIN tr_journal_entries gj ON gj.id = m.gl_journal_id
     WHERE ${ACTIVE_MATCH} AND ${where} ORDER BY m.id DESC`,
    ids ? [ids] : [from, to]
  );
  if (!ms.length) return [];
  const [items] = await pool.query(
    `SELECT i.match_id, i.side, i.ref_type, i.ref_key, i.outlet_id, i.amount, i.counter_amount,
            s.trx_date, DATE_FORMAT(s.trx_date,'%Y-%m-%d') AS bank_date, s.description AS bank_desc, s.amount AS bank_amount, s.bank_account_id AS stmt_bank,
            sm.recon_code
     FROM tr_recon_match_item i
     LEFT JOIN tr_bank_statement s ON i.side = 'BANK' AND s.id = CAST(i.ref_key AS UNSIGNED)
     LEFT JOIN tr_bank_statement_meta sm ON sm.statement_id = s.id
     WHERE i.match_id IN (?) ORDER BY i.id`,
    [ms.map((m) => m.id)]
  ).catch(async (e) => {
    if (!/recon_code|statement_meta/.test(e.message)) throw e;
    return pool.query(
      `SELECT i.match_id, i.side, i.ref_type, i.ref_key, i.outlet_id, i.amount, i.counter_amount,
              s.trx_date, DATE_FORMAT(s.trx_date,'%Y-%m-%d') AS bank_date, s.description AS bank_desc, s.amount AS bank_amount, s.bank_account_id AS stmt_bank, NULL AS recon_code
       FROM tr_recon_match_item i LEFT JOIN tr_bank_statement s ON i.side = 'BANK' AND s.id = CAST(i.ref_key AS UNSIGNED)
       WHERE i.match_id IN (?) ORDER BY i.id`,
      [ms.map((m) => m.id)]
    );
  });
  const by = new Map(ms.map((m) => [m.id, { ...m, bank: [], internal: [] }]));
  items.forEach((it) => {
    const m = by.get(it.match_id);
    if (!m) return;
    (it.side === "BANK" ? m.bank : m.internal).push(it);
  });
  return [...by.values()];
}

// Detail nota transfer (POS_TRF = id log pembayaran POS) dan baris jurnal (JOURNAL = id baris jurnal)
async function loadRefs(matches) {
  const trfIds = [...new Set(matches.flatMap((m) => m.internal.filter((i) => i.ref_type === "POS_TRF").map((i) => Number(i.ref_key))))];
  const jlIds = [...new Set(matches.flatMap((m) => m.internal.filter((i) => i.ref_type === "JOURNAL").map((i) => Number(i.ref_key))))];
  const trf = new Map();
  const jl = new Map();
  if (trfIds.length) {
    const [r] = await myWaschenPool.query(
      `SELECT l.id, t.order_no, t.outlet_id, DATE_FORMAT(l.created_at,'%Y-%m-%d') AS d FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id WHERE l.id IN (?)`,
      [trfIds]
    );
    r.forEach((x) => trf.set(Number(x.id), x));
  }
  if (jlIds.length) {
    const [r] = await pool.query(`SELECT jl.id, je.id AS jid, je.entry_no, DATE_FORMAT(je.entry_date,'%Y-%m-%d') AS d FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id WHERE jl.id IN (?)`, [jlIds]);
    r.forEach((x) => jl.set(Number(x.id), x));
  }
  return { trf, jl };
}

// Hitung tampilan + jurnal tiap pencocokan
async function buildResults(matches) {
  if (!matches.length) return [];
  const [outlets, accMap, ov, refs] = await Promise.all([getOutlets(), loadAccountMap(), loadOutletOverrides(), loadRefs(matches)]);
  const oname = new Map(outlets.map((o) => [Number(o.id), o.name]));
  const [banks] = await pool.query(`SELECT b.id, b.bank_name, b.account_no, b.account_id, a.code, a.name FROM mst_bank_account b LEFT JOIN mst_coa a ON a.id = b.account_id`);
  const bankOf = new Map(banks.map((b) => [Number(b.id), b]));

  // Hari (cabang|tanggal) yang jurnal penjualan POS-nya sudah ada, dan jurnal Setoran Kasir per hari
  const days = new Set();
  matches.forEach((m) => m.internal.forEach((i) => {
    if (i.ref_type === "POS_CASH" || i.ref_type === "POS_ONLINE") days.add(String(i.ref_key).split("|").slice(0, 2).join("|"));
  }));
  const posted = new Set();
  const posNo = new Map();
  const setoran = new Map();
  if (days.size) {
    const dates = [...new Set([...days].map((k) => k.split("|")[1]))];
    const [pr] = await pool.query(
      `SELECT b.outlet_id, DATE_FORMAT(b.batch_date,'%Y-%m-%d') AS d, je.id AS jid, je.entry_no FROM tr_pos_batch b JOIN tr_journal_entries je ON je.id = b.journal_id AND je.status = 'POSTED' WHERE b.batch_date IN (?)`,
      [dates]
    );
    pr.forEach((r) => { posted.add(`${r.outlet_id}|${r.d}`); posNo.set(`${r.outlet_id}|${r.d}`, { id: r.jid, no: r.entry_no }); });
    const [sr] = await pool.query(
      `SELECT outlet_id, DATE_FORMAT(entry_date,'%Y-%m-%d') AS d, SUM(total_amount) AS amt FROM tr_journal_entries
       WHERE source_type = 'SETORAN_KASIR' AND status = 'POSTED' AND reverses_entry_id IS NULL AND entry_date IN (?) GROUP BY outlet_id, d`,
      [dates]
    ).catch(() => [[]]);
    sr.forEach((r) => setoran.set(`${r.outlet_id}|${r.d}`, Number(r.amt)));
  }
  // Jurnal POS untuk nota transfer (tanggal bayar nota)
  const trfDays = [...new Set([...refs.trf.values()].map((t) => t.d))];
  if (trfDays.length) {
    const [pr] = await pool.query(
      `SELECT b.outlet_id, DATE_FORMAT(b.batch_date,'%Y-%m-%d') AS d, je.id AS jid, je.entry_no FROM tr_pos_batch b JOIN tr_journal_entries je ON je.id = b.journal_id AND je.status = 'POSTED' WHERE b.batch_date IN (?)`,
      [trfDays]
    );
    pr.forEach((r) => { posted.add(`${r.outlet_id}|${r.d}`); posNo.set(`${r.outlet_id}|${r.d}`, { id: r.jid, no: r.entry_no }); });
  }
  // Jenis baris yang dilunasi (untuk Pelunasan)
  const refIds = [...new Set(matches.map((m) => Number(m.alloc_ref_match_id)).filter(Boolean))];
  const refKind = new Map();
  if (refIds.length) {
    const [rt] = await pool.query(`SELECT match_id, MIN(ref_type) AS t FROM tr_recon_match_item WHERE match_id IN (?) AND side = 'INTERNAL' GROUP BY match_id`, [refIds]);
    rt.forEach((r) => refKind.set(Number(r.match_id), r.t));
  }
  const setoranLeft = new Map(setoran);
  const out = [];

  for (const m of [...matches].sort((a, b) => a.id - b.id)) {
    const bankDate = m.bank.map((b) => b.bank_date).filter(Boolean).sort().pop() || null;
    const bankTotal = toFixed2(m.bank.reduce((s, b) => s + Math.abs(Number(b.amount)), 0));
    const outDir = m.bank.some((b) => Number(b.bank_amount) < 0);
    const firstOutlet = m.internal.find((i) => i.outlet_id)?.outlet_id || null;
    const bacc = bankOf.get(Number(m.bank_account_id)) || null;
    const internal = m.internal.map((i) => {
      const parts = String(i.ref_key).split("|");
      if (i.ref_type === "POS_CASH") return { type: i.ref_type, label: `Penjualan tunai ${parts[1]}`, method: "Tunai", date: parts[1], outlet_id: Number(parts[0]), amount: toFixed2(i.amount) };
      if (i.ref_type === "POS_ONLINE") return { type: i.ref_type, label: `Penjualan ${parts[2]} ${parts[1]}`, method: parts[2], date: parts[1], outlet_id: Number(parts[0]), amount: toFixed2(i.amount) };
      if (i.ref_type === "POS_TRF") { const t = refs.trf.get(Number(i.ref_key)); return { type: i.ref_type, label: `Nota ${t?.order_no || i.ref_key}`, method: "Transfer", date: t?.d || null, outlet_id: Number(t?.outlet_id || i.outlet_id) || null, amount: toFixed2(i.amount) }; }
      if (i.ref_type === "JOURNAL") { const j = refs.jl.get(Number(i.ref_key)); return { type: i.ref_type, journal: j ? { id: j.jid, no: j.entry_no } : null, label: `Jurnal ${j?.entry_no || i.ref_key}`, method: "Jurnal", date: j?.d || null, outlet_id: Number(i.outlet_id) || null, amount: toFixed2(i.amount) }; }
      return { type: i.ref_type, label: `${i.ref_type} ${i.ref_key}`, method: "-", date: null, outlet_id: Number(i.outlet_id) || null, amount: toFixed2(i.amount) };
    });
    const internalTotal = toFixed2(internal.reduce((s, i) => s + i.amount, 0));
    const diff = toFixed2(bankTotal - internalTotal); // + bank lebih, − bank kurang
    const methods = [...new Set(internal.map((i) => i.method))];
    const onlineOnly = internal.length && internal.every((i) => i.type === "POS_ONLINE");
    const cashOnly = internal.length && internal.every((i) => i.type === "POS_CASH");
    const viaSource = internal.every((i) => i.type === "POS_TRF" || i.type === "JOURNAL");
    const statusLabel = m.status === "DIFF" || Math.abs(diff) > TOL ? "Difference" : "Matched";

    const blockers = [];
    const lines = [];
    const acc = ov.forOutlet(firstOutlet, accMap);
    const need = (role) => {
      const a = role === "BANK" && bacc?.account_id ? { account_id: bacc.account_id, code: bacc.code, name: bacc.name } : acc[role];
      if (!a?.account_id) { if (!blockers.some((b) => b.includes(role))) blockers.push(`Pemetaan akun belum lengkap: ${role}.`); return null; }
      return a;
    };
    const add = (role, debit, credit, memo, outlet = firstOutlet) => {
      if (debit < 0) { credit = -debit; debit = 0; } else if (credit < 0) { debit = -credit; credit = 0; }
      if (debit > 0.004 || credit > 0.004) lines.push({ role, account: need(role), debit: toFixed2(debit), credit: toFixed2(credit), memo, outlet_id: outlet || null });
    };

    // Alokasi selisih
    let alloc = m.alloc_type || null;
    if (Math.abs(diff) > TOL && !alloc && onlineOnly && m.explanation && diff < 0) alloc = "BANK_CHARGE"; // lama: selisih QRIS/EDC dijelaskan = MDR
    if (Math.abs(diff) > TOL) {
      if (!alloc) blockers.push("Selisih belum dialokasikan. Alokasikan di Rekonsiliasi transaksi (mis. Bank Charge atau Piutang).");
      else if (diff < 0 && !["BANK_CHARGE", "PIUTANG"].includes(alloc)) blockers.push("Alokasi tidak sesuai: bank menerima lebih sedikit.");
      else if (diff > 0 && !["DEPOSIT", "PELUNASAN"].includes(alloc)) blockers.push("Alokasi tidak sesuai: bank menerima lebih banyak.");
    }
    if (outDir && Math.abs(diff) > TOL) blockers.push("Selisih pada pengeluaran bank: koreksi lewat jurnal manual.");
    // Jurnal penjualan POS harus sudah ada
    for (const i of internal) {
      if ((i.type === "POS_CASH" || i.type === "POS_ONLINE" || i.type === "POS_TRF") && i.date && i.outlet_id && !posted.has(`${i.outlet_id}|${i.date}`)) {
        blockers.push(`Jurnal penjualan POS ${oname.get(i.outlet_id) || ""} ${i.date} belum terbentuk. Cek di Front Office Cashier › Status Sinkron POS.`);
        break;
      }
    }

    if (!blockers.length && !outDir) {
      const viaTotal = toFixed2(internal.filter((i) => i.type === "POS_TRF" || i.type === "JOURNAL").reduce((s, i) => s + i.amount, 0));
      add("BANK", toFixed2(bankTotal - viaTotal), 0, "Uang masuk rekening");
      if (diff < -TOL) {
        const role = alloc === "BANK_CHARGE" ? (onlineOnly ? "BEBAN_MDR" : "BEBAN_ADMIN_BANK") : cashOnly ? "PIUTANG_KARYAWAN" : "PIUTANG_USAHA";
        add(role, -diff, 0, alloc === "BANK_CHARGE" ? (onlineOnly ? "MDR / biaya bank" : "Biaya bank") : `Kekurangan${m.alloc_party ? `, piutang ${m.alloc_party}` : ""}`);
      }
      for (const i of internal) {
        if (i.type === "POS_CASH") {
          const k = `${i.outlet_id}|${i.date}`;
          const viaSet = Math.min(setoranLeft.get(k) || 0, i.amount);
          if (viaSet > 0) setoranLeft.set(k, (setoranLeft.get(k) || 0) - viaSet);
          add("KAS_SENTRAL", 0, viaSet, `Setoran kasir ${i.date} diterima di bank`, i.outlet_id);
          add("KAS", 0, toFixed2(i.amount - viaSet), `Kas penjualan tunai ${i.date}`, i.outlet_id);
        } else if (i.type === "POS_ONLINE") {
          add(i.method === "QRIS" ? "PIUTANG_QRIS" : "PIUTANG_EDC", 0, i.amount, `Pelunasan piutang ${i.method} ${i.date}`, i.outlet_id);
        }
      }
      if (diff > TOL) {
        const role = alloc === "DEPOSIT" ? "DEPOSIT_MEMBER" : refKind.get(Number(m.alloc_ref_match_id)) === "POS_CASH" ? "PIUTANG_KARYAWAN" : "PIUTANG_USAHA";
        add(role, 0, diff, alloc === "DEPOSIT" ? "Kelebihan disimpan sebagai deposit" : "Pelunasan kekurangan sebelumnya");
      }
      if (viaSource && Math.abs(diff) <= TOL) lines.length = 0; // nota transfer / jurnal tanpa selisih: tidak ada yang dipindahkan
    }
    if (!blockers.length && bankDate) {
      const lockMsg = await lockDateMessage(bankDate);
      if (lockMsg) blockers.push(lockMsg);
    }
    const debit = toFixed2(lines.reduce((s, l) => s + l.debit, 0));
    const credit = toFixed2(lines.reduce((s, l) => s + l.credit, 0));
    if (lines.length && Math.abs(debit - credit) > 0.01) blockers.push("Jurnal tidak seimbang. Periksa nominal pencocokan.");

    const done = m.gl_journal_id && m.gl_status === "POSTED";
    let state = done ? "DONE" : blockers.length ? "BLOCKED" : lines.length ? "READY" : "VIA_SOURCE";
    const srcNo = viaSource
      ? internal.map((i) => (i.type === "POS_TRF" ? posNo.get(`${i.outlet_id}|${i.date}`) : i.type === "JOURNAL" ? i.journal : null)).filter(Boolean)
      : [];
    out.push({
      match_id: m.id,
      date: bankDate,
      outlet_id: firstOutlet,
      outlet_name: firstOutlet ? oname.get(Number(firstOutlet)) || `Outlet #${firstOutlet}` : "Pusat",
      method: methods.join(", "),
      methods,
      internal,
      bank: m.bank.map((b) => ({ date: b.bank_date, description: b.bank_desc, amount: toFixed2(Math.abs(Number(b.amount))), recon_code: b.recon_code || null })),
      bank_label: bacc ? `${bacc.bank_name} ${bacc.account_no}` : null,
      internal_total: internalTotal,
      bank_total: bankTotal,
      diff,
      alloc: alloc ? { type: alloc, label: ALLOC_LABEL[alloc], party: m.alloc_party || null } : null,
      status: statusLabel,
      state,
      journal_no: done ? m.gl_entry_no : null,
      journal_id: done ? m.gl_journal_id : null,
      source_journals: [...new Map(srcNo.map((j) => [j.id, j])).values()],
      blockers: done ? [] : blockers,
      lines: lines.map((l) => ({ account_id: l.account?.account_id || null, account_code: l.account?.code || null, account_name: l.account?.name || l.role, debit: l.debit, credit: l.credit, memo: l.memo, outlet_id: l.outlet_id })),
    });
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.match_id - a.match_id);
}

// ── GET /rekon/results?from=&to=&outlet=&method=&status=&gl= ─────────────
export async function getResults(req, res) {
  try {
    const { from, to } = req.query;
    if (!isDate(from) || !isDate(to) || from > to) return res.status(422).json({ message: "Periode tidak valid." });
    const matches = await loadMatches({ from, to });
    let rows = await buildResults(matches);
    // Jurnal penjualan POS belum ada untuk hari yang dibutuhkan → jurnalkan otomatis (hari lampau saja), lalu hitung ulang
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    const need = [...new Set(rows.filter((r) => r.blockers.some((b) => b.startsWith("Jurnal penjualan POS"))).flatMap((r) => r.internal.map((i) => i.date)).filter((d) => d && d < today))].slice(0, 31);
    if (need.length) {
      let posted = 0;
      for (const d of need) {
        try { posted += (await autoPostDay(d, req.user?.id || null)).posted; } catch (e) { console.warn("[getResults] jurnal POS otomatis gagal:", d, e.message); }
      }
      if (posted) rows = await buildResults(matches);
    }
    const all = rows;
    const outlet = req.query.outlet ? Number(req.query.outlet) : null;
    const methods = String(req.query.method || "").split(",").filter(Boolean);
    const status = String(req.query.status || "");
    const gl = String(req.query.gl || "");
    if (outlet) rows = rows.filter((r) => Number(r.outlet_id) === outlet);
    if (methods.length) rows = rows.filter((r) => r.methods.some((m) => methods.includes(m)));
    if (status) rows = rows.filter((r) => r.status === status);
    if (gl === "BELUM") rows = rows.filter((r) => r.state === "READY" || r.state === "BLOCKED");
    else if (gl === "SUDAH") rows = rows.filter((r) => r.state === "DONE" || r.state === "VIA_SOURCE");
    const count = (st) => all.filter((r) => st.includes(r.state)).length;
    return res.json({ data: rows, summary: { total: all.length, ready: count(["READY"]), blocked: count(["BLOCKED"]), done: count(["DONE", "VIA_SOURCE"]) } });
  } catch (err) {
    console.error("[getResults]", err);
    return res.status(500).json({ message: "Gagal memuat hasil rekonsiliasi", error: err.message });
  }
}

// ── POST /rekon/results/transfer {match_ids:[...]} — satu jurnal per pencocokan ────────
export async function transferResults(req, res) {
  const ids = [...new Set((Array.isArray(req.body?.match_ids) ? req.body.match_ids : []).map(Number).filter(Boolean))];
  if (!ids.length) return res.status(422).json({ message: "Pilih minimal satu hasil rekonsiliasi." });
  if (ids.length > 300) return res.status(422).json({ message: "Maksimal 300 baris sekali transfer." });
  const actor = req.user?.id || null;
  try {
    const rows = await buildResults(await loadMatches({ ids }));
    const results = [];
    for (const id of ids) {
      const r = rows.find((x) => x.match_id === id);
      if (!r) { results.push({ match_id: id, ok: false, message: "Pencocokan tidak ditemukan atau sudah dibatalkan." }); continue; }
      if (r.state === "DONE") { results.push({ match_id: id, ok: false, message: `Sudah di GL (${r.journal_no}).` }); continue; }
      if (r.state === "VIA_SOURCE") { results.push({ match_id: id, ok: false, message: "Tidak perlu jurnal: sudah masuk GL lewat jurnal asalnya." }); continue; }
      if (r.state === "BLOCKED") { results.push({ match_id: id, ok: false, message: r.blockers[0] }); continue; }
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [[lock]] = await conn.query(`SELECT m.gl_journal_id, je.status FROM tr_recon_match m LEFT JOIN tr_journal_entries je ON je.id = m.gl_journal_id WHERE m.id = ? FOR UPDATE`, [id]).then(([x]) => [x]);
        if (lock?.gl_journal_id && lock.status === "POSTED") { await conn.rollback(); results.push({ match_id: id, ok: false, message: "Sudah di GL." }); continue; }
        const base = `JU-REK-M${id}`;
        const [[cnt]] = await conn.query(`SELECT COUNT(*) AS n FROM tr_journal_entries WHERE source_ref = ?`, [`MATCH-${id}`]).then(([x]) => [x]);
        const entryNo = cnt.n ? `${base}-v${cnt.n + 1}` : base;
        const total = toFixed2(r.lines.reduce((s, l) => s + l.debit, 0));
        const desc = `Rekonsiliasi ${r.outlet_name} — ${r.internal.map((i) => i.label).join(", ")}`.slice(0, 500);
        const [h] = await conn.query(
          `INSERT INTO tr_journal_entries (entry_no, entry_date, description, status, total_amount, created_by, source_type, source_ref, outlet_id, approved_by, approved_at)
           VALUES (?, ?, ?, 'POSTED', ?, ?, 'REKONSILIASI', ?, ?, ?, NOW())`,
          [entryNo, r.date, desc, total, actor, `MATCH-${id}`, r.outlet_id || null, actor]
        );
        for (let n = 0; n < r.lines.length; n++) {
          const l = r.lines[n];
          await conn.query(`INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [h.insertId, n + 1, l.account_id, l.debit, l.credit, String(l.memo || "").slice(0, 200), l.outlet_id]);
        }
        await conn.query(`UPDATE tr_recon_match SET gl_journal_id = ?, gl_at = NOW(), gl_by = ? WHERE id = ?`, [h.insertId, actor, id]);
        await conn.query(`INSERT INTO tr_recon_history (action, ref_type, ref_key, detail, user_id) VALUES ('APPROVE', 'MATCH', ?, ?, ?)`, [String(id), `Pencocokan #${id} ditransfer ke General Ledger (${entryNo})`, actor]);
        try {
          await conn.query(`INSERT INTO tr_audit_logs (entity, entity_id, action, actor_id, after_value) VALUES ('tr_journal_entries', ?, 'CREATE', ?, ?)`, [h.insertId, actor, JSON.stringify({ entry_no: entryNo, source: "REKONSILIASI", match_id: id })]);
        } catch { /* audit tidak menggagalkan */ }
        await conn.commit();
        results.push({ match_id: id, ok: true, entry_no: entryNo, message: `Ditransfer (${entryNo}).` });
      } catch (err) {
        await conn.rollback().catch(() => {});
        console.error("[transferResults]", err);
        results.push({ match_id: id, ok: false, message: `Gagal: ${err.message}` });
      } finally {
        conn.release();
      }
    }
    const okN = results.filter((x) => x.ok).length;
    const bad = results.length - okN;
    return res.status(okN ? 200 : 422).json({
      message: okN ? `${okN} hasil rekonsiliasi ditransfer ke General Ledger${bad ? `, ${bad} gagal` : ""}.` : results[0]?.message || "Tidak ada yang ditransfer.",
      done: okN, failed: bad, results,
    });
  } catch (err) {
    console.error("[transferResults]", err);
    return res.status(500).json({ message: "Gagal mentransfer ke General Ledger", error: err.message });
  }
}
