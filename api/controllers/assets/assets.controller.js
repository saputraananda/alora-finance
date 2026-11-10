import { pool, safeQuery, getOutlets } from "../../db/pool.js";
import { toFixed2 } from "../../utils/currencyHelpers.js";
import { cutoffRange, currentCutoffMonth } from "../dashboard/dashboard.controller.js";

// ════════════════════════════════════════════════════════════════════════════
// ASET TETAP (Referensi hal. 23, Konsep hal. 20)
// "Setiap mesin tercatat per unit dan per cabang". Penyusutan garis lurus per bulan:
//   (harga perolehan − nilai sisa) / umur (bulan). Jurnal tiap akhir periode,
//   dimensi cabang mengikuti lokasi aset: Dr Beban Penyusutan · Cr Akumulasi Penyusutan.
// Catatan: jurnal PEROLEHAN aset tidak dibuat di sini (dicatat lewat jurnal manual / pembelian).
// ════════════════════════════════════════════════════════════════════════════

export const ASSET_ROLES = {
  ASET_TETAP: { label: "Aset Tetap (Mesin & Peralatan)", code: "1-2001" },
  AKUM_PENYUSUTAN: { label: "Akumulasi Penyusutan", code: "1-2002" },
  BEBAN_PENYUSUTAN: { label: "Beban Penyusutan", code: "5-1012" },
};

const LIVE_POSTED = "je.status = 'POSTED'";
const pad2 = (n) => String(n).padStart(2, "0");


function periodOf(q) {
  const cur = currentCutoffMonth();
  const year = parseInt(q.year, 10) || cur.year;
  const month = parseInt(q.month, 10) || cur.month;
  return { year, month, key: `${year}-${pad2(month)}`, ...cutoffRange(year, month) };
}

const monthlyOf = (a) => toFixed2(Math.max(0, Number(a.cost) - Number(a.salvage)) / Math.max(1, Number(a.life_months)));

// Aset + akumulasi penyusutan (hanya dari jurnal penyusutan yang masih POSTED)
async function loadAssets() {
  const [rows] = await pool.query(
    `SELECT a.*, DATE_FORMAT(a.acquisition_date,'%Y-%m-%d') AS acq, DATE_FORMAT(a.disposed_at,'%Y-%m-%d') AS disp,
            a.opening_accum + COALESCE(SUM(CASE WHEN ${LIVE_POSTED} THEN d.amount END), 0) AS accum,
            COUNT(CASE WHEN ${LIVE_POSTED} THEN 1 END) AS months_done
     FROM mst_asset a
     LEFT JOIN tr_depreciation d ON d.asset_id = a.id
     LEFT JOIN tr_journal_entries je ON je.id = d.journal_id
     GROUP BY a.id ORDER BY a.outlet_id, a.code`
  );
  return rows;
}

// Daftar penyusutan yang akan/telah dibuat untuk periode P
async function depreciationPlan(p) {
  const assets = await loadAssets();
  const [done] = await pool.query(
    `SELECT d.asset_id, d.amount, d.outlet_id FROM tr_depreciation d JOIN tr_journal_entries je ON je.id = d.journal_id
     WHERE d.period_key = ? AND ${LIVE_POSTED}`,
    [p.key]
  );
  const doneBy = new Map(done.map((d) => [Number(d.asset_id), d]));
  const plan = [];
  for (const a of assets) {
    const posted = doneBy.get(Number(a.id));
    if (posted) {
      plan.push({ asset: a, amount: toFixed2(posted.amount), outlet_id: posted.outlet_id, posted: true });
      continue;
    }
    if (a.acq > p.end) continue; // belum diperoleh
    if (a.status !== "AKTIF" && a.disp && a.disp < p.start) continue; // sudah dilepas sebelum periode
    const remaining = toFixed2(Number(a.cost) - Number(a.salvage) - Number(a.accum));
    if (remaining <= 0) continue; // sudah habis disusutkan
    plan.push({ asset: a, amount: toFixed2(Math.min(monthlyOf(a), remaining)), outlet_id: a.outlet_id, posted: false });
  }
  return plan;
}

// ── GET /assets?year=&month= ────────────────────────────────────────────
export async function getAssets(req, res) {
  try {
    const p = periodOf(req.query);
    const [assets, plan, outlets, [[journal]]] = await Promise.all([
      loadAssets(),
      depreciationPlan(p),
      getOutlets(),
      pool.query(`SELECT entry_no, status FROM tr_journal_entries WHERE source_type = 'PENYUSUTAN' AND source_ref = ? ORDER BY id DESC LIMIT 1`, [`SUSUT-${p.key}`]).then(([r]) => [r.length ? r : [null]]),
    ]);
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));
    const planBy = new Map(plan.map((x) => [Number(x.asset.id), x]));
    const byOutlet = new Map();
    plan.forEach((x) => {
      const k = x.outlet_id ? Number(x.outlet_id) : 0;
      byOutlet.set(k, toFixed2((byOutlet.get(k) || 0) + x.amount));
    });
    return res.json({
      period: { year: p.year, month: p.month, key: p.key, from: p.start, to: p.end },
      outlets: outlets.map((o) => ({ id: o.id, name: o.name })),
      assets: assets.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        category: a.category,
        outlet_id: a.outlet_id,
        outlet_name: a.outlet_id ? nameOf.get(Number(a.outlet_id)) || `Outlet #${a.outlet_id}` : "Pusat",
        acquisition_date: a.acq,
        cost: toFixed2(a.cost),
        salvage: toFixed2(a.salvage),
        opening_accum: toFixed2(a.opening_accum),
        life_months: a.life_months,
        monthly: monthlyOf(a),
        accum: toFixed2(a.accum),
        book_value: toFixed2(Number(a.cost) - Number(a.accum)),
        months_done: Number(a.months_done),
        status: a.status,
        disposed_at: a.disp,
        notes: a.notes,
        this_period: planBy.get(Number(a.id))?.amount || 0,
        has_depreciation: Number(a.months_done) > 0,
      })),
      depreciation: {
        total: toFixed2(plan.reduce((s, x) => s + x.amount, 0)),
        by_outlet: [...byOutlet.entries()].map(([k, v]) => ({ outlet_id: k || null, outlet_name: k ? nameOf.get(k) || `Outlet #${k}` : "Pusat", amount: v })),
        journal: journal || null,
        can_run: plan.some((x) => !x.posted) && (!journal || journal.status === "REVERSED"),
      },
    });
  } catch (err) {
    console.error("[getAssets]", err);
    return res.status(500).json({ message: "Gagal memuat aset tetap", error: err.message });
  }
}

function assetPayload(b = {}) {
  const code = String(b.code || "").trim().toUpperCase().slice(0, 40);
  const name = String(b.name || "").trim().slice(0, 150);
  const cost = toFixed2(b.cost);
  const salvage = toFixed2(b.salvage || 0);
  const openingAccum = toFixed2(b.opening_accum || 0);
  const life = parseInt(b.life_months, 10);
  const acq = String(b.acquisition_date || "").slice(0, 10);
  if (!code || !name) return { error: "Kode dan nama aset wajib diisi." };
  if (!(cost > 0)) return { error: "Harga perolehan harus lebih dari 0." };
  if (salvage < 0 || salvage >= cost) return { error: "Nilai sisa harus 0 atau lebih kecil dari harga perolehan." };
  if (!(life > 0 && life <= 600)) return { error: "Umur (bulan) harus antara 1 dan 600." };
  if (openingAccum < 0 || openingAccum > cost - salvage) return { error: "Akumulasi awal tidak boleh melebihi harga perolehan dikurangi nilai sisa." };
  if (Number.isNaN(Date.parse(`${acq}T00:00:00Z`))) return { error: "Tanggal perolehan tidak valid." };
  return {
    value: {
      code, name, cost, salvage, opening_accum: openingAccum, life_months: life, acquisition_date: acq,
      category: String(b.category || "").trim().slice(0, 60) || null,
      outlet_id: b.outlet_id ? Number(b.outlet_id) : null,
      notes: String(b.notes || "").trim().slice(0, 255) || null,
    },
  };
}

// ── POST /assets ────────────────────────────────────────────────────────
export async function createAsset(req, res) {
  try {
    const p = assetPayload(req.body);
    if (p.error) return res.status(422).json({ message: p.error });
    const v = p.value;
    await pool.query(
      `INSERT INTO mst_asset (code, name, category, outlet_id, acquisition_date, cost, salvage, opening_accum, life_months, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.code, v.name, v.category, v.outlet_id, v.acquisition_date, v.cost, v.salvage, v.opening_accum, v.life_months, v.notes, req.user?.id || null]
    );
    return res.status(201).json({ message: `Aset ${v.code} ditambahkan.` });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(422).json({ message: "Kode aset sudah dipakai." });
    return res.status(500).json({ message: "Gagal menambah aset", error: err.message });
  }
}

// ── PUT /assets/:id — nilai keuangan terkunci setelah ada penyusutan ────
export async function updateAsset(req, res) {
  try {
    const p = assetPayload(req.body);
    if (p.error) return res.status(422).json({ message: p.error });
    const v = p.value;
    const [[a]] = await pool.query(
      `SELECT a.*, DATE_FORMAT(a.acquisition_date,'%Y-%m-%d') AS acq,
              (SELECT COUNT(*) FROM tr_depreciation d JOIN tr_journal_entries je ON je.id = d.journal_id WHERE d.asset_id = a.id AND ${LIVE_POSTED}) AS deps
       FROM mst_asset a WHERE a.id = ?`,
      [req.params.id]
    ).then(([r]) => [r]);
    if (!a) return res.status(404).json({ message: "Aset tidak ditemukan." });
    const financialChanged = toFixed2(a.cost) !== v.cost || toFixed2(a.salvage) !== v.salvage || toFixed2(a.opening_accum) !== v.opening_accum || Number(a.life_months) !== v.life_months || a.acq !== v.acquisition_date;
    if (a.deps > 0 && financialChanged) {
      return res.status(422).json({ message: "Harga, nilai sisa, umur, dan tanggal perolehan tidak bisa diubah setelah ada penyusutan." });
    }
    if (a.deps > 0 && Number(a.outlet_id || 0) !== Number(v.outlet_id || 0)) {
      return res.status(422).json({ message: "Gunakan 'Pindah lokasi' untuk mengubah cabang aset yang sudah disusutkan." });
    }
    await pool.query(
      `UPDATE mst_asset SET code=?, name=?, category=?, outlet_id=?, acquisition_date=?, cost=?, salvage=?, opening_accum=?, life_months=?, notes=? WHERE id=?`,
      [v.code, v.name, v.category, v.outlet_id, v.acquisition_date, v.cost, v.salvage, v.opening_accum, v.life_months, v.notes, a.id]
    );
    return res.json({ message: `Aset ${v.code} diperbarui.` });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(422).json({ message: "Kode aset sudah dipakai." });
    return res.status(500).json({ message: "Gagal memperbarui aset", error: err.message });
  }
}

// ── POST /assets/:id/move {to_outlet, date, note} ───────────────────────
export async function moveAsset(req, res) {
  try {
    const [[a]] = await pool.query(`SELECT id, outlet_id, status FROM mst_asset WHERE id = ?`, [req.params.id]).then(([r]) => [r]);
    if (!a) return res.status(404).json({ message: "Aset tidak ditemukan." });
    if (a.status !== "AKTIF") return res.status(422).json({ message: "Aset sudah dilepas." });
    const to = req.body?.to_outlet ? Number(req.body.to_outlet) : null;
    const date = String(req.body?.date || "").slice(0, 10);
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return res.status(422).json({ message: "Tanggal pindah tidak valid." });
    if (Number(a.outlet_id || 0) === Number(to || 0)) return res.status(422).json({ message: "Lokasi tujuan sama dengan lokasi sekarang." });
    await pool.query(`INSERT INTO tr_asset_move (asset_id, moved_at, from_outlet, to_outlet, note, created_by) VALUES (?, ?, ?, ?, ?, ?)`, [a.id, date, a.outlet_id, to, String(req.body?.note || "").slice(0, 255) || null, req.user?.id || null]);
    await pool.query(`UPDATE mst_asset SET outlet_id = ? WHERE id = ?`, [to, a.id]);
    return res.json({ message: "Lokasi aset dipindahkan. Penyusutan berikutnya dibebankan ke lokasi baru." });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memindahkan aset", error: err.message });
  }
}

// ── POST /assets/:id/dispose {type: DIJUAL|DIHAPUS, date, note} ─────────
export async function disposeAsset(req, res) {
  try {
    const type = req.body?.type === "DIJUAL" ? "DIJUAL" : "DIHAPUS";
    const date = String(req.body?.date || "").slice(0, 10);
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return res.status(422).json({ message: "Tanggal tidak valid." });
    const [r] = await pool.query(
      `UPDATE mst_asset SET status = ?, disposed_at = ?, notes = CONCAT_WS(' · ', notes, ?) WHERE id = ? AND status = 'AKTIF'`,
      [type, date, String(req.body?.note || "").slice(0, 120) || null, req.params.id]
    );
    if (!r.affectedRows) return res.status(422).json({ message: "Aset tidak ditemukan atau sudah dilepas." });
    return res.json({ message: `Aset ditandai ${type === "DIJUAL" ? "dijual" : "dihapus"}. Penyusutan berhenti. Jurnal pelepasan (laba/rugi) dibuat lewat jurnal manual.` });
  } catch (err) {
    return res.status(500).json({ message: "Gagal melepas aset", error: err.message });
  }
}

// ── POST /assets/depreciation {year, month} — "Jalankan penyusutan" ─────
export async function runDepreciation(req, res) {
  const conn = await pool.getConnection();
  try {
    const p = periodOf(req.body || {});
    const [map] = await pool.query(`SELECT role, account_id FROM mst_account_map WHERE role IN ('AKUM_PENYUSUTAN','BEBAN_PENYUSUTAN')`);
    const acc = Object.fromEntries(map.map((m) => [m.role, m.account_id]));
    if (!acc.AKUM_PENYUSUTAN || !acc.BEBAN_PENYUSUTAN) return res.status(422).json({ message: "Peran akun Beban/Akumulasi Penyusutan belum dipetakan di Pengaturan." });
    const ref = `SUSUT-${p.key}`;
    const [[existing]] = await pool.query(`SELECT entry_no, status FROM tr_journal_entries WHERE source_type='PENYUSUTAN' AND source_ref=? ORDER BY id DESC LIMIT 1`, [ref]).then(([r]) => [r.length ? r : [null]]);
    if (existing && existing.status !== "REVERSED") return res.status(422).json({ message: `Penyusutan periode ini sudah diposting (${existing.entry_no}).` });
    const plan = (await depreciationPlan(p)).filter((x) => !x.posted && x.amount > 0);
    if (!plan.length) return res.status(422).json({ message: "Tidak ada aset yang perlu disusutkan pada periode ini." });

    const byOutlet = new Map();
    plan.forEach((x) => {
      const k = x.outlet_id ? Number(x.outlet_id) : 0;
      byOutlet.set(k, toFixed2((byOutlet.get(k) || 0) + x.amount));
    });
    const total = toFixed2(plan.reduce((s, x) => s + x.amount, 0));

    await conn.beginTransaction();
    // Hapus jejak penyusutan dari jurnal yang sudah dibalik agar periode bisa dijalankan ulang
    await conn.query(
      `DELETE d FROM tr_depreciation d JOIN tr_journal_entries je ON je.id = d.journal_id WHERE d.period_key = ? AND je.status = 'REVERSED'`,
      [p.key]
    );
    const [[cnt]] = await conn.query(`SELECT COUNT(*) AS n FROM tr_journal_entries WHERE source_ref = ?`, [ref]).then(([r]) => [r]);
    const entryNo = cnt.n ? `JU-${ref}-v${cnt.n + 1}` : `JU-${ref}`;
    const [h] = await conn.query(
      `INSERT INTO tr_journal_entries (entry_no, entry_date, description, status, total_amount, created_by, source_type, source_ref, approved_by, approved_at)
       VALUES (?, ?, ?, 'POSTED', ?, ?, 'PENYUSUTAN', ?, ?, NOW())`,
      [entryNo, p.end, `Penyusutan aset tetap ${p.key} (${plan.length} aset)`, total, req.user?.id || null, ref, req.user?.id || null]
    );
    let n = 1;
    for (const [k, v] of byOutlet) {
      await conn.query(`INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, ?, 0, 'Beban penyusutan', ?)`, [h.insertId, n++, acc.BEBAN_PENYUSUTAN, v, k || null]);
      await conn.query(`INSERT INTO tr_journal_lines (entry_id, line_no, account_id, debit, credit, memo, outlet_id) VALUES (?, ?, ?, 0, ?, 'Akumulasi penyusutan', ?)`, [h.insertId, n++, acc.AKUM_PENYUSUTAN, v, k || null]);
    }
    for (const x of plan) {
      await conn.query(`INSERT INTO tr_depreciation (asset_id, period_key, amount, outlet_id, journal_id) VALUES (?, ?, ?, ?, ?)`, [x.asset.id, p.key, x.amount, x.outlet_id || null, h.insertId]);
    }
    await conn.commit();
    return res.status(201).json({ message: `Penyusutan ${plan.length} aset diposting sebagai ${entryNo} (Rp ${new Intl.NumberFormat("id-ID").format(total)}).` });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("[runDepreciation]", err);
    return res.status(500).json({ message: "Gagal menjalankan penyusutan", error: err.message });
  } finally {
    conn.release();
  }
}
