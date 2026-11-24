import { pool, mainPool, myWaschenPool, getOutlets } from "../../db/pool.js";
import { employeeNames } from "../pos/nota.controller.js";

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

// Pencocokan yang masih berlaku DAN semua mutasi banknya masih ada. Bila mutasi bank dihapus/diganti saat impor ulang,
// pencocokannya menjadi "yatim" (sisi kiri terlihat Matched tanpa pasangan di kanan) — yatim diabaikan agar baris kiri kembali terbuka.
export const ACTIVE_MATCH = `m.undone_at IS NULL AND NOT EXISTS (SELECT 1 FROM tr_recon_match_item xb LEFT JOIN tr_bank_statement xs ON xs.id = CAST(xb.ref_key AS UNSIGNED) WHERE xb.match_id = m.id AND xb.side = 'BANK' AND xs.id IS NULL)`;
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
    let accountIds = [];
    if (bankAccountId === "ALL") {
      const [ar] = await pool.query(`SELECT DISTINCT account_id FROM mst_bank_account WHERE is_active = 1 AND account_id IS NOT NULL`);
      accountIds = ar.map((x) => Number(x.account_id));
    } else {
      const [[one]] = await pool.query(`SELECT account_id FROM mst_bank_account WHERE id = ?`, [bankAccountId]).then(([r]) => [r.length ? r : [null]]);
      if (one?.account_id) accountIds = [Number(one.account_id)];
    }
    if (accountIds.length) {
      const [jr] = await pool.query(
        `SELECT jl.id, je.entry_no, DATE_FORMAT(je.entry_date,'%Y-%m-%d') AS d, je.description, jl.memo, jl.debit, jl.credit, jl.outlet_id, je.source_type
         FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id
         LEFT JOIN tr_bank_match m ON m.journal_line_id = jl.id
         WHERE je.status IN ('POSTED','REVERSED') AND jl.account_id IN (?) AND m.journal_line_id IS NULL
           AND je.source_type NOT IN ('POS','REKONSILIASI','SALDO_AWAL') AND je.entry_date BETWEEN ? AND ?${outletId ? " AND jl.outlet_id = ?" : ""}`,
        outletId ? [accountIds, from, to, outletId] : [accountIds, from, to]
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
    `SELECT i.side, i.ref_type, i.ref_key, i.match_id, i.amount, i.counter_amount, i.category_code, i.category_label, m.status, m.difference, m.explanation, m.bank_account_id,
            (gj.status = 'POSTED') AS on_gl
     FROM tr_recon_match_item i JOIN tr_recon_match m ON m.id = i.match_id AND ${ACTIVE_MATCH}
     LEFT JOIN tr_journal_entries gj ON gj.id = m.gl_journal_id`
  );
  const map = new Map();
  rows.forEach((r) => {
    const k = `${r.ref_type}:${r.ref_key}`;
    const u = map.get(k) || { used: 0, counter: 0, matches: [], category_label: null, diff: false, explained: false };
    u.used = round2(u.used + Number(r.amount));
    u.counter = round2(u.counter + Number(r.counter_amount));
    u.matches.push(r.match_id);
    if (Number(r.on_gl) === 1) u.gl = true;
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
    if (u.gl) return "Reviewed";
    if (u.diff) return "Difference";
    if ((it.ref_type === "POS_CASH" || it.ref_type === "POS_ONLINE") && approvedDays.has(`${it.outlet_id}|${it.date}|${it.ref_type === "POS_CASH" ? "TUNAI" : it.method}`)) return "Reviewed";
    return "Matched";
  }
  if (u && u.used > 0) return "Partial";
  if (it.ref_type === "JOURNAL") return "Unmatched";
  return "PendingBank";
}

function bankStatus(abs, u, legacy) {
  if (legacy) return "Matched";
  if (u && u.used >= abs - TOL) return u.diff ? "Difference" : "Matched";
  if (u && u.used > 0) return "Partial";
  return "Unmatched";
}

// Kunci "outlet|tanggal|metode" untuk metode yang sudah ditransfer ke GL (hari terkunci penuh lama = semua metode)
async function approvedDaySet(from, to) {
  const [rows] = await pool.query(`SELECT outlet_id, DATE_FORMAT(rec_date,'%Y-%m-%d') AS d FROM tr_recon_daily WHERE status = 'APPROVED' AND rec_date BETWEEN ? AND ?`, [from, to]);
  const [mrows] = await pool.query(`SELECT outlet_id, DATE_FORMAT(rec_date,'%Y-%m-%d') AS d, method FROM tr_recon_daily_method WHERE rec_date BETWEEN ? AND ?`, [from, to]).catch(() => [[]]);
  const set = new Set(mrows.map((r) => `${r.outlet_id}|${r.d}|${r.method}`));
  rows.forEach((r) => ["TUNAI", "QRIS", "EDC"].forEach((m) => set.add(`${r.outlet_id}|${r.d}|${m}`)));
  return set;
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
    const allBanks = req.query.bank_account_id === "ALL"; // "Semua rekening": mutasi dari semua rekening aktif ditampilkan sekaligus
    const bank = allBanks ? null : banks.find((b) => b.id === bankId) || banks[0] || null;
    const bankLabel = new Map(banks.map((b) => [b.id, `${b.bank_name} ${b.account_no}`]));
    const [usage, approved] = await Promise.all([loadUsage(), approvedDaySet(addDays(from, -1), to)]);

    // Jenis selisih tiap pencocokan DIFF: BANK_CHARGE (MDR / biaya bank), PIUTANG, DEPOSIT, PELUNASAN, atau null (belum dialokasi).
    // Pencocokan lama QRIS/EDC yang sudah dijelaskan tanpa alokasi dianggap Bank Charge (sama seperti perlakuan jurnalnya).
    const [diffRows] = await pool.query(
      `SELECT m.id, m.difference, m.alloc_type, m.explanation,
              (SELECT COUNT(*) FROM tr_recon_match_item i WHERE i.match_id = m.id AND i.side = 'INTERNAL') AS n_int,
              (SELECT COUNT(*) FROM tr_recon_match_item i WHERE i.match_id = m.id AND i.side = 'INTERNAL' AND i.ref_type = 'POS_ONLINE') AS n_online
       FROM tr_recon_match m WHERE m.status = 'DIFF' AND ${ACTIVE_MATCH}`
    );
    const diffInfo = new Map(diffRows.map((m) => [Number(m.id), {
      type: m.alloc_type || (m.explanation && Number(m.n_int) > 0 && Number(m.n_int) === Number(m.n_online) && Number(m.difference) > 0 ? "BANK_CHARGE" : null),
      amount: Math.abs(Number(m.difference) || 0),
    }]));
    const diffTypeOf = (ids) => { const f = (ids || []).find((id) => diffInfo.has(id)); return f ? diffInfo.get(f).type : null; };

    // Internal
    const internalAll = await buildInternal({ from, to, outletId, bankAccountId: allBanks ? "ALL" : bank?.id });
    const internal = internalAll.map((it) => {
      const u = usage.get(`${it.ref_type}:${it.ref_key}`);
      const status = internalStatus(it, u, approved);
      return { ...it, used: u?.used || 0, remaining: round2(Math.max(0, it.amount - (u?.used || 0))), status, resolved: status === "Difference" && Boolean(u?.explained), alloc_type: status === "Difference" ? diffTypeOf(u?.matches) : null, matchable: true, match_ids: u?.matches || [], category: u?.category_label || null };
    });

    // Pasangan bank untuk baris internal yang sudah dicocokkan — termasuk yang ada di REKENING LAIN (panel kanan hanya menampilkan rekening terpilih)
    const pairsBy = new Map();
    const allMatchIds = [...new Set(internal.flatMap((x) => x.match_ids))];
    if (allMatchIds.length) {
      const [pr] = await pool.query(
        `SELECT i.match_id, CAST(i.ref_key AS UNSIGNED) AS sid, i.amount, s.bank_account_id, ba.bank_name, ba.account_no, DATE_FORMAT(s.trx_date, '%Y-%m-%d') AS d, mt.recon_code
         FROM tr_recon_match_item i JOIN tr_recon_match m ON m.id = i.match_id AND ${ACTIVE_MATCH}
         JOIN tr_bank_statement s ON s.id = CAST(i.ref_key AS UNSIGNED) JOIN mst_bank_account ba ON ba.id = s.bank_account_id
         LEFT JOIN tr_bank_statement_meta mt ON mt.statement_id = s.id
         WHERE i.side = 'BANK' AND i.match_id IN (?)`,
        [allMatchIds]
      );
      pr.forEach((p) => {
        const list = pairsBy.get(Number(p.match_id)) || [];
        list.push({ match_id: Number(p.match_id), statement_id: Number(p.sid), bank_account_id: Number(p.bank_account_id), bank_label: `${p.bank_name} ${p.account_no}`, recon_code: p.recon_code || null, date: p.d, amount: round2(p.amount), other_bank: bank ? Number(p.bank_account_id) !== bank.id : false });
        pairsBy.set(Number(p.match_id), list);
      });
    }
    internal.forEach((x) => { x.pairs = x.match_ids.flatMap((id) => pairsBy.get(id) || []); });

    // Bank
    let bankRows = [];
    if ((bank || allBanks) && banks.length) {
      const [stmts] = await pool.query(
        `SELECT s.id, s.bank_account_id, DATE_FORMAT(s.trx_date,'%Y-%m-%d') AS date, s.description, s.amount, s.balance,
                m.recon_code, m.bank_code, m.direction, m.source_recon_code, m.source_payment_category, m.description_full, m.excel_row, m.import_file_id,
                (SELECT COUNT(*) FROM tr_bank_match bm WHERE bm.statement_id = s.id) AS legacy
         FROM tr_bank_statement s LEFT JOIN tr_bank_statement_meta m ON m.statement_id = s.id
         WHERE s.bank_account_id IN (?) AND s.trx_date BETWEEN ? AND ? ORDER BY s.trx_date, s.id`,
        [allBanks ? banks.map((b) => b.id) : [bank.id], from, to]
      );
      bankRows = stmts.map((s) => {
        const u = usage.get(`BANK:${s.id}`);
        const abs = Math.abs(Number(s.amount));
        const status = bankStatus(abs, u, Number(s.legacy) > 0);
        return {
          id: s.id, bank_account_id: Number(s.bank_account_id), bank_label: bankLabel.get(Number(s.bank_account_id)) || null, date: s.date, description: s.description, description_full: s.description_full || null, amount: round2(s.amount), balance: s.balance == null ? null : round2(s.balance),
          debit: Number(s.amount) < 0 ? abs : 0, credit: Number(s.amount) > 0 ? abs : 0,
          recon_code: s.recon_code || null, bank_code: s.bank_code || null, direction: s.direction || null,
          source_recon_code: s.source_recon_code || null, source_payment_category: s.source_payment_category || null,
          excel_row: s.excel_row || null, import_file_id: s.import_file_id || null,
          used: u?.used || 0, remaining: round2(Math.max(0, abs - (u?.used || 0))), status, resolved: status === "Difference" && Boolean(u?.explained), alloc_type: status === "Difference" ? diffTypeOf(u?.matches) : null, legacy_matched: Number(s.legacy) > 0,
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

    const methods = String(req.query.method || "").split(",").map((x) => x.trim()).filter(Boolean); // boleh lebih dari satu
    const statusF = req.query.status || "belum";
    const allocF = ["BANK_CHARGE", "PIUTANG", "OTHER"].includes(req.query.alloc) ? req.query.alloc : "";
    const q = req.query.q || "";
    // Selesai = Matched/Reviewed, atau Difference yang sudah dijelaskan/dialokasikan (tidak lagi dianggap "belum selesai")
    const done = (x) => ["Matched", "Reviewed"].includes(x.status) || (x.status === "Difference" && x.resolved);
    const pass = (x, side) => {
      if (statusF === "all") return true;
      if (statusF === "belum") return !done(x);
      if (statusF === "Matched") return x.status === "Matched" || x.status === "Reviewed";
      if (statusF === "Difference") {
        if (x.status !== "Difference") return false;
        if (!allocF) return true;
        return allocF === "OTHER" ? !["BANK_CHARGE", "PIUTANG"].includes(x.alloc_type) : x.alloc_type === allocF;
      }
      return side === "BANK" ? !done(x) : x.status === statusF;
    };
    const iFiltered = internal.filter((x) => (!methods.length || methods.includes(x.method)) && pass(x, "INTERNAL") && matchText(x, q));
    const bFiltered = bankRows.filter((x) => pass(x, "BANK") && (!q || `${x.description} ${x.recon_code || ""} ${x.amount}`.toLowerCase().includes(String(q).trim().toLowerCase())));

    const count = (arr, s) => arr.filter((x) => x.status === s).length;
    // Rincian selisih (per PASANG) pada periode ini: bank charge, piutang, lainnya (deposit / pelunasan / belum dialokasi)
    const matchIds = [...new Set([...internal, ...bankRows].flatMap((x) => x.match_ids || []))].filter((id) => diffInfo.has(id));
    const alloc = { bank_charge: 0, piutang: 0, belum_dialokasi: 0, deposit: 0, pelunasan: 0 };
    const pairs = { bank_charge: 0, piutang: 0, lainnya: 0 };
    matchIds.forEach((id) => {
      const m = diffInfo.get(id);
      if (m.type === "BANK_CHARGE") { alloc.bank_charge += m.amount; pairs.bank_charge += 1; }
      else if (m.type === "PIUTANG") { alloc.piutang += m.amount; pairs.piutang += 1; }
      else {
        pairs.lainnya += 1;
        if (m.type === "DEPOSIT") alloc.deposit += m.amount;
        else if (m.type === "PELUNASAN") alloc.pelunasan += m.amount;
        else alloc.belum_dialokasi += m.amount;
      }
    });
    Object.keys(alloc).forEach((k) => { alloc[k] = round2(alloc[k]); });
    const diffPairs = matchIds.length; // satu pasang kiri-kanan dihitung 1
    return res.json({
      period: { from, to },
      outlets: (await getOutlets()).map((o) => ({ id: o.id, name: o.name })),
      banks,
      bank,
      all_banks: allBanks,
      internal: iFiltered.slice(0, 1500),
      internal_total: iFiltered.length,
      bank_rows: bFiltered.slice(0, 1500),
      bank_total: bFiltered.length,
      suggestions,
      summary: {
        belum: internal.filter((x) => !done(x)).length + bankRows.filter((x) => !done(x)).length,
        pending_bank: count(internal, "PendingBank"),
        difference: diffPairs,
        matched: internal.filter((x) => x.status === "Matched" || x.status === "Reviewed").length,
        internal_count: internal.length,
        reconciliated: internal.filter((x) => done(x)).length,
        diff_alloc: alloc,
        diff_pairs: pairs,
        bank_unmatched: bankRows.filter((x) => !done(x)).length,
      },
    });
  } catch (err) {
    console.error("[getWorkspace]", err);
    return res.status(500).json({ message: "Gagal memuat Rekonsiliasi Transaksi", error: err.message });
  }
}

// Kekurangan (alokasi PIUTANG) yang belum dilunasi. remaining = selisih awal − pelunasan yang sudah dicocokkan.
export async function loadOpenPiutang(conn = pool) {
  const [rows] = await conn.query(
    `SELECT m.id AS match_id, ABS(m.difference) AS amount, m.alloc_party AS party, m.explanation, DATE_FORMAT(m.created_at, '%Y-%m-%d') AS created,
            (SELECT COALESCE(SUM(ABS(r.difference)), 0) FROM tr_recon_match r WHERE r.alloc_ref_match_id = m.id AND r.alloc_type = 'PELUNASAN' AND r.undone_at IS NULL) AS settled,
            (SELECT MIN(i.outlet_id) FROM tr_recon_match_item i WHERE i.match_id = m.id AND i.side = 'INTERNAL') AS outlet_id,
            (SELECT MIN(i.ref_type) FROM tr_recon_match_item i WHERE i.match_id = m.id AND i.side = 'INTERNAL') AS ref_type
     FROM tr_recon_match m WHERE m.alloc_type = 'PIUTANG' AND ${ACTIVE_MATCH} ORDER BY m.id`
  );
  return rows
    .map((r) => ({ match_id: Number(r.match_id), amount: round2(r.amount), settled: round2(r.settled), remaining: round2(Number(r.amount) - Number(r.settled)), party: r.party, explanation: r.explanation, created: r.created, outlet_id: r.outlet_id ? Number(r.outlet_id) : null, ref_type: r.ref_type }))
    .filter((r) => r.remaining > TOL);
}

// GET /rekon/workspace/open-piutang — pilihan "Kekurangan yang dilunasi" di dialog pencocokan
export async function getOpenPiutang(req, res) {
  try {
    const outletId = Number(req.query?.outlet) || null;
    const items = await loadOpenPiutang();
    const om = await outletMap();
    // Total terbuka per pihak, supaya terlihat berapa seluruh utang orang itu (bukan hanya satu kekurangan)
    const perParty = new Map();
    items.forEach((p) => { const k = String(p.party || "").trim().toLowerCase(); if (k) perParty.set(k, round2((perParty.get(k) || 0) + p.remaining)); });
    return res.json({
      items: items
        .map((p) => ({ ...p, code: `PIU-${String(p.match_id).padStart(4, "0")}`, outlet_name: p.outlet_id ? om.get(p.outlet_id)?.name || null : null, same_outlet: Boolean(outletId && p.outlet_id === outletId), party_total: perParty.get(String(p.party || "").trim().toLowerCase()) || p.remaining }))
        .sort((a, b) => Number(b.same_outlet) - Number(a.same_outlet) || a.match_id - b.match_id),
    });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat kekurangan terbuka", error: err.message });
  }
}

// GET /rekon/workspace/parties?outlet= — nama kasir cabang (dari closing shift POS) untuk pilihan "Pihak piutang"
export async function getParties(req, res) {
  try {
    const outletId = Number(req.query.outlet) || null;
    const [rows] = await myWaschenPool.query(
      `SELECT DISTINCT cashier_employee_id AS a, closed_by_employee_id AS b FROM tr_cashier_shift WHERE opened_at >= DATE_SUB(CURDATE(), INTERVAL 120 DAY)${outletId ? " AND outlet_id = ?" : ""}`,
      outletId ? [outletId] : []
    );
    const names = await employeeNames(rows.flatMap((r) => [r.a, r.b]));
    return res.json({ kasir: [...new Set(names.values())].sort((x, y) => x.localeCompare(y)) });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat daftar kasir", error: err.message });
  }
}

// GET /rekon/workspace/internal-detail?ref_type=&ref_key= — nota & bukti pembayaran di balik satu baris internal
export async function getInternalDetail(req, res) {
  try {
    const { ref_type: type, ref_key: key } = req.query;
    const base = String(process.env.POS_ASSET_BASE_URL || "").replace(/\/+$/, "");
    const assetUrl = (p) => (!p ? null : /^https?:\/\//i.test(p) ? p : base ? `${base}${p.startsWith("/") ? "" : "/"}${p}` : null);
    let rows = [];
    if (type === "POS_TRF") {
      [rows] = await myWaschenPool.query(
        `SELECT l.id, t.id AS transaction_id, t.order_no, l.amount, l.payment_method, l.payment_proof_url, t.payment_proof_url AS nota_proof, DATE_FORMAT(l.created_at, '%H:%i') AS jam, c.name AS customer
         FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id LEFT JOIN mst_customer c ON c.id = t.customer_id WHERE l.id = ?`,
        [Number(key)]
      );
    } else if (type === "POS_CASH" || type === "POS_ONLINE") {
      const [oid, d, m] = String(key).split("|");
      const methodSql = type === "POS_CASH" ? "l.payment_method LIKE 'Tunai%'" : m === "QRIS" ? "l.payment_method LIKE 'QRIS%'" : "l.payment_method LIKE 'EDC%'";
      [rows] = await myWaschenPool.query(
        `SELECT l.id, t.id AS transaction_id, t.order_no, l.amount, l.payment_method, l.payment_proof_url, t.payment_proof_url AS nota_proof, DATE_FORMAT(l.created_at, '%H:%i') AS jam, c.name AS customer
         FROM tr_payment_log l JOIN tr_transaction t ON t.id = l.transaction_id LEFT JOIN mst_customer c ON c.id = t.customer_id
         WHERE t.outlet_id = ? AND ${LOG_WHERE} AND ${methodSql} ORDER BY l.created_at LIMIT 300`,
        [Number(oid), d, d]
      );
    } else {
      return res.json({ payments: [], truncated: false });
    }
    return res.json({
      payments: rows.map((r) => ({
        id: Number(r.id), transaction_id: Number(r.transaction_id), order_no: r.order_no, amount: round2(r.amount), method: r.payment_method, time: r.jam, customer: r.customer || null,
        proof: assetUrl(r.payment_proof_url || r.nota_proof), has_proof: Boolean(r.payment_proof_url || r.nota_proof),
      })),
      truncated: rows.length >= 300,
    });
  } catch (err) {
    console.error("[getInternalDetail]", err);
    return res.status(500).json({ message: "Gagal memuat rincian nota", error: err.message });
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

    // Alokasi selisih (hanya uang masuk). Bank kurang → Bank Charge / Piutang. Bank lebih → Deposit / Pelunasan kekurangan sebelumnya.
    let allocType = null;
    let allocParty = null;
    let allocRef = null;
    const al = req.body?.allocation;
    if (status === "DIFF" && al && direction === "CR") {
      const gap = round2(totalI - totalB); // > 0: uang bank kurang
      const allowed = gap > 0 ? ["BANK_CHARGE", "PIUTANG"] : ["DEPOSIT", "PELUNASAN"];
      if (!allowed.includes(al.type)) return res.status(422).json({ message: gap > 0 ? "Selisih kurang hanya bisa dialokasikan ke Bank Charge atau Piutang." : "Selisih lebih hanya bisa dialokasikan ke Deposit atau Pelunasan kekurangan sebelumnya." });
      if (explanation.length < 3) return res.status(422).json({ message: "Remark selisih wajib diisi." });
      allocType = al.type;
      if (allocType === "PIUTANG") {
        allocParty = String(al.party || "").trim().slice(0, 120);
        if (!allocParty) return res.status(422).json({ message: "Pihak piutang wajib diisi (kasir atau pelanggan)." });
      }
      if (allocType === "PELUNASAN") {
        allocRef = Number(al.settles_match_id) || null;
        const open = (await loadOpenPiutang(conn)).find((p) => p.match_id === allocRef);
        if (!open) return res.status(422).json({ message: "Pilih kekurangan sebelumnya yang dilunasi." });
        if (Math.abs(gap) > open.remaining + TOL) return res.status(422).json({ message: `Kelebihan Rp ${Math.abs(gap).toLocaleString("id-ID")} lebih besar dari sisa kekurangan Rp ${open.remaining.toLocaleString("id-ID")}. Alokasikan sisanya ke Deposit lewat pencocokan terpisah.` });
      }
    }

    await conn.beginTransaction();
    const [mh] = await conn.query(`INSERT INTO tr_recon_match (bank_account_id, status, difference, created_by, alloc_type, alloc_party, alloc_ref_match_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      bankId, status, status === "DIFF" ? round2(totalI - totalB) : 0, uid, allocType, allocParty, allocRef,
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

// Alasan pencocokan tidak boleh dibatalkan: hari terkait sudah ditransfer ke General Ledger (dikunci di Rekonsiliasi harian)
async function lockedReason(matchId) {
  const [[gl]] = await pool.query(`SELECT je.entry_no FROM tr_recon_match m JOIN tr_journal_entries je ON je.id = m.gl_journal_id AND je.status = 'POSTED' WHERE m.id = ?`, [matchId]).then(([r]) => [r.length ? r : [null]]).catch(() => [[null]]);
  if (gl) return `Sudah ditransfer ke General Ledger (${gl.entry_no}). Pencocokan tidak bisa dibatalkan.`;
  const [its] = await pool.query(`SELECT ref_type, ref_key, outlet_id FROM tr_recon_match_item WHERE match_id = ? AND side = 'INTERNAL' AND ref_type IN ('POS_CASH','POS_ONLINE')`, [matchId]);
  for (const it of its) {
    const parts = String(it.ref_key).split("|"); // "cabang|tanggal" (tunai) atau "cabang|tanggal|metode" (QRIS/EDC)
    const day = parts[1] || null;
    const method = it.ref_type === "POS_CASH" ? "TUNAI" : parts[2];
    if (!day || !it.outlet_id) continue;
    const [[lk]] = await pool.query(`SELECT 1 AS x FROM tr_recon_daily WHERE outlet_id = ? AND rec_date = ? AND status = 'APPROVED'`, [it.outlet_id, day]).then(([r]) => [r.length ? r : [null]]);
    const [[mk]] = await pool.query(`SELECT 1 AS x FROM tr_recon_daily_method WHERE outlet_id = ? AND rec_date = ? AND method = ?`, [it.outlet_id, day, method]).then(([r]) => [r.length ? r : [null]]).catch(() => [[null]]);
    if (lk || mk) return "Metode terkait sudah ditransfer ke General Ledger. Pencocokan tidak bisa dibatalkan.";
  }
  return null;
}

// Mutasi bank dihapus → semua pencocokan yang memakainya ikut dibatalkan (transaksi internal kembali terbuka).
// ids = id mutasi bank. Mengembalikan {ok, matches:[id], message}. Dipakai saat hapus mutasi dan untuk merapikan pencocokan yatim.
export async function cancelMatchesOfStatements(ids, userId, reason = "mutasi bank dihapus") {
  const list = (Array.isArray(ids) ? ids : [ids]).map(String);
  if (!list.length) return { ok: true, matches: [] };
  const [ms] = await pool.query(`SELECT DISTINCT m.id FROM tr_recon_match_item i JOIN tr_recon_match m ON m.id = i.match_id AND m.undone_at IS NULL WHERE i.side = 'BANK' AND i.ref_key IN (?)`, [list]);
  const mids = ms.map((x) => Number(x.id));
  for (const id of mids) {
    const why = await lockedReason(id);
    if (why) return { ok: false, matches: mids, message: `Pencocokan #${id}: ${why} Koreksi lewat jurnal balik di General Ledger.` };
  }
  for (const id of mids) {
    await pool.query(`UPDATE tr_recon_match SET undone_by = ?, undone_at = NOW() WHERE id = ? AND undone_at IS NULL`, [userId || null, id]);
    await pool.query(`INSERT INTO tr_recon_history (action, ref_type, ref_key, detail, user_id) VALUES ('UNMATCH', 'MATCH', ?, ?, ?)`, [String(id), `Pencocokan #${id} dibatalkan otomatis: ${reason} (data sumber tidak berubah)`, userId || null]);
  }
  return { ok: true, matches: mids };
}

// Pencocokan aktif yang mutasi banknya sudah tidak ada (sisa dari penghapusan sebelum aturan ini ada)
export async function findOrphanMatches() {
  const [r] = await pool.query(`SELECT m.id FROM tr_recon_match m WHERE m.undone_at IS NULL AND EXISTS (SELECT 1 FROM tr_recon_match_item xb LEFT JOIN tr_bank_statement xs ON xs.id = CAST(xb.ref_key AS UNSIGNED) WHERE xb.match_id = m.id AND xb.side = 'BANK' AND xs.id IS NULL)`);
  return r.map((x) => Number(x.id));
}

// POST /rekon/workspace/unmatch {match_id}  — batalkan; data sumber tidak berubah
export async function undoMatch(req, res) {
  try {
    const id = Number(req.body?.match_id);
    const [[m]] = await pool.query(`SELECT id, status, undone_at FROM tr_recon_match WHERE id = ?`, [id]).then(([r]) => [r.length ? r : [null]]);
    if (!m) return res.status(404).json({ message: "Pencocokan tidak ditemukan." });
    if (m.undone_at) return res.status(422).json({ message: "Pencocokan ini sudah dibatalkan." });
    const why = await lockedReason(id);
    if (why) return res.status(422).json({ message: why });
    await pool.query(`UPDATE tr_recon_match SET undone_by = ?, undone_at = NOW() WHERE id = ?`, [req.user?.id || null, id]);
    await pool.query(`INSERT INTO tr_recon_history (action, ref_type, ref_key, detail, user_id) VALUES ('UNMATCH', 'MATCH', ?, ?, ?)`, [String(id), `Pencocokan #${id} dibatalkan (data sumber tidak berubah)`, req.user?.id || null]);
    return res.json({ message: "Pencocokan dibatalkan." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal membatalkan pencocokan", error: err.message });
  }
}

// POST /rekon/workspace/explain {match_id, text} — jelaskan selisih (tetap Difference, ditandai sudah dijelaskan)
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

// GET /rekon/workspace/history?action=&q=&outlet=&from=&to=&limit=
export async function getHistory(req, res) {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const conds = [];
    const params = [];
    if (req.query.action) { conds.push("h.action = ?"); params.push(String(req.query.action)); }
    if (req.query.q) { conds.push("(h.detail LIKE ? OR h.ref_key LIKE ?)"); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    if (isDate(req.query.from)) { conds.push("h.created_at >= ?"); params.push(req.query.from); }
    if (isDate(req.query.to)) { conds.push("h.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(req.query.to); }
    const outletId = Number(req.query.outlet) || null;
    if (outletId) {
      conds.push(`(h.ref_type = 'MATCH' AND EXISTS (SELECT 1 FROM tr_recon_match_item i WHERE i.match_id = CAST(h.ref_key AS UNSIGNED) AND i.side = 'INTERNAL' AND i.outlet_id = ?))`);
      params.push(outletId);
    }
    const [rows] = await pool.query(
      `SELECT h.id, h.action, h.ref_type, h.ref_key, h.detail, h.user_id, DATE_FORMAT(h.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM tr_recon_history h ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""} ORDER BY h.id DESC LIMIT ?`,
      [...params, limit]
    );
    // Rekon Code mutasi bank + metode bayar internal (mengikuti nota) + cabang untuk baris pencocokan
    const mids = [...new Set(rows.filter((r) => r.ref_type === "MATCH").map((r) => Number(r.ref_key)).filter(Boolean))];
    const info = new Map();
    if (mids.length) {
      const [its] = await pool.query(
        `SELECT i.match_id, i.side, i.ref_type, i.ref_key, i.outlet_id, m.recon_code, m.source_recon_code
         FROM tr_recon_match_item i LEFT JOIN tr_bank_statement_meta m ON i.side = 'BANK' AND m.statement_id = CAST(i.ref_key AS UNSIGNED)
         WHERE i.match_id IN (?)`,
        [mids]
      );
      const om = await outletMap();
      its.forEach((i) => {
        const o = info.get(Number(i.match_id)) || { codes: new Set(), methods: new Set(), outlets: new Set() };
        if (i.side === "BANK" && i.recon_code) o.codes.add(i.recon_code);
        if (i.side === "INTERNAL") {
          const m = i.ref_type === "POS_CASH" ? "Tunai" : i.ref_type === "POS_TRF" ? "Transfer" : i.ref_type === "POS_ONLINE" ? String(i.ref_key).split("|")[2] : i.ref_type === "JOURNAL" ? "Jurnal" : null;
          if (m) o.methods.add(m);
          if (i.outlet_id) o.outlets.add(om.get(Number(i.outlet_id))?.name || `Outlet #${i.outlet_id}`);
        }
        info.set(Number(i.match_id), o);
      });
    }
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
    return res.json({
      data: rows.map((r) => {
        const o = r.ref_type === "MATCH" ? info.get(Number(r.ref_key)) : null;
        return {
          ...r,
          user_name: names.get(Number(r.user_id)) || null,
          recon_code: o ? [...o.codes].join(", ") || null : null,
          payment_category: o ? [...o.methods].join(", ") || null : null,
          outlet_name: o ? [...o.outlets].join(", ") || null : null,
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat riwayat", error: err.message });
  }
}
