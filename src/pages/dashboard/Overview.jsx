import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineArchiveBox,
  HiOutlineClock,
  HiOutlineArrowRight,
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineLockOpen,
  HiOutlineScale,
} from "react-icons/hi2";
import { api } from "../../lib/api";

const cn = (...c) => c.filter(Boolean).join(" ");
const rupiah = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const jt = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1).replace(".", ",")} jt`;
  return rupiah(v);
};
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

// Warna status rekonsiliasi (konsisten dengan menu Rekonsiliasi)
const CELL = {
  COCOK: { cls: "bg-emerald-500", label: "Cocok" },
  SELISIH: { cls: "bg-amber-500", label: "Selisih" },
  BELUM: { cls: "bg-slate-300", label: "Belum dikunci" },
  KOSONG: { cls: "bg-slate-100 border border-slate-200", label: "Tidak ada transaksi" },
};

const AGING_COLOR = ["bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500"];

function Card({ title, subtitle, action, children, className }) {
  return (
    <section className={cn("rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function DashboardOverview({ year, month, outlet, refreshKey, onOutlets }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ year: String(year), month: String(month) });
      if (outlet) qs.set("outlet", outlet);
      const res = await api(`/finance-ho/dashboard/overview?${qs}`);
      setData(res.data);
      onOutlets?.(res.data.outlets);
    } catch (e) {
      setError(e.message || "Gagal memuat ringkasan per cabang.");
    } finally {
      setLoading(false);
    }
  }, [year, month, outlet, onOutlets]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (error) {
    return (
      <div className="mb-6 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
        <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  if (loading && !data) {
    return <div className="mb-6 rounded-2xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-400">Memuat ringkasan per cabang...</div>;
  }
  if (!data) return null;

  const { kpis, revenue_by_outlet: rev, reconciliation_grid: grid, actions, aging } = data;
  const maxRev = Math.max(1, ...rev.map((r) => r.revenue));
  const totalRev = rev.reduce((s, r) => s + r.revenue, 0);
  const agingMax = Math.max(1, ...aging.buckets.map((b) => b.amount));
  const gridDays = grid[0]?.days || [];

  return (
    <div className={cn("mb-6 space-y-6", loading && "opacity-60 transition")}>
      {/* KPI operasional */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <HiOutlineBanknotes className="h-4 w-4 text-teal-600" /> Laba cabang
          </div>
          <p className={cn("mt-2 text-2xl font-extrabold tracking-tight", kpis.branch_profit < 0 ? "text-rose-600" : "text-slate-900")}>Rp {jt(kpis.branch_profit)}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {kpis.branch_margin == null ? "Belum ada pendapatan cabang" : `margin ${String(kpis.branch_margin).replace(".", ",")}%`} ·{" "}
            {kpis.allocation_posted ? "setelah alokasi biaya pusat" : (
              <Link to="/finance-ho/tutup-buku?tab=alokasi" className="font-semibold text-amber-600 hover:underline">sebelum alokasi biaya pusat</Link>
            )}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <HiOutlineArchiveBox className="h-4 w-4 text-sky-600" /> Volume cucian
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{rupiah(kpis.volume_kg)} kg</p>
          <p className="mt-1 text-[11px] text-slate-500">
            ± {rupiah(kpis.volume_kg_per_day)} kg per hari · {rupiah(kpis.volume_pcs)} pcs satuan
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <HiOutlineBanknotes className="h-4 w-4 text-emerald-600" /> Pembayaran masuk
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">Rp {rupiah(kpis.payments_in)}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Pelunasan dari {kpis.posted_days} hari POS yang sudah diposting
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <HiOutlineScale className="h-4 w-4 text-indigo-600" /> Selisih kas
          </div>
          <p className={cn("mt-2 text-2xl font-extrabold tracking-tight", kpis.cash_diff_total < 0 ? "text-rose-600" : "text-slate-900")}>
            {kpis.cash_diff_total > 0 ? "+" : ""}
            {rupiah(kpis.cash_diff_total)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {kpis.cash_diff_days > 0 ? `Dari ${kpis.cash_diff_days} hari rekonsiliasi` : "Tidak ada selisih pada hari yang sudah dikunci"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <HiOutlineLockOpen className="h-4 w-4 text-amber-600" /> Hari belum dikunci
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{kpis.unlocked_days}</p>
          <p className="mt-1 text-[11px] text-slate-500">Hari berjalan yang punya transaksi tetapi belum direkonsiliasi</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <HiOutlineClock className="h-4 w-4 text-rose-500" /> Belum settle
          </div>
          {kpis.unsettled.count === 0 ? (
            <>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">Beres</p>
              <p className="mt-1 text-[11px] text-slate-500">Semua QRIS/EDC sudah cair</p>
            </>
          ) : (
            <>
              <p className={cn("mt-2 text-2xl font-extrabold tracking-tight", kpis.unsettled.oldest_days >= 2 ? "text-rose-600" : "text-slate-900")}>
                {kpis.unsettled.oldest_days} hari
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {kpis.unsettled.worst} · {kpis.unsettled.count} hari/metode · Rp {jt(kpis.unsettled.amount)} belum cair
              </p>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Pendapatan per cabang */}
        <Card
          className="xl:col-span-2"
          title="Pendapatan per cabang"
          subtitle="Dari jurnal yang sudah diposting"
          action={<span className="text-xs font-extrabold text-slate-700">Rp {jt(totalRev)}</span>}
        >
          {rev.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
              Belum ada jurnal pendapatan pada periode ini.
              <Link to="/finance-ho/integrasi-pos" className="mt-1 block font-bold text-emerald-700 hover:underline">
                Posting dari Integrasi POS
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {rev.map((r) => (
                <div key={r.outlet_id ?? "pusat"}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">{r.outlet_name}</span>
                    <span className="font-semibold tabular-nums text-slate-600">
                      {jt(r.revenue)}
                      <span className="ml-1.5 text-[10px] text-slate-400">{totalRev > 0 ? Math.round((r.revenue / totalRev) * 100) : 0}%</span>
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${Math.max(2, (r.revenue / maxRev) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Rekonsiliasi 8 hari */}
        <Card
          className="xl:col-span-3"
          title="Rekonsiliasi 8 hari terakhir"
          subtitle="Hijau cocok · oranye selisih · abu-abu belum dikunci"
          action={
            <Link to="/finance-ho/rekonsiliasi" className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
              Buka <HiOutlineArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-bold text-slate-400">
                  <th className="pb-2 pr-3 text-left font-bold" />
                  {gridDays.map((d) => (
                    <th key={d.date} className="pb-2 text-center font-bold tabular-nums">{ddmm(d.date)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((g) => (
                  <tr key={g.outlet_id}>
                    <td className="whitespace-nowrap py-1.5 pr-3 font-bold text-slate-700">{g.outlet_name}</td>
                    {g.days.map((d) => (
                      <td key={d.date} className="py-1.5 text-center">
                        <span
                          title={`${g.outlet_name} ${ddmm(d.date)}: ${CELL[d.status].label}`}
                          className={cn("inline-block h-5 w-5 rounded-md", CELL[d.status].cls)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Perlu tindakan */}
        <Card
          className="xl:col-span-2"
          title="Perlu tindakan"
          subtitle={actions.total > 0 ? `${actions.total} hal perlu diselesaikan (14 hari terakhir)` : undefined}
        >
          {actions.items.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
              <HiOutlineCheckCircle className="h-5 w-5 text-emerald-600" /> Semua beres.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {actions.items.map((a, i) => (
                <li key={i}>
                  <Link
                    to={a.link}
                    className="flex items-start gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50/40"
                  >
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", a.severity >= 3 ? "bg-rose-500" : a.severity === 2 ? "bg-amber-500" : "bg-slate-400")} />
                    <span className="flex-1">{a.text}</span>
                    <HiOutlineArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
              {actions.total > actions.items.length && (
                <li className="px-1 pt-1 text-[11px] text-slate-400">dan {actions.total - actions.items.length} lainnya</li>
              )}
            </ul>
          )}
        </Card>

        {/* Aging piutang */}
        <Card
          className="xl:col-span-3"
          title="Aging piutang ritel"
          subtitle={`Nota belum lunas per ${ddmm(aging.as_of)}, umur dihitung sejak nota dibuat`}
          action={<span className="text-xs font-extrabold text-slate-700">Rp {jt(aging.total)}</span>}
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              {aging.buckets.map((b, i) => (
                <div key={b.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">{b.label}</span>
                    <span className="tabular-nums text-slate-600">
                      {jt(b.amount)} <span className="text-[10px] text-slate-400">· {rupiah(b.count)} nota</span>
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn("h-full rounded-full", AGING_COLOR[i])} style={{ width: `${b.amount > 0 ? Math.max(2, (b.amount / agingMax) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
              {aging.over_90_percent >= 30 && (
                <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2.5 text-[11px] font-semibold text-rose-700">
                  <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {aging.over_90_percent.toString().replace(".", ",")}% piutang berumur lebih dari 90 hari. Perlu kebijakan penagihan atau penghapusan.
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">5 pelanggan terbesar</p>
              <ul className="divide-y divide-slate-100">
                {aging.top_customers.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-700">{c.customer}</p>
                      <p className="text-[10px] text-slate-400">{c.count} nota · tertua {rupiah(c.oldest)} hari</p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-700">{jt(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
