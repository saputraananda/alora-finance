// Periode cutoff Waschen: tanggal 26 bulan sebelumnya → 25 bulan berjalan.
// Hari ≥ 26 sudah masuk periode bulan berikutnya. Semua tanggal memakai kalender WIB.
// Kunci periode = bulan tempat periode itu berakhir (mis. "2026-11" = 26 Okt – 25 Nov 2026).

const pad = (n) => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTH_FULL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Tanggal hari ini (WIB) sebagai [tahun, bulan, hari]. */
export function todayWibParts() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" })
    .format(new Date())
    .split("-")
    .map(Number);
}

/** Tanggal hari ini (WIB) YYYY-MM-DD. */
export function todayWib() {
  const [y, m, d] = todayWibParts();
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Periode cutoff yang sedang berjalan → { year, month }. */
export function currentCutoff() {
  const [y, m, d] = todayWibParts();
  const dt = new Date(Date.UTC(y, m - 1 + (d >= 26 ? 1 : 0), 1));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1 };
}

/** "2026-11" untuk periode cutoff yang sedang berjalan. */
export function currentCutoffKey() {
  const { year, month } = currentCutoff();
  return `${year}-${pad(month)}`;
}

/** Rentang tanggal sebuah periode: { from, to } (YYYY-MM-DD). */
export function cutoffRange(year, month) {
  const sy = month === 1 ? year - 1 : year;
  const sm = month === 1 ? 12 : month - 1;
  return { from: `${sy}-${pad(sm)}-26`, to: `${year}-${pad(month)}-25` };
}

export function cutoffRangeForKey(key) {
  const [y, m] = key.split("-").map(Number);
  return cutoffRange(y, m);
}

const fmt = (s) => `${Number(s.slice(8, 10))} ${MON[Number(s.slice(5, 7)) - 1]}`;

/** Daftar kunci periode, terbaru dulu (untuk pilihan dropdown). */
export function recentCutoffKeys(count = 18) {
  const { year, month } = currentCutoff();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  });
}

/** "November 2026" */
export function cutoffMonthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_FULL[m - 1]} ${y}`;
}

/** "26 Okt – 25 Nov 2026" */
export function cutoffRangeLabel(key) {
  const { from, to } = cutoffRangeForKey(key);
  return `${fmt(from)} – ${fmt(to)} ${to.slice(0, 4)}`;
}
