import { myWaschenPool } from "../db/pool.js";
import { toFixed2 } from "./currencyHelpers.js";
import { UNIT_SHARE_JOIN, unitShareExpr } from "./unit.js";

// Aging piutang ritel = nota POS yang belum lunas. Belum ada kebijakan jatuh tempo,
// jadi umur dihitung sejak nota dibuat. Dibaca langsung dari POS (bukan dari jurnal).
export const AGING_BUCKETS = [
  { key: "0-30", label: "0–30 hari", min: 0, max: 30 },
  { key: "31-60", label: "31–60 hari", min: 31, max: 60 },
  { key: "61-90", label: "61–90 hari", min: 61, max: 90 },
  { key: "90+", label: "> 90 hari", min: 91, max: Infinity },
];

// unit: 'all' | 'waschen' | 'cleanox' — sisa tagihan dibagi sesuai porsi nilai layanan unit pada tiap nota
export async function computeAging(outletId, today, topN = 5, unit = "all") {
  const share = unitShareExpr(unit);
  const [unpaid] = await myWaschenPool.query(
    `SELECT t.customer_id, c.name AS customer_name,
            ((t.grand_total - t.paid_amount) * ${share}) AS sisa,
            DATEDIFF(?, DATE(t.order_date)) AS age
     FROM tr_transaction t LEFT JOIN mst_customer c ON c.id = t.customer_id
     ${unit === "all" ? "" : UNIT_SHARE_JOIN}
     WHERE t.is_delete_requested = 0 AND t.payment_status <> 'Lunas' AND t.grand_total > t.paid_amount
       ${unit === "all" ? "" : `AND ${share} > 0`}
       ${outletId ? "AND t.outlet_id = ?" : ""}`,
    outletId ? [today, outletId] : [today]
  );
  const buckets = AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, amount: 0, count: 0 }));
  const custMap = new Map();
  let total = 0;
  unpaid.forEach((r) => {
    const sisa = Number(r.sisa);
    const age = Math.max(0, Number(r.age));
    const bi = AGING_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
    buckets[bi].amount += sisa;
    buckets[bi].count += 1;
    total += sisa;
    const ck = r.customer_id ?? "-";
    const c = custMap.get(ck) || { customer: r.customer_name || "Tanpa nama", amount: 0, count: 0, oldest: 0, buckets: [0, 0, 0, 0] };
    c.amount += sisa;
    c.count += 1;
    c.oldest = Math.max(c.oldest, age);
    c.buckets[bi] += sisa;
    custMap.set(ck, c);
  });
  buckets.forEach((b) => (b.amount = toFixed2(b.amount)));
  const customers = [...custMap.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topN)
    .map((c) => ({ ...c, amount: toFixed2(c.amount), buckets: c.buckets.map(toFixed2) }));
  return {
    as_of: today,
    total: toFixed2(total),
    count: unpaid.length,
    buckets,
    top_customers: customers,
    over_90_percent: total > 0 ? toFixed2((buckets[3].amount / total) * 100) : 0,
  };
}
