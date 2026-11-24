import { cutoffRangeForKey, cutoffRangeLabel, currentCutoffKey, todayWib } from "./cutoff";

// Periode standar (sama seperti "Jenis periode" di Front Office Cashier): Cutoff · Tahun · Bulan · Tanggal.
// Nilai: { mode: "cutoff"|"year"|"month"|"date", cutoff: "2026-11", year: "2026", month: "2026-11", from, to }
const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export const PERIOD_MODES = [["cutoff", "Cutoff"], ["year", "Tahun"], ["month", "Bulan"], ["date", "Tanggal"]];

// over: timpa sebagian nilai bawaan, mis. { mode: "date", from: kemarin, to: kemarin }
export function defaultPeriod(over = {}) {
  const today = todayWib();
  return { mode: "cutoff", cutoff: currentCutoffKey(), year: today.slice(0, 4), month: today.slice(0, 7), from: today, to: today, ...over };
}

export function yesterdayWib() {
  const [y, m, d] = todayWib().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function periodRange(p) {
  if (p.mode === "cutoff") return cutoffRangeForKey(p.cutoff);
  if (p.mode === "year") return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
  if (p.mode === "month") {
    const [y, m] = p.month.split("-").map(Number);
    return { from: `${p.month}-01`, to: `${p.month}-${pad(new Date(y, m, 0).getDate())}` };
  }
  return { from: p.from, to: p.to < p.from ? p.from : p.to };
}

const dmy = (s) => s.split("-").reverse().join("/");
export function periodLabel(p) {
  if (p.mode === "cutoff") return `Cutoff ${cutoffRangeLabel(p.cutoff)}`;
  if (p.mode === "year") return `Tahun ${p.year}`;
  if (p.mode === "month") return `${MONTHS[Number(p.month.slice(5, 7)) - 1]} ${p.month.slice(0, 4)}`;
  const r = periodRange(p);
  return r.from === r.to ? dmy(r.from) : `${dmy(r.from)} – ${dmy(r.to)}`;
}

// true bila periode berbeda dari bawaan (untuk angka di tombol Filter)
export function periodChanged(p, base) {
  return ["mode", "cutoff", "year", "month", "from", "to"].some((k) => p[k] !== base[k]);
}
