import { toFixed2 } from "./currencyHelpers.js";

// ════════════════════════════════════════════════════════════════════════════
// ARUS KAS (metode langsung) — dibaca dari jurnal POSTED + REVERSED.
// Setiap jurnal yang menyentuh akun kas/bank: gerak kasnya dibagi ke akun lawan (bukan kas)
// sebanding nilainya, lalu dikelompokkan menurut kelompok arus kas akun lawan itu.
// Jurnal yang hanya berisi akun kas/bank = pindahan internal (di filter "Semua" saling meniadakan).
// ════════════════════════════════════════════════════════════════════════════

export const CF_GROUPS = [
  { key: "OPERASI", label: "Arus kas dari aktivitas operasi", short: "Operasi" },
  { key: "INVESTASI", label: "Arus kas dari aktivitas investasi", short: "Investasi" },
  { key: "PENDANAAN", label: "Arus kas dari aktivitas pendanaan", short: "Pendanaan" },
];
export const CF_GROUP_KEYS = ["KAS", "OPERASI", "INVESTASI", "PENDANAAN"];
const LIVE = "je.status IN ('POSTED','REVERSED')";
const NOT_OPENING = "je.source_type <> 'SALDO_AWAL'";

const INVEST_ROLES = new Set(["ASET_TETAP", "AKUM_PENYUSUTAN"]);

// Kelompok otomatis bila Finance belum memilih di Master COA
function autoGroup(a, roles, settingCash) {
  if (settingCash.has(a.id)) return { group: "KAS", reason: "akun kas/bank di Pengaturan" };
  const name = String(a.name || "");
  if (a.type === "ASET" && /^(kas|bank)\b/i.test(name)) return { group: "KAS", reason: "nama diawali Kas/Bank" };
  if ([...(roles.get(a.id) || [])].some((r) => INVEST_ROLES.has(r))) return { group: "INVESTASI", reason: "akun aset tetap" };
  if (a.type === "ASET" && /(mesin|peralatan|kendaraan|gedung|bangunan|tanah|inventaris|aset tetap|akumulasi)/i.test(name)) return { group: "INVESTASI", reason: "nama akun aset tetap" };
  if (a.type === "KEWAJIBAN" && /(pinjaman|utang bank|hutang bank|kredit bank|leasing|obligasi)/i.test(name)) return { group: "PENDANAAN", reason: "nama akun pinjaman" };
  if (a.type === "EKUITAS") return { group: "PENDANAAN", reason: "akun ekuitas" };
  return { group: "OPERASI", reason: "bawaan" };
}

// Map account_id → { id, code, name, type, group, manual, auto, reason }
export async function loadCashFlowGroups(conn) {
  const [accs] = await conn
    .query(`SELECT id, code, name, type, cash_flow_group FROM mst_coa`)
    .catch(async (err) => {
      if (!/cash_flow_group/.test(err.message)) throw err;
      return conn.query(`SELECT id, code, name, type, NULL AS cash_flow_group FROM mst_coa`); // migrasi 007 belum dijalankan
    });
  const [[roleRows], [cabRows], [bankRows]] = await Promise.all([
    conn.query(`SELECT role, account_id FROM mst_account_map WHERE account_id IS NOT NULL`),
    conn.query(`SELECT cash_account_id AS id FROM mst_cabang_setting WHERE cash_account_id IS NOT NULL`),
    conn.query(`SELECT account_id AS id FROM mst_bank_account WHERE account_id IS NOT NULL`),
  ]);
  const roles = new Map();
  roleRows.forEach((r) => {
    const id = Number(r.account_id);
    if (!roles.has(id)) roles.set(id, new Set());
    roles.get(id).add(r.role);
  });
  const settingCash = new Set([
    ...roleRows.filter((r) => r.role === "KAS" || r.role === "BANK").map((r) => Number(r.account_id)),
    ...cabRows.map((r) => Number(r.id)),
    ...bankRows.map((r) => Number(r.id)),
  ]);
  const out = new Map();
  accs.forEach((a) => {
    const id = Number(a.id);
    const auto = autoGroup({ ...a, id }, roles, settingCash);
    const manual = CF_GROUP_KEYS.includes(a.cash_flow_group) ? a.cash_flow_group : null;
    out.set(id, { id, code: a.code, name: a.name, type: a.type, group: manual || auto.group, manual, auto: auto.group, reason: manual ? "dipilih di Master COA" : auto.reason });
  });
  return out;
}

const lineFilter = (outletId) => {
  if (outletId === "PUSAT") return (l) => l.outlet_id == null;
  if (outletId) return (l) => Number(l.outlet_id) === Number(outletId);
  return () => true;
};
const outletSql = (outletId) => {
  if (outletId === "PUSAT") return { sql: " AND jl.outlet_id IS NULL", params: [] };
  if (outletId) return { sql: " AND jl.outlet_id = ?", params: [outletId] };
  return { sql: "", params: [] };
};

// { start, end, outletId } → hasil arus kas satu periode
export async function computeCashFlow(conn, { start, end, outletId = null }, groups = null) {
  const g = groups || (await loadCashFlowGroups(conn));
  const cashIds = [...g.values()].filter((a) => a.group === "KAS").map((a) => a.id);
  const cashAccounts = cashIds.map((id) => g.get(id)).sort((a, b) => a.code.localeCompare(b.code)).map(({ id, code, name, reason }) => ({ id, code, name, reason }));
  if (!cashIds.length) return { mapped: false, cash_accounts: [] };
  const oc = outletSql(outletId);

  // Saldo awal = semua gerak kas sebelum periode + jurnal Saldo Awal di dalam periode (bukan "arus")
  const [[bal]] = await conn.query(
    `SELECT COALESCE(SUM(CASE WHEN je.entry_date < ? OR (je.entry_date <= ? AND je.source_type = 'SALDO_AWAL') THEN jl.debit - jl.credit ELSE 0 END), 0) AS opening,
            COALESCE(SUM(jl.debit - jl.credit), 0) AS closing
     FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id
     WHERE ${LIVE} AND jl.account_id IN (?) AND je.entry_date <= ?${oc.sql}`,
    [start, end, cashIds, end, ...oc.params]
  );

  const [lines] = await conn.query(
    `SELECT jl.entry_id, jl.account_id, jl.debit, jl.credit, jl.outlet_id
     FROM tr_journal_lines jl JOIN tr_journal_entries je ON je.id = jl.entry_id
     WHERE ${LIVE} AND ${NOT_OPENING} AND je.entry_date BETWEEN ? AND ?
       AND jl.entry_id IN (
         SELECT DISTINCT l2.entry_id FROM tr_journal_lines l2 JOIN tr_journal_entries e2 ON e2.id = l2.entry_id
         WHERE l2.account_id IN (?) AND e2.entry_date BETWEEN ? AND ?
       )
     ORDER BY jl.entry_id, jl.id`,
    [start, end, cashIds, start, end]
  );

  const isCash = new Set(cashIds);
  const inFilter = lineFilter(outletId);
  const byEntry = new Map();
  lines.forEach((l) => {
    const k = Number(l.entry_id);
    if (!byEntry.has(k)) byEntry.set(k, []);
    byEntry.get(k).push({ account_id: Number(l.account_id), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, outlet_id: l.outlet_id });
  });

  const acc = new Map(); // account_id → { in, out }
  const add = (id, v) => {
    if (!acc.has(id)) acc.set(id, { in: 0, out: 0 });
    const a = acc.get(id);
    if (v >= 0) a.in += v;
    else a.out += -v;
  };
  const transfer = { in: 0, out: 0 };
  let entries = 0;
  for (const ls of byEntry.values()) {
    const cash = ls.filter((l) => isCash.has(l.account_id) && inFilter(l)).reduce((s, l) => s + l.debit - l.credit, 0);
    if (Math.abs(cash) < 0.005) continue;
    entries++;
    const other = ls.filter((l) => !isCash.has(l.account_id)).map((l) => ({ id: l.account_id, w: l.credit - l.debit }));
    const W = other.reduce((s, o) => s + o.w, 0);
    if (Math.abs(W) < 0.005) {
      // hanya kas ↔ kas (mis. setor kas cabang ke bank pusat)
      if (cash > 0) transfer.in += cash;
      else transfer.out += -cash;
      continue;
    }
    other.forEach((o) => o.w && add(o.id, (cash * o.w) / W));
  }

  const rows = [...acc.entries()]
    .map(([id, v]) => {
      const a = g.get(id) || { id, code: "?", name: `Akun #${id}`, group: "OPERASI" };
      return { id, code: a.code, name: a.name, group: a.group, in: toFixed2(v.in), out: toFixed2(v.out), net: toFixed2(v.in - v.out) };
    })
    .filter((r) => r.in || r.out)
    .sort((a, b) => a.code.localeCompare(b.code));

  const sections = CF_GROUPS.map((s) => {
    const list = rows.filter((r) => r.group === s.key);
    const sum = (f) => toFixed2(list.reduce((t, r) => t + r[f], 0));
    return { ...s, rows: list, total: { in: sum("in"), out: sum("out"), net: sum("net") } };
  });
  const tr = { in: toFixed2(transfer.in), out: toFixed2(transfer.out), net: toFixed2(transfer.in - transfer.out) };
  const net = toFixed2(sections.reduce((t, s) => t + s.total.net, 0) + tr.net);
  const opening = toFixed2(bal.opening);
  const closing = toFixed2(bal.closing);
  return {
    mapped: true,
    opening,
    net,
    closing,
    check_diff: toFixed2(closing - opening - net), // harus 0: saldo akhir dihitung terpisah langsung dari akun kas/bank
    sections,
    transfer: tr,
    entries,
    cash_accounts: cashAccounts,
  };
}
