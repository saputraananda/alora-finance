import { syncDay, autoPostDay } from "../controllers/pos/pos.controller.js";
import { syncSetoran } from "../controllers/pos/setoran.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// Penarikan otomatis data POS tiap malam (Konsep hal. 7: "22.05 validasi otomatis").
// Hanya MENARIK dan MENCATAT (kapan diterima, valid/gagal, sidik data).
// Setelah ditarik, hari yang sudah lewat dan valid langsung dijurnalkan otomatis (tanpa tombol posting),
// begitu juga jurnal setoran kasir dari closing shift.
// Jam dapat diubah lewat env POS_SYNC_HOUR / POS_SYNC_MINUTE (WIB);
// POS_SYNC_ENABLED=false untuk mematikan.
// ════════════════════════════════════════════════════════════════════════════

const HOUR = Number(process.env.POS_SYNC_HOUR ?? 22);
const MINUTE = Number(process.env.POS_SYNC_MINUTE ?? 5);

const wibNow = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) % 24, minute: Number(g("minute")) };
};

const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

let lastRunDate = null;
const CATCHUP_DAYS = Number(process.env.POS_SYNC_CATCHUP_DAYS ?? 35);

export async function runNightlySync() {
  const { date } = wibNow();
  for (const d of [date, addDays(date, -1)]) {
    try {
      const r = await syncDay(d, "AUTO");
      console.log(`[posSync] ${d}: ${r.outlets} cabang ditarik${r.changed ? `, ${r.changed} berubah` : ""}`);
      const a = await autoPostDay(d); // hanya hari yang sudah lewat
      if (a.posted || a.skipped || a.failed.length) console.log(`[posSync] ${d}: ${a.posted} jurnal otomatis, ${a.skipped} dilewati${a.failed.length ? `, gagal: ${a.failed.map((f) => `${f.outlet} (${f.message})`).join("; ")}` : ""}`);
      const sk = await syncSetoran(d, d);
      if (sk.created) console.log(`[posSync] ${d}: ${sk.created} jurnal setoran kasir dibuat`);
    } catch (err) {
      console.error(`[posSync] ${d} gagal:`, err.message);
    }
  }
  // Kejar hari lama yang belum dijurnal (mis. belum pernah dibuka, atau pemetaan akun baru dilengkapi)
  for (let i = 2; i <= CATCHUP_DAYS; i++) {
    const d = addDays(date, -i);
    try {
      const a = await autoPostDay(d);
      if (a.posted) console.log(`[posSync] kejar ${d}: ${a.posted} jurnal otomatis`);
    } catch (err) {
      console.error(`[posSync] kejar ${d} gagal:`, err.message);
    }
  }
}

export function startPosSyncScheduler() {
  if (String(process.env.POS_SYNC_ENABLED).toLowerCase() === "false") {
    console.log("[posSync] dimatikan (POS_SYNC_ENABLED=false)");
    return;
  }
  setInterval(() => {
    const n = wibNow();
    if (n.hour === HOUR && n.minute >= MINUTE && lastRunDate !== n.date) {
      lastRunDate = n.date;
      runNightlySync();
    }
  }, 60 * 1000);
  console.log(`[posSync] jadwal aktif: setiap hari ${String(HOUR).padStart(2, "0")}.${String(MINUTE).padStart(2, "0")} WIB`);
}
