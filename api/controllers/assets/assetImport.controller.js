import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import ExcelJS from "exceljs";
import { fileURLToPath } from "url";
import { pool, mainPool, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { LIVE_POSTED } from "./assets.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// IMPORT PENYUSUTAN ASET DARI EXCEL (pratinjau → konfirmasi) + FOTO ASET ALFI
//  • Aset hasil import disimpan HANYA di alfi (mst_asset source='EXCEL', kode XL-0001, …). SuperApp tidak pernah ditulis.
//  • Satu baris Excel = satu catatan aset (qty = jumlah unit, nilai perolehan = total baris).
//  • Pratinjau tidak menulis database. Konfirmasi menghitung ulang semua angka di server.
// ════════════════════════════════════════════════════════════════════════════
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PHOTO_DIR = path.join(__dirname, "..", "..", "..", "storage", "asset-photos");
export const alfiPhotoUrl = (f) => (f ? `/api/finance-ho/assets/photo-alfi/${encodeURIComponent(path.basename(String(f)))}` : null);

const DEFAULT_OPENING_UNTIL = "2025-12";
const FALLBACK_POLICY = [
  { group: "1", months: 48 }, { group: "2", months: 96 }, { group: "3", months: 192 }, { group: "4", months: 240 },
  { group: "Bangunan Permanen", months: 240 }, { group: "Bangunan Tidak Permanen", months: 120 },
];
// Cabang di Excel → id outlet alfi. Kota Wisata = Sentra Eropa hanyalah asumsi (ditandai di pratinjau).
const BRANCHES = {
  raffles: { label: "Raffles", outlet_id: 1 }, "waschen raffles": { label: "Raffles", outlet_id: 1 },
  citra: { label: "Citra", outlet_id: 2 }, "citra grand": { label: "Citra", outlet_id: 2 },
  legenda: { label: "Legenda", outlet_id: 3 }, canadian: { label: "Canadian", outlet_id: 4 },
  kotwis: { label: "Kota Wisata", outlet_id: 5, assumed: true }, "kota wisata": { label: "Kota Wisata", outlet_id: 5, assumed: true },
};
const SHEET_KINDS = [
  { kind: "Bangunan", test: (n) => n.includes("bangunan") && !n.includes("renovasi"), unit: "month", category: "Bangunan Permanen" },
  { kind: "Renovasi", test: (n) => n.includes("renovasi"), unit: "month", category: "Renovasi & Bangunan Tidak Permanen" },
  { kind: "Kendaraan", test: (n) => n.includes("kendaraan"), unit: "month", category: "Kendaraan" },
  { kind: "Mesin", test: (n) => n.includes("mesin"), unit: "year", category: "Mesin Laundry" },
  { kind: "Kantor", test: (n) => n.includes("kantor"), unit: "year", category: "Komputer & Perangkat IT" },
  { kind: "Inventaris", test: (n) => n.includes("inventaris"), unit: "year", category: "Furnitur & Perabot Outlet" },
];
const kindOfSheetName = (name) => SHEET_KINDS.find((k) => k.test(String(name || "").toLowerCase())) || null;

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
const validYm = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ""));
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// ── nilai sel Excel (formula → result; formula tanpa hasil tersimpan = kosong) ──
function cellVal(c) {
  let v = c?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) v = v.result;
    else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join("");
    else if ("text" in v) v = v.text;
    else return null; // formula tanpa hasil tersimpan
    if (v && typeof v === "object" && !(v instanceof Date)) return null; // error sel
  }
  if (typeof v === "string") { v = v.trim(); return v === "" ? null : v; }
  return v ?? null;
}
const rowCells = (row) => { const out = []; row.eachCell({ includeEmpty: false }, (cell, col) => { const v = cellVal(cell); if (v !== null && v !== "") out.push({ col, v }); }); return out; };
const headerText = (v) => (v instanceof Date ? "" : String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase());

function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") && !s.includes(".") ? s.replace(/,/g, "") : s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toDateStr(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m && validDate(`${m[1]}-${m[2]}-${m[3]}`)) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (d && validDate(`${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`)) return `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  }
  return null;
}

// ── kebijakan penyusutan (kelompok → bulan) ──
const groupKey = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const t = clean(v).toLowerCase();
  if (/^\d+(\.0+)?$/.test(t)) return String(parseInt(t, 10));
  const m = t.match(/^kel(?:ompok|\.)?\s*(\d+)$/);
  return m ? String(parseInt(m[1], 10)) : t;
};
function readPolicy(wb) {
  const policy = new Map(FALLBACK_POLICY.map((p) => [groupKey(p.group), { group: p.group, months: p.months }]));
  const ws = wb.worksheets.find((w) => /kebijakan/i.test(w.name));
  if (!ws) return policy;
  let cols = null;
  ws.eachRow((row) => {
    const cells = rowCells(row);
    if (!cols) {
      const g = cells.find((c) => headerText(c.v) === "kelompok");
      if (g) cols = { group: g.col, months: cells.find((c) => /masa manfaat/.test(headerText(c.v)) && /bulan/.test(headerText(c.v)))?.col, years: cells.find((c) => /masa manfaat/.test(headerText(c.v)) && /tahun/.test(headerText(c.v)))?.col };
      return;
    }
    const g = cells.find((c) => c.col === cols.group)?.v;
    if (g === undefined || g === null) return;
    let months = toNumber(cells.find((c) => c.col === cols.months)?.v);
    if (!(months > 0)) { const y = toNumber(cells.find((c) => c.col === cols.years)?.v); if (y > 0) months = y * 12; }
    const key = groupKey(g);
    if (key && months > 0 && (typeof g === "number" || /^[a-z]/i.test(String(g)))) policy.set(key, { group: typeof g === "number" ? String(g) : clean(g), months: Math.round(months) });
  });
  return policy;
}

// ── cari baris header & kolom berdasar teks header ──
function findHeader(ws) {
  const limit = Math.min(ws.rowCount, 20);
  for (let r = 1; r <= limit; r++) {
    const cells = rowCells(ws.getRow(r));
    const t = cells.map((c) => ({ col: c.col, t: headerText(c.v) }));
    const no = t.find((x) => x.t === "no");
    const name = t.find((x) => x.t === "item" || x.t === "nama aset");
    if (!no || !name) continue;
    const find = (re) => t.find((x) => re.test(x.t))?.col || null;
    return {
      row: r, no: no.col, name: name.col, brand: find(/^merk/), qty: find(/^qty/), group: find(/^(kel\.?|kelompok)$/),
      lifeMonths: find(/masa manfaat.*bulan|bulan.*masa manfaat/), lifeYears: find(/(tahun.*masa manfaat|masa manfaat.*tahun)/),
      date: find(/tanggal perolehan/), cost: find(/^(nilai|harga) perolehan/),
    };
  }
  return null;
}

const monthsBetween = (acq, until) => {
  const [ay, am] = acq.slice(0, 7).split("-").map(Number);
  const [uy, um] = until.split("-").map(Number);
  return Math.max(0, (uy - ay) * 12 + (um - am) + 1);
};
// Hitungan penyusutan (dipakai pratinjau & konfirmasi): bulan perolehan sudah dihitung penuh
export function depreciationOf(cost, life, acq, openingUntil) {
  if (!(cost > 0) || !(life > 0) || !acq) return { monthly: 0, opening_accum: 0 };
  const monthly = cost / life;
  const accum = Math.min(cost, monthly * monthsBetween(acq, openingUntil));
  return { monthly: toFixed2(monthly), opening_accum: toFixed2(accum) };
}

// ── baca workbook → baris mentah ──
export async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const policy = readPolicy(wb);
  const rows = [];
  const seen = new Map();
  for (const ws of wb.worksheets) {
    const sk = kindOfSheetName(ws.name);
    if (!sk) continue;
    const h = findHeader(ws);
    if (!h) continue;
    let branch = { label: "Pusat", outlet_id: null, assumed: false };
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      const cells = rowCells(row);
      // judul cabang: satu-satunya sel terisi pada baris adalah nama cabang
      if (cells.length === 1 && typeof cells[0].v === "string") {
        const b = BRANCHES[clean(cells[0].v).toLowerCase()];
        if (b) { branch = { label: b.label, outlet_id: b.outlet_id, assumed: !!b.assumed }; return; }
      }
      if (rn <= h.row) return;
      const get = (col) => (col ? cells.find((c) => c.col === col)?.v ?? null : null);
      const no = get(h.no);
      const noNum = typeof no === "number" ? no : typeof no === "string" && /^\d+$/.test(no) ? Number(no) : null;
      const name = clean(get(h.name));
      if (!Number.isInteger(noNum) || !name) return;
      const brand = clean(get(h.brand)) || null;
      const qtyRaw = toNumber(get(h.qty));
      const groupRaw = get(h.group);
      const gk = groupKey(groupRaw);
      const date = toDateStr(get(h.date));
      const costRaw = toNumber(get(h.cost));
      const cost = costRaw && costRaw > 0 ? toFixed2(costRaw) : 0;
      let life = gk && policy.get(gk) ? policy.get(gk).months : null;
      if (!life) {
        const m = toNumber(get(h.lifeMonths)); const y = toNumber(get(h.lifeYears));
        if (m > 0) life = Math.round(sk.unit === "month" ? m : m * 12);
        else if (y > 0) life = Math.round(y * 12);
      }
      const baseKey = [ws.name, branch.label, name, brand || "", date || "", cost].join("|");
      const n = (seen.get(baseKey) || 0) + 1; seen.set(baseKey, n);
      rows.push({
        key: `${sk.kind.toLowerCase().slice(0, 4)}-${sha1(`${baseKey}|${n}`).slice(0, 24)}`,
        sheet: ws.name, sheet_kind: sk.kind, row: rn, branch: branch.label, outlet_id: branch.outlet_id, outlet_assumed: branch.assumed,
        name, brand, qty: qtyRaw && qtyRaw > 0 ? qtyRaw : 1, group: groupRaw === null ? null : clean(groupRaw), life_months: life, acquisition_date: date, cost,
        category_name: sk.category,
      });
    });
  }
  return { rows, policy: [...policy.values()] };
}

async function categoryLookup() {
  const [rows] = await pool.query("SELECT id, name FROM mst_asset_category");
  return new Map(rows.map((r) => [r.name, { id: r.id, name: r.name }]));
}

// ── POST /assets/import/preview ──
export async function previewAssetImport(req, res) {
  try {
    if (!req.file) return res.status(422).json({ message: "File Excel (.xlsx) wajib dipilih." });
    const openingUntil = validYm(req.query.opening_until || req.body?.opening_until) ? String(req.query.opening_until || req.body.opening_until) : DEFAULT_OPENING_UNTIL;
    let parsed;
    try { parsed = await parseWorkbook(req.file.buffer); } catch (e) { return res.status(422).json({ message: `File Excel tidak bisa dibaca: ${e.message}` }); }
    if (!parsed.rows.length) return res.status(422).json({ message: "Tidak ada baris aset yang dikenali. Pastikan format sheet sesuai." });

    const [outlets, cats, [supRows], [alfiRows]] = await Promise.all([
      getOutlets(), categoryLookup(),
      mainPool.query("SELECT kode_aset, nama_aset, brand, outlet_id, lokasi_nama FROM mst_aset WHERE is_deleted = 0 AND is_active = 1"),
      pool.query("SELECT code, source_key FROM mst_asset"),
    ]);
    const outletName = new Map(outlets.map((o) => [Number(o.id), o.name]));
    const importedKeys = new Set(alfiRows.filter((r) => r.source_key).map((r) => r.source_key));
    const financeCodes = new Set(alfiRows.map((r) => r.code));
    const linkedCodes = new Set(alfiRows.filter((r) => r.source_key).map((r) => r.code));
    const sup = supRows.map((r) => ({
      code: r.kode_aset, name: r.nama_aset, brand: r.brand, outlet_id: r.outlet_id ? Number(r.outlet_id) : null,
      outlet_name: r.outlet_id ? outletName.get(Number(r.outlet_id)) || `Outlet #${r.outlet_id}` : r.lokasi_nama || "Pusat",
      n: norm(r.nama_aset), nb: norm(`${r.nama_aset}${r.brand || ""}`), has_finance: financeCodes.has(r.kode_aset),
    }));
    const claimed = new Set();
    const cand = (c) => ({ code: c.code, name: c.name, brand: c.brand || null, outlet_name: c.outlet_name, has_finance: c.has_finance });

    const out = parsed.rows.map((r) => {
      let status; let reason = null; let candidates = []; let suggested = { action: "SKIP", link_code: null };
      if (!r.acquisition_date) { status = "SKIP"; reason = "Tanggal perolehan kosong"; }
      else if (!(r.cost > 0)) { status = "SKIP"; reason = "Nilai perolehan kosong"; }
      else if (!(r.life_months > 0)) { status = "SKIP"; reason = "Kelompok kosong (masa manfaat tidak diketahui)"; }
      else if (importedKeys.has(r.key)) { status = "IMPORTED"; reason = "Sudah pernah diimpor"; }
      else {
        const nm = norm(r.name); const nb = norm(`${r.name}${r.brand || ""}`);
        const fits = (c) => !linkedCodes.has(c.code) && !claimed.has(c.code) && (r.outlet_id === null || c.outlet_id === null || c.outlet_id === r.outlet_id);
        const pool1 = sup.filter(fits);
        const exact = pool1.filter((c) => c.n === nm || c.nb === nm || c.n === nb || c.nb === nb);
        if (exact.length === 1) { status = "EXISTS"; candidates = [cand(exact[0])]; suggested = { action: "LINK", link_code: exact[0].code }; claimed.add(exact[0].code); reason = "Aset sudah ada di Manajemen Aset"; }
        else {
          const part = exact.length ? exact : nm.length >= 4 ? pool1.filter((c) => c.n.length >= 4 && (c.n.includes(nm) || nm.includes(c.n))) : [];
          if (part.length) { status = "SIMILAR"; candidates = part.slice(0, 8).map(cand); reason = exact.length ? "Beberapa aset bernama sama" : "Nama mirip dengan aset yang ada"; suggested = { action: "NEW", link_code: null }; }
          else { status = "NEW"; suggested = { action: "NEW", link_code: null }; }
        }
      }
      if (status === "IMPORTED") suggested = { action: "SKIP", link_code: null };
      const d = depreciationOf(r.cost, r.life_months, r.acquisition_date, openingUntil);
      return {
        key: r.key, sheet: r.sheet, row: r.row, branch: r.branch, outlet_id: r.outlet_id,
        outlet_name: r.outlet_id ? outletName.get(r.outlet_id) || `Outlet #${r.outlet_id}` : "Pusat", outlet_assumed: r.outlet_assumed,
        name: r.name, brand: r.brand, qty: r.qty, group: r.group, life_months: r.life_months || null, acquisition_date: r.acquisition_date, cost: r.cost,
        monthly: d.monthly, opening_accum: d.opening_accum, status, reason, candidates, suggested, default_category: cats.get(r.category_name) || null,
      };
    });
    const count = (s) => out.filter((r) => r.status === s).length;
    return res.json({
      opening_until: openingUntil, policy: parsed.policy, rows: out,
      summary: { total: out.length, importable: out.filter((r) => r.status !== "SKIP").length, skipped: count("SKIP"), new: count("NEW"), exists: count("EXISTS"), similar: count("SIMILAR"), imported: count("IMPORTED") },
    });
  } catch (err) {
    console.error("[previewAssetImport]", err);
    return res.status(500).json({ message: "Gagal membaca file Excel", error: err.message });
  }
}

// ── POST /assets/import/commit ──
export async function commitAssetImport(req, res) {
  const body = req.body || {};
  const input = Array.isArray(body.rows) ? body.rows : null;
  if (!input) return res.status(422).json({ message: "Daftar baris import wajib diisi." });
  const openingUntil = validYm(body.opening_until) ? body.opening_until : DEFAULT_OPENING_UNTIL;
  const policy = new Map(FALLBACK_POLICY.map((p) => [groupKey(p.group), p.months]));
  const conn = await pool.getConnection();
  try {
    const [outlets, cats] = await Promise.all([getOutlets(), categoryLookup()]);
    const outletIds = new Set(outlets.map((o) => Number(o.id)));
    let created = 0; let linked = 0; let skipped = 0;
    const errors = [];
    await conn.beginTransaction();
    const [[{ mx }]] = await conn.query("SELECT COALESCE(MAX(CAST(SUBSTRING(code, 4) AS UNSIGNED)), 0) AS mx FROM mst_asset WHERE code REGEXP '^XL-[0-9]+$' FOR UPDATE");
    let nextNo = Number(mx);
    const seenKeys = new Set();

    for (const r of input) {
      const key = String(r?.key || "").slice(0, 190);
      const action = String(r?.action || "").toUpperCase();
      const fail = (message) => { errors.push({ key, message }); };
      if (!key) { errors.push({ key: "", message: "Baris tanpa key dilewati." }); continue; }
      if (action !== "NEW" && action !== "LINK") { skipped++; continue; }
      if (seenKeys.has(key)) { skipped++; continue; }
      seenKeys.add(key);
      const [[dup]] = await conn.query("SELECT id FROM mst_asset WHERE source_key = ?", [key]).then(([x]) => [x.length ? x : [null]]);
      if (dup) { skipped++; continue; }

      const name = clean(r.name).slice(0, 150);
      const brand = clean(r.brand).slice(0, 100) || null;
      const date = String(r.acquisition_date || "").slice(0, 10);
      const cost = toFixed2(r.cost);
      const qtyN = Number(r.qty); const qty = qtyN > 0 && qtyN < 1e7 ? Math.round(qtyN * 100) / 100 : 1;
      const group = clean(r.group).slice(0, 40) || null;
      const gk = groupKey(r.group);
      const life = gk && policy.get(gk) ? policy.get(gk) : parseInt(r.life_months, 10);
      const outletId = r.outlet_id === null || r.outlet_id === undefined || r.outlet_id === "" ? null : Number(r.outlet_id);
      if (!name) { fail("Nama aset kosong."); continue; }
      if (!validDate(date)) { fail("Tanggal perolehan tidak valid."); continue; }
      if (!(cost > 0)) { fail("Nilai perolehan harus lebih dari 0."); continue; }
      if (!(life > 0 && life <= 600)) { fail("Masa manfaat tidak valid."); continue; }
      if (outletId !== null && !outletIds.has(outletId)) { fail("Outlet tidak dikenal."); continue; }
      const { opening_accum: opening } = depreciationOf(cost, life, date, openingUntil);
      const kind = kindOfSheetName(r.sheet);
      const category = kind ? cats.get(kind.category) || null : null;
      const notes = `Import Excel ${clean(r.sheet)}`.slice(0, 255);

      if (action === "NEW") {
        nextNo++;
        const code = `XL-${String(nextNo).padStart(4, "0")}`;
        await conn.query(
          `INSERT INTO mst_asset (code, name, category, outlet_id, acquisition_date, cost, salvage, opening_accum, life_months, notes, created_by, source, source_key, brand, qty, asset_group)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'EXCEL', ?, ?, ?, ?)`,
          [code, name, category?.name || null, outletId, date, cost, opening, life, notes, req.user?.id || null, key, brand, qty, group]
        );
        if (category) await conn.query("INSERT IGNORE INTO mst_asset_category_map (kode_aset, category_id, updated_by) VALUES (?, ?, ?)", [code, category.id, req.user?.id || null]);
        created++;
        continue;
      }

      // LINK ke aset SuperApp (hanya baca SuperApp; data penyusutan ditulis ke alfi)
      const linkCode = String(r.link_code || "").trim();
      const [[sa]] = await mainPool.query("SELECT kode_aset, nama_aset, sub_kategori, outlet_id FROM mst_aset WHERE kode_aset = ? AND is_deleted = 0", [linkCode]).then(([x]) => [x.length ? x : [null]]);
      if (!sa) { fail(`Aset ${linkCode || "(kosong)"} tidak ditemukan di Manajemen Aset.`); continue; }
      const [[ex]] = await conn.query(
        `SELECT a.id, a.source_key, (SELECT COUNT(*) FROM tr_depreciation d JOIN tr_journal_entries je ON je.id = d.journal_id WHERE d.asset_id = a.id AND ${LIVE_POSTED}) AS months_done
         FROM mst_asset a WHERE a.code = ?`, [sa.kode_aset]
      ).then(([x]) => [x.length ? x : [null]]);
      if (ex && Number(ex.months_done) > 0) { fail(`Aset ${sa.kode_aset} sudah punya jurnal penyusutan, data tidak diubah.`); continue; }
      if (ex && ex.source_key) { fail(`Aset ${sa.kode_aset} sudah ditautkan ke baris Excel lain.`); continue; }
      const saOutlet = sa.outlet_id ? Number(sa.outlet_id) : null;
      if (!ex) {
        await conn.query(
          `INSERT INTO mst_asset (code, name, category, outlet_id, acquisition_date, cost, salvage, opening_accum, life_months, notes, created_by, source, source_key, brand, qty, asset_group)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'EXCEL_LINK', ?, ?, ?, ?)`,
          [sa.kode_aset, String(sa.nama_aset || "").slice(0, 150), String(sa.sub_kategori || "").slice(0, 60) || null, saOutlet, date, cost, opening, life, notes, req.user?.id || null, key, brand, qty, group]
        );
      } else {
        await conn.query(
          `UPDATE mst_asset SET acquisition_date=?, cost=?, salvage=0, opening_accum=?, life_months=?, source_key=?, brand=?, qty=?, asset_group=? WHERE id=?`,
          [date, cost, opening, life, key, brand, qty, group, ex.id]
        );
      }
      if (category) await conn.query("INSERT IGNORE INTO mst_asset_category_map (kode_aset, category_id, updated_by) VALUES (?, ?, ?)", [sa.kode_aset, category.id, req.user?.id || null]);
      linked++;
    }
    await conn.commit();
    return res.json({ created, linked, skipped, errors });
  } catch (err) {
    try { await conn.rollback(); } catch { /* abaikan */ }
    console.error("[commitAssetImport]", err);
    return res.status(500).json({ message: "Gagal menyimpan import aset", error: err.message });
  } finally {
    conn.release();
  }
}

// ════════════════ Foto aset alfi ════════════════
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => (/\.xlsx$/i.test(file.originalname) ? cb(null, true) : cb(new Error("File harus berformat .xlsx."))),
});
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => (/^image\/(jpeg|png|webp)$/.test(file.mimetype) ? cb(null, true) : cb(new Error("Foto harus berformat JPEG, PNG, atau WebP."))),
});
const wrapMulter = (mw, field, sizeMsg) => (req, res, next) =>
  mw.single(field)(req, res, (err) => {
    if (!err) return next();
    return res.status(422).json({ message: err.code === "LIMIT_FILE_SIZE" ? sizeMsg : err.message });
  });
export const importFileMiddleware = wrapMulter(xlsxUpload, "file", "Ukuran file maksimal 10 MB.");
export const photoFileMiddleware = wrapMulter(photoUpload, "photo", "Ukuran foto maksimal 8 MB.");

async function assetExists(kode) {
  const [a] = await mainPool.query("SELECT kode_aset FROM mst_aset WHERE kode_aset = ? AND is_deleted = 0", [kode]);
  if (a.length) return true;
  const [b] = await pool.query("SELECT id FROM mst_asset WHERE code = ? AND source = 'EXCEL'", [kode]);
  return b.length > 0;
}

// POST /assets/photos/:kode (multipart `photo`)
export async function uploadAssetPhoto(req, res) {
  let target = null;
  try {
    const kode = String(req.params.kode || "").trim();
    if (!req.file) return res.status(422).json({ message: "File foto wajib dipilih." });
    if (!kode || !(await assetExists(kode))) return res.status(404).json({ message: "Aset tidak ditemukan." });
    const { default: sharp } = await import("sharp");
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    const fileName = `${crypto.randomBytes(16).toString("hex")}.jpg`;
    target = path.join(PHOTO_DIR, fileName);
    try {
      await sharp(req.file.buffer).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(target);
    } catch {
      return res.status(422).json({ message: "File foto tidak valid atau rusak." });
    }
    const caption = clean(req.body?.caption).slice(0, 150) || null;
    const [r] = await pool.query("INSERT INTO mst_asset_photo (kode_aset, file_name, caption, created_by) VALUES (?, ?, ?, ?)", [kode, fileName, caption, req.user?.id || null]);
    return res.status(201).json({ id: r.insertId, url: alfiPhotoUrl(fileName) });
  } catch (err) {
    if (target) fs.promises.unlink(target).catch(() => {});
    console.error("[uploadAssetPhoto]", err);
    return res.status(500).json({ message: "Gagal mengunggah foto", error: err.message });
  }
}

// DELETE /assets/photos/:id — hanya foto alfi
export async function deleteAssetPhoto(req, res) {
  try {
    const [[p]] = await pool.query("SELECT id, file_name FROM mst_asset_photo WHERE id = ?", [Number(req.params.id) || 0]).then(([x]) => [x.length ? x : [null]]);
    if (!p) return res.status(404).json({ message: "Foto tidak ditemukan." });
    await pool.query("DELETE FROM mst_asset_photo WHERE id = ?", [p.id]);
    await fs.promises.unlink(path.join(PHOTO_DIR, path.basename(p.file_name))).catch(() => {});
    return res.json({ message: "Foto dihapus." });
  } catch (err) {
    console.error("[deleteAssetPhoto]", err);
    return res.status(500).json({ message: "Gagal menghapus foto", error: err.message });
  }
}

// GET /assets/photo-alfi/:file — tanpa token (dipakai <img>; nama file acak)
export function getAlfiAssetPhoto(req, res) {
  const file = path.basename(String(req.params.file || ""));
  if (!/^[\w\-.]+$/.test(file)) return res.status(404).end();
  const full = path.join(PHOTO_DIR, file);
  if (!fs.existsSync(full)) return res.status(404).end();
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.sendFile(full);
}
