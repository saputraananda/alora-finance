// ════════════════════════════════════════════════════════════════════════════
// PENOMORAN DOKUMEN (Pengaturan › Penomoran)
// Format = daftar komponen berurutan, mis. [TEXT "JM", TEXT "-", YEAR2, MONTH, DAY, TEXT "-", COUNTER].
// Tipe Transaksi menentukan komponen khusus yang tersedia dan Tipe Penomoran (reset) yang boleh dipilih.
// Tipe baru cukup ditambahkan di TYPES (lalu disambungkan ke tempat nomornya dibuat).
// ════════════════════════════════════════════════════════════════════════════

export const BASE_COMPONENTS = {
  TEXT: "Teks tetap",
  YEAR4: "Tahun (4 digit)",
  YEAR2: "Tahun (2 digit)",
  MONTH: "Bulan (2 digit)",
  DAY: "Tanggal (2 digit)",
  COUNTER: "Counter",
};

export const RESET_LABEL = { day: "Reset tiap hari", month: "Reset tiap bulan", year: "Reset tiap tahun", none: "Berlanjut (tidak reset)" };

export const TYPES = {
  JURNAL: {
    label: "Jurnal Umum (manual)",
    hint: "Dipakai saat jurnal manual disimpan.",
    extra: { BRANCH: "Kode cabang" },
    resets: ["day", "month", "year", "none"],
    maxLength: 50, // tr_journal_entries.entry_no
  },
  MUTASI: {
    label: "Mutasi Bank (Rekon Code)",
    hint: "Dipakai saat impor rekening koran. Urutan dihitung per rekening.",
    extra: { BANK: "Kode bank + 4 digit akhir rekening" },
    resets: ["month", "year", "none"], // recon_ym (char 5) hanya menampung bulan/tahun/ALL
    maxLength: 60, // tr_bank_statement_meta.recon_code
  },
};

// Format yang berjalan sebelum ada pengaturan (dipakai bila tabel/default belum ada)
export const FALLBACK = {
  JURNAL: { id: null, name: "Jurnal Umum (bawaan)", txn_type: "JURNAL", reset_mode: "day", digits: 2, components: [{ k: "TEXT", v: "JM" }, { k: "TEXT", v: "-" }, { k: "YEAR2" }, { k: "MONTH" }, { k: "DAY" }, { k: "TEXT", v: "-" }, { k: "COUNTER" }] },
  MUTASI: { id: null, name: "Rekon Code (bawaan)", txn_type: "MUTASI", reset_mode: "month", digits: 3, components: [{ k: "BANK" }, { k: "TEXT", v: "/" }, { k: "YEAR2" }, { k: "TEXT", v: "/" }, { k: "MONTH" }, { k: "TEXT", v: "/" }, { k: "COUNTER" }] },
};

const TEXT_RE = /^[A-Za-z0-9\-/._]+$/;
export const componentsFor = (type) => ({ ...BASE_COMPONENTS, ...(TYPES[type]?.extra || {}) });
const parseComps = (c) => (Array.isArray(c) ? c : (() => { try { return JSON.parse(c || "[]"); } catch { return []; } })());

export function normalizeRow(r) {
  return { ...r, digits: Number(r.digits), components: parseComps(r.components), is_default: Number(r.is_default) === 1, is_active: Number(r.is_active) === 1 };
}

/** Nomor dari format. ctx: { date: 'YYYY-MM-DD', branch, bank, counter } */
export function renderNumber(cfg, ctx) {
  const d = String(ctx.date || "").slice(0, 10);
  return cfg.components
    .map((c) => {
      switch (c.k) {
        case "TEXT": return String(c.v || "");
        case "YEAR4": return d.slice(0, 4);
        case "YEAR2": return d.slice(2, 4);
        case "MONTH": return d.slice(5, 7);
        case "DAY": return d.slice(8, 10);
        case "BRANCH": return String(ctx.branch || "HO").toUpperCase();
        case "BANK": return String(ctx.bank || "");
        case "COUNTER": return String(ctx.counter).padStart(cfg.digits || 1, "0");
        default: return "";
      }
    })
    .join("");
}

/** Kunci periode counter untuk tanggal dokumen */
export function periodKey(reset, date) {
  const d = String(date).slice(0, 10);
  if (reset === "day") return d;
  if (reset === "month") return d.slice(0, 7);
  if (reset === "year") return d.slice(0, 4);
  return "ALL";
}

/** Lingkup counter: per cabang / per bank bila komponennya dipakai (nomor tiap cabang mulai dari 1 sendiri). */
export function scopeKey(cfg, ctx) {
  if (cfg.components.some((c) => c.k === "BRANCH")) return String(ctx.branch || "HO").toUpperCase().slice(0, 40);
  if (cfg.components.some((c) => c.k === "BANK")) return String(ctx.bank || "").slice(0, 40);
  return "";
}
export const hasScope = (cfg) => cfg.components.some((c) => c.k === "BRANCH" || c.k === "BANK");

/** Validasi isian dari layar Pengaturan. Mengembalikan { errors, value }. */
export function validateConfig(body, { lockedType } = {}) {
  const errors = [];
  const type = lockedType || String(body?.txn_type || "");
  const T = TYPES[type];
  if (!T) errors.push("Tipe transaksi tidak dikenal.");
  const name = String(body?.name || "").trim().slice(0, 80);
  if (!name) errors.push("Nama wajib diisi.");
  const reset = String(body?.reset_mode || "");
  if (T && !T.resets.includes(reset)) errors.push("Tipe penomoran tidak tersedia untuk tipe transaksi ini.");
  const digits = Number(body?.digits);
  if (!Number.isInteger(digits) || digits < 1 || digits > 10) errors.push("Jumlah digit counter harus 1–10.");
  const allowed = componentsFor(type);
  const comps = (Array.isArray(body?.components) ? body.components : []).map((c) => (c?.k === "TEXT" ? { k: "TEXT", v: String(c.v ?? "").trim() } : { k: String(c?.k || "") }));
  if (!comps.length) errors.push("Tambahkan komponen penomoran.");
  if (comps.some((c) => !allowed[c.k])) errors.push("Ada komponen yang tidak tersedia untuk tipe transaksi ini.");
  if (comps.filter((c) => c.k === "COUNTER").length !== 1) errors.push("Komponen Counter wajib ada tepat satu.");
  const singles = comps.filter((c) => c.k !== "TEXT").map((c) => c.k);
  if (new Set(singles).size !== singles.length) errors.push("Setiap komponen selain Teks tetap hanya boleh dipakai sekali.");
  comps.filter((c) => c.k === "TEXT").forEach((c) => {
    if (!c.v) errors.push("Ada komponen Teks tetap yang masih kosong.");
    else if (!TEXT_RE.test(c.v) || c.v.length > 20) errors.push(`Teks tetap "${c.v}" hanya boleh huruf, angka, dan - / . _ (maks. 20 karakter).`);
  });
  // Periode reset harus tercermin di nomor, supaya counter yang mulai dari 1 lagi tidak menghasilkan nomor kembar
  const has = (k) => comps.some((c) => c.k === k);
  const hasYear = has("YEAR4") || has("YEAR2");
  if (reset === "day" && !(hasYear && has("MONTH") && has("DAY"))) errors.push("Reset tiap hari butuh komponen Tahun, Bulan, dan Tanggal agar nomor tidak kembar.");
  if (reset === "month" && !(hasYear && has("MONTH"))) errors.push("Reset tiap bulan butuh komponen Tahun dan Bulan agar nomor tidak kembar.");
  if (reset === "year" && !hasYear) errors.push("Reset tiap tahun butuh komponen Tahun agar nomor tidak kembar.");
  const value = { name, txn_type: type, reset_mode: reset, digits, components: comps };
  if (T && !errors.length) {
    const sample = renderNumber(value, { date: "2026-12-31", branch: "XXXXXX", bank: "BANKXX9999", counter: 10 ** digits - 1 });
    if (sample.length > T.maxLength) errors.push(`Nomor terlalu panjang (${sample.length} karakter, maks. ${T.maxLength}).`);
  }
  return { errors: [...new Set(errors)], value };
}

export const formatSignature = (v) => `${v.txn_type}|${v.reset_mode}|${v.digits}|${v.components.map((c) => (c.k === "TEXT" ? `"${c.v}"` : c.k)).join(",")}`;

/** Format default yang aktif untuk tipe transaksi; tanpa tabel/baris → format bawaan. */
export async function loadDefault(conn, type) {
  try {
    const [rows] = await conn.query(`SELECT * FROM mst_numbering WHERE txn_type = ? AND is_default = 1 AND is_active = 1 ORDER BY id LIMIT 1`, [type]);
    if (rows.length) return normalizeRow(rows[0]);
  } catch {
    /* tabel belum dibuat (migrasi 006): pakai bawaan */
  }
  return FALLBACK[type];
}

/**
 * Ambil nomor berikutnya secara atomik (wajib di dalam transaksi; batal → counter ikut batal).
 * `exists(no)` memeriksa nomor sudah dipakai; bila ya, counter dinaikkan lagi (aman untuk data lama/format kembar).
 */
export async function takeNumber(conn, cfg, ctx, exists) {
  const pk = periodKey(cfg.reset_mode, ctx.date);
  const sk = scopeKey(cfg, ctx);
  for (let i = 0; i < 5000; i++) {
    let n;
    if (cfg.id) {
      await conn.query(
        `INSERT INTO tr_numbering_counter (numbering_id, period_key, scope_key, last_no) VALUES (?, ?, ?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)`,
        [cfg.id, pk, sk]
      );
      const [[r]] = await conn.query(`SELECT LAST_INSERT_ID() AS n`);
      n = Number(r.n);
    } else {
      n = i + 1; // format bawaan tanpa tabel: cari nomor kosong pertama
    }
    const no = renderNumber(cfg, { ...ctx, counter: n });
    if (!(await exists(no))) return no;
  }
  throw new Error("Tidak menemukan nomor yang kosong. Periksa pengaturan penomoran.");
}

/** Counter berikutnya (tanpa menaikkan) untuk tampilan Pengaturan. */
export async function peekCounter(conn, cfg, ctx) {
  if (!cfg.id) return 1;
  const [[r]] = await conn
    .query(`SELECT last_no FROM tr_numbering_counter WHERE numbering_id = ? AND period_key = ? AND scope_key = ?`, [cfg.id, periodKey(cfg.reset_mode, ctx.date), scopeKey(cfg, ctx)])
    .then(([x]) => [x.length ? x : [null]]);
  return Number(r?.last_no || 0) + 1;
}

// ── Rekon Code (MUTASI): urutan disimpan di tr_bank_statement_meta (recon_ym = kunci periode, recon_seq = urutan) ──
/** Kunci periode Rekon Code untuk kolom recon_ym (char 5): "YY/MM", "YY", atau "ALL". */
export function reconPeriod(reset, isoDate) {
  if (reset === "year") return isoDate.slice(2, 4);
  if (reset === "none") return "ALL";
  return `${isoDate.slice(2, 4)}/${isoDate.slice(5, 7)}`;
}
