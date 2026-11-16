import crypto from "crypto";
import ExcelJS from "exceljs";
import { parseCsv, parseDate } from "./statementParse.js";
import { reconPeriod, renderNumber } from "./numbering.js";

// ════════════════════════════════════════════════════════════════════════════
// MESIN IMPORT MUTASI BANK (satu mesin untuk semua bank, bukan parser per bank)
//  • Header dikenali dari NAMA kolom (alias), bukan posisi tetap; boleh dipetakan manual.
//  • Informasi rekening (Account Number, Name, Period, Currency) dibaca dari bagian atas file.
//  • Arah transaksi: kolom Sub (CR/DR), atau kolom Debit/Kredit, atau nominal bertanda.
//  • Kolom tanpa judul yang berisi kode pendek (mis. 0 / 998) dikenali sebagai Kode Transaksi bank.
//  • Description dibaca utuh (termasuk baris baru). Kolom tak dikenal dipertahankan di `extra`.
//  • File Excel Finance hanya berisi teks: TIDAK ada ekstraksi gambar.
//  • Rekon Code aplikasi dibuat sistem (lihat bankReconCode); Rekon Code & Kategori Payment dari Excel
//    hanya disimpan sebagai metadata sumber.
// Bank baru = tambah adapter (alias & aturan), tidak perlu parser baru.
// ════════════════════════════════════════════════════════════════════════════

const GENERIC_FIELDS = {
  date: ["date", "tanggal", "tgl", "tanggal_transaksi", "posting_date", "tgl_transaksi"],
  desc: ["description", "keterangan", "deskripsi", "uraian", "remark", "berita", "transaction_details"],
  kode: ["kode_transaksi", "kode_trx", "kode", "transaction_code", "trx_code"],
  amount: ["amount", "nominal", "jumlah", "mutasi"],
  sub: ["sub", "dc", "cr_dr", "db_cr", "d_c", "tipe"],
  debit: ["debit", "debet", "db", "keluar", "penarikan"],
  credit: ["kredit", "credit", "cr", "masuk", "setoran"],
  balance: ["saldo", "balance", "saldo_akhir"],
  rekon: ["rekon_code", "rekon", "kode_rekon", "recon_code"],
  kategori: ["kategori_payment", "kategori", "payment_category", "kategori_pembayaran"],
};
const HEADER_ALIASES = {
  account: ["account_number", "nomor_rekening", "no_rekening", "account_no", "no_rek"],
  name: ["name", "nama", "nama_rekening", "account_name", "nama_pemilik"],
  period: ["period", "periode"],
  currency: ["currency", "mata_uang", "curr"],
};

export const ADAPTERS = {
  FINANCE: { label: "Format Finance (referensi)", verified: true, fields: GENERIC_FIELDS },
  GENERIC: { label: "Umum (tanggal, keterangan, debit/kredit atau jumlah)", verified: true, fields: GENERIC_FIELDS },
};
// Bank lain memakai mesin yang sama. Belum diverifikasi dengan file asli bank tersebut; bila format berbeda,
// pemetaan kolom dapat diatur manual saat pratinjau.
for (const [k, l] of [["BCA", "BCA"], ["MANDIRI", "Mandiri"], ["BRI", "BRI"], ["BNI", "BNI"], ["BSI", "BSI"]]) {
  ADAPTERS[k] = { label: `${l} (pemetaan umum, belum diverifikasi dengan file asli)`, verified: false, fields: GENERIC_FIELDS };
}

export const FIELD_LABEL = {
  date: "Tanggal transaksi", desc: "Keterangan", kode: "Kode transaksi bank", amount: "Nominal", sub: "Arah transaksi (CR/DR)",
  debit: "Debit", credit: "Kredit", balance: "Saldo", rekon: "Rekon Code sumber (metadata)", kategori: "Kategori Payment sumber (metadata)",
};

const normH = (h) => String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const round2 = (n) => Math.round(n * 100) / 100;
// Teks sel dengan baris baru dipertahankan (hanya ujung yang dipangkas)
const cellRaw = (v) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).replace(/\r\n?/g, "\n").trim());
// Satu baris (untuk judul/pencarian): baris baru jadi spasi
const oneLine = (s) => s.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();

// Nominal dengan presisi desimal; mengenali format Indonesia (1.500.000,50) dan internasional (1,500,000.50)
export function parseMoneyExact(v) {
  if (typeof v === "number") return Number.isFinite(v) ? round2(v) : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let dec = null;
  if (lastDot > -1 && lastComma > -1) dec = lastDot > lastComma ? "." : ",";
  else if (lastComma > -1) dec = s.length - lastComma - 1 <= 2 && (s.match(/,/g) || []).length === 1 ? "," : null;
  else if (lastDot > -1) dec = s.length - lastDot - 1 <= 2 && (s.match(/\./g) || []).length === 1 ? "." : null;
  let intPart = s;
  let frac = "";
  if (dec) {
    const i = s.lastIndexOf(dec);
    intPart = s.slice(0, i);
    frac = s.slice(i + 1);
  }
  const n = Number(intPart.replace(/[.,]/g, "") + (frac ? `.${frac}` : ""));
  return Number.isNaN(n) ? null : round2(neg ? -n : n);
}

function normalizeDirection(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (["CR", "C", "K", "KR", "KREDIT", "CREDIT"].includes(s)) return "CR";
  if (["DR", "D", "DB", "DEBIT", "DEBET"].includes(s)) return "DR";
  return null;
}

// ── Baca file → tabel baris {n: nomor baris Excel, v: sel[]} ──
export async function loadTable(buffer, originalName) {
  if (/\.csv$/i.test(originalName)) {
    const rows = parseCsv(buffer.toString("utf8"));
    return rows.map((v, i) => ({ n: i + 1, v }));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const table = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const v = [];
    r.eachCell({ includeEmpty: true }, (c, col) => {
      let x = c.value;
      if (x && typeof x === "object" && !(x instanceof Date)) x = x.result ?? x.text ?? (x.richText ? x.richText.map((t) => t.text).join("") : "");
      v[col - 1] = x;
    });
    table.push({ n: r.number, v });
  });
  return table;
}

// ── Deteksi header transaksi ──
function detectHeader(table, fields) {
  for (let i = 0; i < Math.min(table.length, 60); i++) {
    const map = {};
    table[i].v.forEach((cell, col) => {
      const h = normH(cell);
      if (!h) return;
      for (const [k, list] of Object.entries(fields)) if (map[k] === undefined && list.includes(h)) map[k] = col;
    });
    if (map.date !== undefined && map.desc !== undefined && (map.amount !== undefined || map.debit !== undefined || map.credit !== undefined)) {
      return { index: i, map };
    }
  }
  return null;
}

// Kolom tanpa judul yang isinya kode pendek (mis. 0, 998) → Kode Transaksi bank
function guessCodeColumn(table, headerIndex, map) {
  const used = new Set(Object.values(map));
  const header = table[headerIndex].v;
  const width = Math.max(...table.slice(headerIndex).map((r) => r.v.length));
  for (let c = 0; c < width; c++) {
    if (used.has(c) || cellRaw(header[c]) !== "") continue;
    const vals = table.slice(headerIndex + 1).map((r) => cellRaw(r.v[c])).filter((x) => x !== "");
    if (vals.length >= 2 && vals.every((x) => /^\d{1,4}$/.test(x))) return c;
  }
  return null;
}

// ── Informasi rekening dari bagian atas file ──
function readAccount(table, headerIndex) {
  const acc = { number: null, name: null, currency: null, period: { raw: null, from: null, to: null } };
  for (let i = 0; i < Math.max(headerIndex, 0); i++) {
    const cells = table[i].v;
    for (let c = 0; c < cells.length; c++) {
      const raw = oneLine(cellRaw(cells[c]));
      if (!raw) continue;
      let label = raw;
      let value = "";
      if (raw.includes(":")) {
        const idx = raw.indexOf(":");
        label = raw.slice(0, idx);
        value = raw.slice(idx + 1).trim();
      }
      const key = Object.keys(HEADER_ALIASES).find((k) => HEADER_ALIASES[k].includes(normH(label)));
      if (!key) continue;
      if (!value) value = cells.slice(c + 1).map((x) => oneLine(cellRaw(x))).find(Boolean) || "";
      if (!value) continue;
      if (key === "account") acc.number = value;
      else if (key === "name") acc.name = value;
      else if (key === "currency") acc.currency = value;
      else if (key === "period") {
        acc.period.raw = value;
        const ds = value.match(/\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}/g) || [];
        acc.period.from = ds[0] ? parseDate(ds[0]) : null;
        acc.period.to = ds[1] ? parseDate(ds[1]) : null;
      }
    }
  }
  return acc;
}

/**
 * Urai file mutasi bank. opts: { adapter, mapping: { headerRow?, fields? } }
 * Mengembalikan akun, kolom & pemetaan, serta baris (valid/invalid). Tidak menyentuh database.
 */
export async function parseStatement(buffer, originalName, opts = {}) {
  const adapter = ADAPTERS[opts.adapter] || ADAPTERS.FINANCE;
  const table = await loadTable(buffer, originalName);
  if (table.length < 2) return { error: "File kosong atau tidak ada baris data." };

  let headerIndex;
  let map;
  let codeGuessed = false;
  if (opts.mapping?.fields && Object.keys(opts.mapping.fields).length) {
    headerIndex = table.findIndex((r) => r.n === Number(opts.mapping.headerRow || table[0].n));
    if (headerIndex < 0) headerIndex = 0;
    map = {};
    for (const [k, v] of Object.entries(opts.mapping.fields)) if (v !== "" && v !== null && v !== undefined) map[k] = Number(v);
  } else {
    const found = detectHeader(table, adapter.fields);
    if (!found) {
      return {
        error: "Header transaksi tidak ditemukan. Kolom wajib: tanggal, keterangan, dan nominal (atau debit/kredit). Atur pemetaan kolom manual.",
        needsMapping: true,
        sample: table.slice(0, 25).map((r) => ({ row: r.n, cells: r.v.map((x) => oneLine(cellRaw(x))) })),
      };
    }
    headerIndex = found.index;
    map = found.map;
    if (map.kode === undefined) {
      const g = guessCodeColumn(table, headerIndex, map);
      if (g !== null) {
        map.kode = g;
        codeGuessed = true;
      }
    }
  }
  const headerCells = table[headerIndex].v.map((x) => oneLine(cellRaw(x)));
  const width = Math.max(...table.slice(headerIndex).map((r) => r.v.length));
  const mappedCols = new Set(Object.values(map));
  // Kolom tanpa judul ikut ditampilkan (mis. kolom kode transaksi) supaya bisa dipetakan manual
  const columns = Array.from({ length: width }, (_, i) => ({ index: i, header: headerCells[i] || "", field: Object.keys(map).find((k) => map[k] === i) || null }))
    .filter((c) => c.header || c.field || table.slice(headerIndex + 1).some((r) => cellRaw(r.v[c.index]) !== ""));
  const account = readAccount(table, headerIndex);

  const hasSub = map.sub !== undefined && map.amount !== undefined;
  const rows = [];
  const seen = new Map(); // membedakan baris kembar dalam satu file
  for (let i = headerIndex + 1; i < table.length; i++) {
    const { n, v } = table[i];
    if (!v.some((c) => cellRaw(c) !== "")) continue;
    const get = (k) => (map[k] === undefined ? undefined : v[map[k]]);
    const errors = [];
    const date = parseDate(get("date"));
    const descFull = cellRaw(get("desc"));
    const desc = oneLine(descFull).slice(0, 255);
    let debit = 0;
    let credit = 0;
    let direction = null;
    if (hasSub) {
      direction = normalizeDirection(get("sub"));
      const a = parseMoneyExact(get("amount"));
      if (a === null || a === 0) errors.push("nominal kosong/0");
      else if (!direction) errors.push("kolom Sub bukan CR/DR");
      else if (direction === "CR") credit = Math.abs(a);
      else debit = Math.abs(a);
    } else if (map.amount !== undefined) {
      const a = parseMoneyExact(get("amount"));
      if (a === null || a === 0) errors.push("nominal kosong/0");
      else if (a > 0) {
        credit = a;
        direction = "CR";
      } else {
        debit = Math.abs(a);
        direction = "DR";
      }
    } else {
      // Konvensi rekening koran: Debit = uang keluar, Kredit = uang masuk
      debit = Math.abs(parseMoneyExact(get("debit")) || 0);
      credit = Math.abs(parseMoneyExact(get("credit")) || 0);
      if (!debit && !credit) errors.push("debit dan kredit kosong");
      else if (debit && credit) errors.push("debit dan kredit terisi bersamaan");
      else direction = credit ? "CR" : "DR";
    }
    if (!date) errors.push("tanggal tidak valid");
    if (!desc) errors.push("keterangan kosong");
    const balance = map.balance === undefined ? null : parseMoneyExact(get("balance"));
    const amount = round2(credit - debit);
    const key = `${date}|${desc}|${amount}|${balance ?? ""}`;
    const occ = (seen.get(key) || 0) + 1;
    seen.set(key, occ);
    const extra = {};
    headerCells.forEach((h, c) => {
      if (!mappedCols.has(c) && cellRaw(v[c]) !== "") extra[h || `Kolom ${String.fromCharCode(65 + (c % 26))}`] = cellRaw(v[c]);
    });
    rows.push({
      excelRow: n, date, description: desc, descriptionFull: descFull, debit, credit, amount, balance, direction,
      bankCode: cellRaw(get("kode")) || null, sourceReconCode: cellRaw(get("rekon")) || null, sourcePaymentCategory: cellRaw(get("kategori")) || null,
      extra, valid: errors.length === 0, errors, key, occ,
      // teks panjang atau multi-baris ikut membedakan hash (statement.description hanya 255 huruf)
      longSig: descFull.length > 255 || descFull.includes("\n") ? crypto.createHash("sha1").update(descFull).digest("hex").slice(0, 12) : "",
    });
  }
  return { adapter: opts.adapter && ADAPTERS[opts.adapter] ? opts.adapter : "FINANCE", headerRow: table[headerIndex].n, columns, mapping: map, codeGuessed, account, rows };
}

// ── Rekon Code buatan sistem ──
// Format diatur di Pengaturan › Penomoran (tipe "Mutasi Bank"). DEFAULT_CODE_FORMAT/formatReconCode = format lama (cadangan).
export const DEFAULT_CODE_FORMAT = "{BANK}/{YY}/{MM}/{SEQ}";

/** Awalan dari identitas rekening: nama bank (huruf/angka, maks 6) + 4 digit terakhir nomor rekening. */
export function bankPrefix(bank) {
  const name = String(bank.bank_name || "BANK").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "BANK";
  const last4 = String(bank.account_no || "").replace(/\D/g, "").slice(-4);
  return `${name}${last4}`;
}

export const ymOf = (isoDate) => `${isoDate.slice(2, 4)}/${isoDate.slice(5, 7)}`;

export function formatReconCode(format, prefix, ym, seq) {
  const [yy, mm] = ym.split("/");
  return String(format || DEFAULT_CODE_FORMAT)
    .replace("{BANK}", prefix).replace("{YY}", yy).replace("{MM}", mm)
    .replace("{SEQ}", String(seq).padStart(3, "0"));
}

/**
 * Beri nomor urut tiap baris sesuai urutan baris Excel, per periode (Pengaturan › Penomoran, tipe Mutasi Bank).
 * `cfg` = format penomoran; `maxSeq` = {periode → urutan terbesar yang sudah dipakai} untuk rekening ini.
 * Hasil `ym` = kunci periode yang disimpan di recon_ym ("YY/MM", "YY", atau "ALL"). Tidak menulis apa pun.
 */
export function assignReconCodes(rows, { cfg, prefix, maxSeq }) {
  const next = { ...maxSeq };
  const out = new Map();
  [...rows].sort((a, b) => a.excelRow - b.excelRow).forEach((r) => {
    const ym = reconPeriod(cfg.reset_mode, r.date);
    next[ym] = (next[ym] || 0) + 1;
    out.set(r.excelRow, { code: renderNumber(cfg, { date: r.date, bank: prefix, counter: next[ym] }), ym, seq: next[ym] });
  });
  return out;
}
