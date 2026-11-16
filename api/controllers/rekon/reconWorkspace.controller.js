import { pool, mainPool, myWaschenPool, getOutlets } from "../../db/pool.js";

// ════════════════════════════════════════════════════════════════════════════
// REKONSILIASI TRANSAKSI — ruang kerja dua panel
//   Kiri  : transaksi internal, SATU baris per transaksi (tahap sebelumnya ada di `children`):
//           POS_CASH (tunai per cabang per hari) · POS_TRF (transfer) · POS_ONLINE (QRIS/EDC per cabang per hari) ·
//           JOURNAL (jurnal penerimaan/pengeluaran).
//   Kanan : mutasi bank hasil import.
//   Pencocokan disimpan di tr_recon_match(+item); tidak mengubah jurnal, POS, atau data sumber. Membatalkan = menandai batal.
//   Data POS hanya dibaca. Jurnal TIDAK dibuat di sini (jurnal harian tetap dibuat saat Rekonsiliasi Harian disetujui).
// ════════════════════════════════════════════════════════════════════════════

const TOL = 1; // toleransi pembulatan (Rp)
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const near = (a, b) => Math.abs(a - b) <= TOL;
const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const yymmdd = (d) => d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);
const LOG_WHERE = `l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY) AND l.log_type IN ('DP','Lunas','Pelunasan') AND t.is_delete_requested = 0`;

async function outletMap() {
  const [r] = await myWaschenPool.query(`SELECT id, name, outlet_code FROM mst_outlet`);
  return new Map(r.map((o) => [Number(o.id), { name: o.name, code: o.outlet_code || String(o.id) }]));
}

// ── Transaksi internal (satu baris per transaksi) ──────────────────────────
export async function buildInternal({ from, to, outletId = null, bankAccountId = null }) {
  const outlets = await outletMap();
  const oc = outletId ? " AND t.outlet_id = ?" : "";
  const op = outletId ? [outletId] : [];
  const [[cashRows], [trfRows], [onlineRows]] = await Promise.all([
    myWaschenPool.query(
      `SELECT t.outlet_id, DATE_FORMAT(l.created_at,'%Y-%m-%d') AS d, SUM(l.amount) AS amount, COUNT(DISTINCT t.id) AS notes
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
       WHERE ${LOG_WHERE} AND l.payment_method LIKE 'Tunai%'${oc} GROUP BY t.outlet_id, d`,
      [from, to, ...op]
    ),
    myWaschenPool.query(
      `SELECT l.id, t.outlet_id, DATE_FORMAT(l.created_at,'%Y-%m-%d') AS d, t.order_no, l.amount, c.name AS customer
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id LEFT JOIN mst_customer c ON c.id = t.customer_id
       WHERE ${LOG_WHERE} AND l.payment_method LIKE 'Transfer%'${oc}`,
      [from, to, ...op]
    ),
    myWaschenPool.query(
      `SELECT t.outlet_id, DATE_FORMAT(l.created_at,'%Y-%m-%d') AS d, IF(l.payment_method LIKE 'QRIS%','QRIS','EDC') AS method,
              SUM(l.amount) AS amount, COUNT(DISTINCT t.id) AS notes
       FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id
       WHERE ${LOG_WHERE} AND (l.payment_method LIKE 'QRIS%' OR l.payment_method LIKE 'EDC%')${oc} GROUP BY t.outlet_id, d, method`,
      [from, to, ...op]
    ),
  ]);
  const oname = (id) => outlets.get(Number(id))?.name || `Outlet #${id}`;
  const ocode = (id) => outlets.get(Number(id))?.code || String(id);
  const items = [];

  cashRows.forEach((r) => {
    items.push({
      ref_type: "POS_CASH", ref_key: `${r.outlet_id}|${r.d}`, date: r.d, ref: `POS-TUNAI-${ocode(r.outlet_id)}-${yymmdd(r.d)}`, outlet_id: Number(r.outlet_id), outlet_name: oname(r.outlet_id),
      desc: `Penjualan tunai ${r.d.slice(8, 10)}/${r.d.slice(5, 7)} · ${r.notes} nota (POS, hanya baca)`, method: "Tunai", dir: "IN", amount: round2(r.amount), source: "POS (hanya baca)", children: [],
    });
  });
  trfRows.forEach((r) => {
    items.push({
      ref_type: "POS_TRF", ref_key: String(r.id), date: r.d, ref: r.order_no, outlet_id: Number(r.outlet_id), outlet_name: oname(r.outlet_id),
      desc: `Transfer pelanggan${r.customer ? ` — ${r.customer}` : ""}`, method: "Transfer", dir: "IN", amount: round2(r.amount), source: "POS (hanya baca)", children: [], customer: r.customer || null,
    });
  });
  // QRIS/EDC: satu baris per cabang per hari per metode. Uang bank biasanya lebih kecil (potongan MDR); selisihnya dijelaskan saat mencocokkan.
  onlineRows.forEach((r) => {
    items.push({
      ref_type: "POS_ONLINE", ref_key: `${r.outlet_id}|${r.d}|${r.method}`, date: r.d, ref: `POS-${r.method}-${ocode(r.outlet_id)}-${yymmdd(r.d)}`, outlet_id: Number(r.outlet_id), outlet_name: oname(r.outlet_id),
      desc: `Penjualan ${r.method} ${r.d.slice(8, 10)}/${r.d.slice(5, 7)} · ${r.notes} transaksi (POS, hanya baca)`, method: r.method, dir: "IN", amount: round2(r.amount), source: "POS (hanya baca)", children: [],
    });
  });

  // Jurnal penerimaan/pengeluaran pada akun bank rekening ini. Jurnal POS & Rekonsiliasi dikecualikan (sudah terwakili POS),
  // begitu juga baris yang sudah dicocokkan lewat pencocokan jurnal lama.
  if (bankAccountId) {
    const [[bank]] = await pool.query(`SELECT account_id, outlet_id FROM mst_bank_account WHERE id = ?`, [bankAccountId]).then(([r]) => [r.length ? r : [null]]);
    if (bank?.account_id) {
      const [jr] = await pool.query(
        `SELECT jl.id, je.entry_no, DATE_FORMAT(je.entry_date,'%Y-%m-%d') AS d, je.description, jl.memo, jl.debit, jl.credit, jl.outlet_id, je.source_type
         FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id
         LEFT JOIN tr_bank_match m ON m.journal_line_id = jl.id
         WHERE je.status IN ('POSTED','REVERSED') AND jl.account_id = ? AND m.journal_line_id IS NULL
           AND je.source_type NOT IN ('POS','REKONSILIASI','SALDO_AWAL') AND je.entry_date BETWEEN ? AND ?${outletId ? " AND jl.outlet_id = ?" : ""}`,
        outletId ? [bank.account_id, from, to, outletId] : [bank.account_id, from, to]
      );
      jr.forEach((j) => {
        const out = Number(j.credit) > 0;
        items.push({
          ref_type: "JOURNAL", ref_key: String(j.id), date: j.d, ref: j.entry_no, outlet_id: j.outlet_id ? Number(j.outlet_id) : null, outlet_name: j.outlet_id ? oname(j.outlet_id) : "Pusat",
          desc: (j.memo || j.description || "").slice(0, 160), method: "Transfer", dir: out ? "OUT" : "IN", amount: round2(Math.abs(Number(j.debit) - Number(j.credit))),
          source: out ? "Jurnal pengeluaran" : "Jurnal penerimaan", children: [], journal_source: j.source_type,
        });
      });
    }
  }
  return items;
}

// ── Pemakaian (pencocokan aktif) ───────────────────────────────────────────
async function loadUsage(conn = pool) {
  const [rows] = await conn.query(
    `SELECT i.side, i.ref_type, i.ref_key, i.match_id, i.amount, i.counter_amount, i.category_code, i.category_label, m.status, m.difference, m.explanation, m.bank_account_id
     FROM tr_recon_match_item i JOIN tr_recon_match m ON m.id = i.match_id AND m.undone_at IS NULL`
  );
  const map = new Map();
  rows.forEach((r) => {
    const k = `${r.ref_type}:${r.ref_key}`;
    const u = map.get(k) || { used: 0, counter: 0, matches: [], category_label: null, diff: false, explained: false };
    u.used = round2(u.used + Number(r.amount));
    u.counter = round2(u.counter + Number(r.counter_amount));
    u.matches.push(r.match_id);
    if (r.category_label) u.category_label = r.category_label;
    if (r.status === "DIFF") {
      u.diff = true;
      if (r.explanation) u.explained = true;
    }
    map.set(k, u);
  });
  return map;
}

function internalStatus(it, u, approvedDays) {
  if (u && u.used >= it.amount - TOL) {
    if (u.diff) return u.explained ? "Explained" : "Difference";
    if ((it.ref_type === "POS_CASH" || it.ref_type === "POS_ONLINE") && approvedDays.has(`${it.outlet_id}|${it.date}`)) return "Reviewed";
    return "Matched";
  }
  if (u && u.used > 0) return "Partial";
  if (it.ref_type === "JOURNAL") return "Unmatched";
  return "PendingBank";
}

function bankStatus(abs, u, legacy) {
  if (legacy) return "Matched";
  if (u && u.used >= abs - TOL) return u.diff ? (u.explained ? "Explained" : "Difference") : "Matched";
  if (u && u.used > 0) return "Partial";
  return "Unmatched";
}

async function approvedDaySet(from, to) {
  const [rows] = await pool.query(`SELECT outlet_id, DATE_FORMAT(rec_date,'%Y-%m-%d') AS d FROM tr_recon_daily WHERE status = 'APPROVED' AND rec_date BETWEEN ? AND ?`, [from, to]);
  return new Set(rows.map((r) => `${r.outlet_id}|${r.d}`));
}

const range = (q) => {
  const to = isDate(q.to) ? q.to : new Date().toISOString().slice(0, 10);
  const from = isDate(q.from) ? q.from : addDays(to, -30);
  return { from, to };
};
const matchText = (it, q) => !q || `${it.ref} ${it.desc} ${it.outlet_name} ${it.amount}`.toLowerCase().includes(String(q).trim().toLowerCase());

// ── Kandidat pasangan (rekomendasi) ────────────────────────────────────────
const KW = {
  Tunai: /(setor|setoran|tunai|cash|cdm|tarik)/i,
  QRIS: /qris|qr\b/i,
  EDC: /edc|kartu|debit card/i,
  Transfer: /(trsf|trf|transfer|e-?banking|atm|bi-?fast)/i,
};
function scoreOne(bankRow, it) {
  const reasons = [];
  let score = 0;
  const abs = Math.abs(bankRow.amount);
  if (near(it.remaining, abs)) {
    score += 45;
    reasons.push("nominal sama");
  }
  const bd = bankRow.date;
  const ref = it.date;
  const gap = Math.abs(dayDiff(bd, ref));
  score += gap === 0 ? 20 : gap === 1 ? 16 : gap === 2 ? 12 : gap <= 4 ? 8 : gap <= 7 ? 4 : 0;
  if (gap <= 2) reasons.push(gap === 0 ? "tanggal sama" : `selisih ${gap} hari`);
  const text = `${bankRow.description} ${bankRow.description_full || ""} ${bankRow.source_payment_category || ""} ${bankRow.source_recon_code || ""}`.toLowerCase();
  if (KW[it.method]?.test(text)) {
    score += 12;
    reasons.push(`kata "${it.method}"`);
  }
  const oname = String(it.outlet_name || "").toLowerCase();
  if (oname && oname !== "pusat") {
    const toks = oname.split(/\s+/).filter((t) => t.length >= 3);
    if (toks.some((t) => text.includes(t))) {
      score += 14;
      reasons.push("nama cabang");
    }
  }
  if (it.customer) {
    const toks = it.customer.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    if (toks.some((t) => text.includes(t))) {
      score += 16;
      reasons.push("nama pelanggan");
    }
  }
  if (it.ref && text.includes(String(it.ref).toLowerCase())) {
    score += 20;
    reasons.push("nomor referensi");
  }
  return { score: Math.min(100, score), reasons };
}

function candidatesFor(bankRow, pool_) {
  const abs = Math.abs(bankRow.amount);
  const dir = bankRow.amount >= 0 ? "IN" : "OUT";
  const cand = pool_.filter((it) => it.dir === dir && it.matchable && it.remaining > TOL && Math.abs(dayDiff(bankRow.date, it.date)) <= 10);
  const out = [];
  cand.forEach((it) => {
    if (near(it.remaining, abs)) {
      const s = scoreOne(bankRow, it);
      out.push({ items: [{ ref_type: it.ref_type, ref_key: it.ref_key }], score: s.score, reasons: s.reasons });
    } else if (it.ref_type === "POS_ONLINE" && abs < it.remaining && (it.remaining - abs) / it.remaining <= 0.03) {
      // QRIS/EDC: bank menerima sedikit lebih kecil (potongan MDR). Skor dibatasi di bawah ambang Auto match karena butuh penjelasan selisih.
      const s = scoreOne(bankRow, it);
      const pct = round2(((it.remaining - abs) / it.remaining) * 100);
      out.push({ items: [{ ref_type: it.ref_type, ref_key: it.ref_key }], score: Math.min(80, s.score + 25), reasons: [...s.reasons, `selisih ${pct}% (mirip potongan MDR)`] });
    }
  });
  // Satu setoran menutup beberapa hari penjualan tunai di cabang yang sama (maks. 4 hari)
  if (dir === "IN" && KW.Tunai.test(`${bankRow.description} ${bankRow.description_full || ""}`)) {
    const byOutlet = new Map();
    cand.filter((it) => it.ref_type === "POS_CASH").forEach((it) => byOutlet.set(it.outlet_id, [...(byOutlet.get(it.outlet_id) || []), it]));
    byOutlet.forEach((list) => {
      list.sort((a, b) => a.date.localeCompare(b.date));
      const n = Math.min(list.length, 12);
      for (let size = 2; size <= Math.min(4, n); size++) {
        const rec = (start, picked, sum) => {
          if (picked.length === size) {
            if (near(sum, abs)) {
              const s = scoreOne(bankRow, picked[picked.length - 1]);
              out.push({ items: picked.map((p) => ({ ref_type: p.ref_type, ref_key: p.ref_key })), score: Math.min(100, s.score - 5 + 8), reasons: [...s.reasons.filter((r) => r !== "nominal sama"), `jumlah ${size} hari penjualan = setoran`] });
            }
            return;
          }
          for (let i = start; i < n; i++) rec(i + 1, [...picked, list[i]], sum + list[i].remaining);
        };
        rec(0, [], 0);
      }
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

// ── Kategori Payment: master yang dikelola Finance (Pengaturan › Kategori Payment) ─
async function categoriesFor(direction) {
  const [r] = await pool.query(
    `SELECT code, label FROM mst_payment_category WHERE is_active = 1 AND direction IN (?, 'BOTH') ORDER BY sort_no, label`,
    [direction === "CR" ? "IN" : "OUT"]
  );
  return { source: "Pengaturan › Kategori Payment", items: r };
}

// GET /rekon/workspace/categories?direction=CR|DR
export async function getCategories(req, res) {
  try {
    return res.json(await categoriesFor(req.query.direction === "DR" ? "DR" : "CR"));
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat kategori", error: err.message });
  }
}

// GET /rekon/workspace?bank_account_id&from&to&outlet&method&status&q
export async function getWorkspace(req, res) {
  try {
    const { from, to } = range(req.query);
    const bankId = Number(req.query.bank_account_id) || null;
    const outletId = req.query.outlet ? Number(req.query.outlet) : null;
    const [banks] = await pool.query(`SELECT id, bank_name, account_no, holder, outlet_id FROM mst_bank_account WHERE is_active = 1 ORDER BY id`);
    const bank = banks.find((b) => b.id === bankId) || banks[0] || null;
    const [usage, approved] = await Promise.all([loadUsage(), approvedDaySet(addDays(from, -1), to)]);

    // Internal
    const internalAll = await buildInternal({ from, to, outletId, bankAccountId: bank?.id });
    const internal = internalAll.map((it) => {
      const u = usage.get(`${it.ref_type}:${it.ref_key}`);
      const status = internalStatus(it, u, approved);
      return { ...it, used: u?.used || 0, remaining: round2(Math.max(0, it.amount - (u?.used || 0))), status, matchable: true, match_ids: u?.matches || [], category: u?.category_label || null };
    });

    // Bank
    let bankRows = [];
    if (bank) {
      const [stmts] = await pool.query(
        `SELECT s.id, DATE_FORMAT(s.trx_date,'%Y-%m-%d') AS date, s.description, s.amount, s.balance,
                m.recon_code, m.bank_code, m.direction, m.source_recon_code, m.source_payment_category, m.description_full, m.excel_row, m.import_file_id,
                (SELECT COUNT(*) FROM tr_bank_match bm WHERE bm.statement_id = s.id) AS legacy
         FROM tr_bank_statement s LEFT JOIN tr_bank_statement_meta m ON m.statement_id = s.id
         WHERE s.bank_account_id = ? AND s.trx_date BETWEEN ? AND ? ORDER BY s.trx_date, s.id`,
        [bank.id, from, to]
      );
      bankRows = stmts.map((s) => {
        const u = usage.get(`BANK:${s.id}`);
        const abs = Math.abs(Number(s.amount));
        const status = bankStatus(abs, u, Number(s.legacy) > 0);
        return {
          id: s.id, date: s.date, description: s.description, description_full: s.description_full || null, amount: round2(s.amount), balance: s.balance == null ? null : round2(s.balance),
          debit: Number(s.amount) < 0 ? abs : 0, credit: Number(s.amount) > 0 ? abs : 0,
          recon_code: s.recon_code || null, bank_code: s.bank_code || null, direction: s.direction || null,
          source_recon_code: s.source_recon_code || null, source_payment_category: s.source_payment_category || null,
          excel_row: s.excel_row || null, import_file_id: s.import_file_id || null,
          used: u?.used || 0, remaining: round2(Math.max(0, abs - (u?.used || 0))), status, legacy_matched: Number(s.legacy) > 0,
          payment_category: u?.category_label || null, match_ids: u?.matches || [],
        };
      });
    }

    // Rekomendasi pasangan untuk mutasi yang belum selesai
    const poolItems = internal.filter((x) => x.remaining > TOL);
    const suggestions = {};
    bankRows.filter((b) => b.status === "Unmatched" || b.status === "Partial").forEach((b) => {
      const c = candidatesFor({ ...b, amount: b.amount }, poolItems);
      if (c.length) suggestions[b.id] = c;
    });

    const method = req.query.method || "";
    const statusF = req.query.status || "belum";
    const q = req.query.q || "";
    const done = (s) => ["Matched", "Reviewed", "Explained"].includes(s);
    const pass = (s, side) => (statusF === "all" ? true : statusF === "belum" ? !done(s) : statusF === "Matched" ? done(s) : side === "BANK" ? !done(s) : s === statusF);
    const iFiltered = internal.filter((x) => (!method || x.method === method) && pass(x.status, "INTERNAL") && matchText(x, q));
    const bFiltered = bankRows.filter((x) => pass(x.status, "BANK") && (!q || `${x.description} ${x.recon_code || ""} ${x.amount}`.toLowerCase().includes(String(q).trim().toLowerCase())));

    const count = (arr, s) => arr.filter((x) => x.status === s).length;
    return res.json({
      period: { from, to },
      outlets: (await getOutlets()).map((o) => ({ id: o.id, name: o.name })),
      banks,
      bank,
      internal: iFiltered.slice(0, 1500),
      internal_total: iFiltered.length,
      bank_rows: bFiltered.slice(0, 1500),
      bank_total: bFiltered.length,
      suggestions,
      summary: {
        belum: internal.filter((x) => !done(x.status)).length + bankRows.filter((x) => !done(x.status)).length,
        pending_bank: count(internal, "PendingBank"),
        difference: count(internal, "Difference") + count(bankRows, "Difference"),
        matched: internal.filter((x) => done(x.status)).length,
        internal_count: internal.length,
        bank_unmatched: bankRows.filter((x) => !done(x.status)).length,
      },
    });
  } catch (err) {
    console.error("[getWorkspace]", err);
    return res.status(500).json({ message: "Gagal memuat Rekonsiliasi Transaksi", error: err.message });
  }
}

// ── POST /rekon/workspace/match ────────────────────────────────────────────
// body: { bank_account_id, mode: 'FULL'|'PARTIAL'|'DIFF', bank: [{id, category_code}], internal: [{ref_type, ref_key, date}] }
export async function createMatch(req, res) {
  const conn = await pool.getConnection();
  try {
    const bankId = Number(req.body?.bank_account_id);
    const mode = ["FULL", "PARTIAL", "DIFF"].includes(req.body?.mode) ? req.body.mode : "FULL";
    const bankSel = Array.isArray(req.body?.bank) ? req.body.bank : [];
    const intSel = Array.isArray(req.body?.internal) ? req.body.internal : [];
    if (!bankId || !bankSel.length || !intSel.length) return res.status(422).json({ message: "Pilih transaksi internal dan mutasi bank terlebih dulu." });

    const [stmts] = await conn.query(
      `SELECT id, DATE_FORMAT(trx_date,'%Y-%m-%d') AS d, amount FROM tr_bank_statement WHERE id IN (?) AND bank_account_id = ?`,
      [bankSel.map((b) => Number(b.id)), bankId]
    );
    if (stmts.length !== bankSel.length) return res.status(422).json({ message: "Ada mutasi bank yang tidak valid untuk rekening ini." });
    const dirs = new Set(stmts.map((s) => (Number(s.amount) > 0 ? "CR" : "DR")));
    if (dirs.size > 1) return res.status(422).json({ message: "Mutasi masuk (kredit) dan keluar (debit) tidak boleh dicocokkan sekaligus." });
    const direction = [...dirs][0];

    // Kategori Payment wajib, dipilih dari master sesuai arah transaksi
    const cats = await categoriesFor(direction);
    if (!cats.items.length) return res.status(422).json({ message: `Belum ada Kategori Payment untuk transaksi ${direction === "CR" ? "uang masuk" : "uang keluar"}. Tambahkan di Pengaturan › Kategori Payment.` });
    const catOf = new Map(cats.items.map((c) => [String(c.code), c.label]));
    for (const b of bankSel) {
      if (!b.category_code || !catOf.has(String(b.category_code))) return res.status(422).json({ message: "Pilih Kategori Payment untuk setiap mutasi bank." });
    }

    const usage = await loadUsage(conn);
    const bankItems = stmts.map((s) => {
      const abs = Math.abs(Number(s.amount));
      const remaining = round2(abs - (usage.get(`BANK:${s.id}`)?.used || 0));
      const sel = bankSel.find((b) => Number(b.id) === s.id);
      return { id: s.id, abs, remaining, code: String(sel.category_code), label: catOf.get(String(sel.category_code)) };
    });
    if (bankItems.some((b) => b.remaining <= TOL)) return res.status(422).json({ message: "Ada mutasi bank yang sudah dicocokkan sepenuhnya." });

    // Ambil data transaksi internal terkini (jangan percaya nominal dari klien)
    const dates = intSel.map((i) => String(i.date || "")).filter(isDate).sort();
    if (!dates.length) return res.status(422).json({ message: "Tanggal transaksi internal tidak valid." });
    const built = await buildInternal({ from: addDays(dates[0], -1), to: addDays(dates[dates.length - 1], 1), bankAccountId: bankId });
    const byKey = new Map(built.map((i) => [`${i.ref_type}:${i.ref_key}`, i]));
    const intItems = [];
    for (const s of intSel) {
      const it = byKey.get(`${s.ref_type}:${s.ref_key}`);
      if (!it) return res.status(422).json({ message: `Transaksi internal tidak ditemukan: ${s.ref_key}.` });
      if ((direction === "CR") !== (it.dir === "IN")) return res.status(422).json({ message: `${it.ref}: arah transaksi tidak sama dengan mutasi bank.` });
      const remaining = round2(it.amount - (usage.get(`${it.ref_type}:${it.ref_key}`)?.used || 0));
      if (remaining <= TOL) return res.status(422).json({ message: `${it.ref} sudah dicocokkan sepenuhnya.` });
      intItems.push({ ...it, remaining });
    }

    const totalI = round2(intItems.reduce((s, i) => s + i.remaining, 0));
    const totalB = round2(bankItems.reduce((s, b) => s + b.remaining, 0));
    const equal = near(totalI, totalB);
    let status;
    let matchedI;
    let matchedB;
    if (mode === "FULL") {
      if (!equal) return res.status(422).json({ message: `Total internal (Rp ${totalI.toLocaleString("id-ID")}) tidak sama dengan total bank (Rp ${totalB.toLocaleString("id-ID")}). Pilih "Cocokkan sebagian" atau "Cocokkan dengan selisih".` });
      status = "MATCHED";
      matchedI = totalI;
      matchedB = totalB;
    } else if (mode === "DIFF") {
      if (equal) return res.status(422).json({ message: "Total kedua sisi sama; gunakan Cocokkan biasa." });
      status = "DIFF";
      matchedI = totalI;
      matchedB = totalB;
    } else {
      status = equal ? "MATCHED" : "PARTIAL";
      matchedI = matchedB = Math.min(totalI, totalB);
    }

    // Pembagian nominal ke tiap baris (berurutan sampai habis), lalu bagian lawan diatribusikan sebanding
    const allocate = (list, total) => {
      let left = total;
      return list.map((x) => {
        const a = round2(Math.min(x.remaining, left));
        left = round2(left - a);
        return a;
      });
    };
    const allocI = allocate(intItems, matchedI);
    const allocB = allocate(bankItems, matchedB);
    const sumI = allocI.reduce((s, x) => s + x, 0) || 1;
    const sumB = allocB.reduce((s, x) => s + x, 0) || 1;
    const uid = req.user?.id || null;
    const explanation = status === "DIFF" ? String(req.body?.explanation || "").trim().slice(0, 500) : "";

    await conn.beginTransaction();
    const [mh] = await conn.query(`INSERT INTO tr_recon_match (bank_account_id, status, difference, created_by) VALUES (?, ?, ?, ?)`, [
      bankId, status, status === "DIFF" ? round2(totalI - totalB) : 0, uid,
    ]);
    if (explanation) await conn.query(`UPDATE tr_recon_match SET explanation = ?, explained_by = ?, explained_at = NOW() WHERE id = ?`, [explanation, uid, mh.insertId]);
    for (let i = 0; i < intItems.length; i++) {
      if (allocI[i] <= 0) continue;
      await conn.query(
        `INSERT INTO tr_recon_match_item (match_id, side, ref_type, ref_key, outlet_id, amount, counter_amount) VALUES (?, 'INTERNAL', ?, ?, ?, ?, ?)`,
        [mh.insertId, intItems[i].ref_type, intItems[i].ref_key, intItems[i].outlet_id, allocI[i], round2((allocI[i] / sumI) * matchedB)]
      );
    }
    for (let i = 0; i < bankItems.length; i++) {
      if (allocB[i] <= 0) continue;
      await conn.query(
        `INSERT INTO tr_recon_match_item (match_id, side, ref_type, ref_key, amount, counter_amount, category_code, category_label) VALUES (?, 'BANK', 'BANK', ?, ?, ?, ?, ?)`,
        [mh.insertId, String(bankItems[i].id), allocB[i], round2((allocB[i] / sumB) * matchedI), bankItems[i].code, bankItems[i].label]
      );
    }
    const detail = `${bankItems.map((b) => `bank#${b.id}`).join(", ")} ↔ ${intItems.map((i) => i.ref).join(", ")} · ${status === "MATCHED" ? "penuh" : status === "PARTIAL" ? `sebagian (sisa Rp ${round2(Math.abs(totalI - totalB)).toLocaleString("id-ID")})` : `dengan selisih Rp ${round2(totalI - totalB).toLocaleString("id-ID")}${explanation ? ` (${explanation})` : ""}`} · kategori: ${[...new Set(bankItems.map((b) => b.label))].join(", ")}`;
    await conn.query(`INSERT INTO tr_recon_history (action, ref_type, ref_key, detail, user_id) VALUES ('MATCH', 'MATCH', ?, ?, ?)`, [String(mh.insertId), detail, uid]);
    await conn.commit();
    return res.status(201).json({ message: status === "MATCHED" ? "Dicocokkan." : status === "PARTIAL" ? "Dicocokkan sebagian." : explanation ? "Dicocokkan dengan selisih (sudah dijelaskan)." : "Dicocokkan dengan selisih. Jelaskan selisihnya.", match_id: mh.insertId, status });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[createMatch]", err);
    return res.status(500).json({ message: "Gagal mencocokkan", error: err.message });
  } finally {
    conn.release();
  }
}

// POST /rekon/workspace/unmatch {match_id}  — batalkan; data sumber tidak berubah
export async function undoMatch(req, res) {
  try {
    const id = Number(req.body?.match_id);
    const [[m]] = await pool.query(`SELECT id, status, undone_at FROM tr_recon_match WHERE id = ?`, [id]).then(([r]) => [r.length ? r : [null]]);
    if (!m) return res.status(404).json({ message: "Pencocokan tidak ditemukan." });
    if (m.undone_at) return res.status(422).json({ message: "Pencocokan ini sudah dibatalkan." });
    // Hari yang sudah disetujui/dikunci di Rekonsiliasi Harian tidak boleh diubah buktinya
    const [its] = await pool.query(`SELECT ref_type, ref_key, outlet_id FROM tr_recon_match_item WHERE match_id = ? AND side = 'INTERNAL' AND ref_type IN ('POS_CASH','POS_ONLINE')`, [id]);
    for (const it of its) {
      const outlet = it.outlet_id;
      const day = String(it.ref_key).split("|")[1] || null; // ref_key: "cabang|tanggal" atau "cabang|tanggal|metode"
      if (!day || !outlet) continue;
      const [[lk]] = await pool.query(`SELECT 1 AS x FROM tr_recon_daily WHERE outlet_id = ? AND rec_date = ? AND status = 'APPROVED'`, [outlet, day]).then(([r]) => [r.length ? r : [null]]);
      if (lk) return res.status(422).json({ message: "Hari terkait sudah disetujui dan dikunci di Rekonsiliasi Harian. Pencocokan tidak bisa dibatalkan." });
    }
    await pool.query(`UPDATE tr_recon_match SET undone_by = ?, undone_at = NOW() WHERE id = ?`, [req.user?.id || null, id]);
    await pool.query(`INSERT INTO tr_recon_history (action, ref_type, ref_key, detail, user_id) VALUES ('UNMATCH', 'MATCH', ?, ?, ?)`, [String(id), `Pencocokan #${id} dibatalkan (data sumber tidak berubah)`, req.user?.id || null]);
    return res.json({ message: "Pencocokan dibatalkan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal membatalkan pencocokan", error: err.message });
  }
}

// POST /rekon/workspace/explain {match_id, text} — jelaskan selisih (Difference → Explained)
export async function explainMatch(req, res) {
  try {
    const id = Number(req.body?.match_id);
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(422).json({ message: "Penjelasan selisih wajib diisi." });
    const [[m]] = await pool.query(`SELECT id, status, undone_at FROM tr_recon_match WHERE id = ?`, [id]).then(([r]) => [r.length ? r : [null]]);
    if (!m || m.undone_at) return res.status(404).json({ message: "Pencocokan tidak ditemukan atau sudah dibatalkan." });
    if (m.status !== "DIFF") return res.status(422).json({ message: "Hanya pencocokan dengan selisih yang perlu dijelaskan." });
    await pool.query(`UPDATE tr_recon_match SET explanation = ?, explained_by = ?, explained_at = NOW() WHERE id = ?`, [text.slice(0, 500), req.user?.id || null, id]);
    await pool.query(`INSERT INTO tr_recon_history (action, ref_type, ref_key, detail, user_id) VALUES ('STATUS', 'MATCH', ?, ?, ?)`, [String(id), `Selisih pencocokan #${id} dijelaskan → Explained: ${text.slice(0, 200)}`, req.user?.id || null]);
    return res.json({ message: "Penjelasan selisih disimpan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal menyimpan penjelasan", error: err.message });
  }
}

// GET /rekon/workspace/match/:id — detail pencocokan
export async function getMatch(req, res) {
  try {
    const id = Number(req.params.id);
    const [[m]] = await pool.query(`SELECT * FROM tr_recon_match WHERE id = ?`, [id]).then(([r]) => [r.length ? r : [null]]);
    if (!m) return res.status(404).json({ message: "Pencocokan tidak ditemukan." });
    const [items] = await pool.query(`SELECT side, ref_type, ref_key, amount, counter_amount, category_code, category_label FROM tr_recon_match_item WHERE match_id = ? ORDER BY side, id`, [id]);
    return res.json({ match: m, items });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat detail pencocokan", error: err.message });
  }
}

// GET /rekon/workspace/history?action=&q=&limit=
export async function getHistory(req, res) {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const conds = [];
    const params = [];
    if (req.query.action) {
      conds.push("action = ?");
      params.push(String(req.query.action));
    }
    if (req.query.q) {
      conds.push("(detail LIKE ? OR ref_key LIKE ?)");
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    const [rows] = await pool.query(
      `SELECT id, action, ref_type, ref_key, detail, user_id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM tr_recon_history ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`,
      [...params, limit]
    );
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    const names = new Map();
    if (ids.length) {
      try {
        const [u] = await mainPool.query(`SELECT id, name FROM users WHERE id IN (?)`, [ids]);
        u.forEach((x) => names.set(Number(x.id), x.name));
      } catch {
        /* nama pengguna opsional */
      }
    }
    return res.json({ data: rows.map((r) => ({ ...r, user_name: names.get(Number(r.user_id)) || null })) });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat riwayat", error: err.message });
  }
}
