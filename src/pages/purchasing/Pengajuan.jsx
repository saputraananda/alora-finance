import { useEffect, useState } from "react";
import { HiOutlineShoppingCart } from "react-icons/hi2";
import { api } from "../../lib/api";
import FinanceOnly from "./components/FinanceOnly";
import RequestList from "./components/RequestList";
import { cn, rp } from "./utils/format";

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn("mt-1 text-xl font-extrabold tracking-tight text-slate-800", tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const TABS = [
  { key: "semua", label: "Semua pengajuan" },
  { key: "antrean", label: "Antrean Finance" },
];

export default function Pengajuan() {
  const [tab, setTab] = useState("antrean");
  const [sum, setSum] = useState(null);

  useEffect(() => {
    document.title = "Pengajuan | HO Finance";
    api("/finance-ho/purchasing/summary").then(setSum).catch(() => setSum(null));
  }, []);

  return (
    <FinanceOnly>
      <div className="space-y-5 p-4 sm:p-6">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">Pembelian</p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="rounded-xl bg-orange-50 p-2 text-orange-700"><HiOutlineShoppingCart className="h-5 w-5" /></div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Pengajuan</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pengajuan karyawan dari SuperApp. Antrean Finance berisi yang sudah lolos SPV/GA dan menunggu persetujuan Finance. Klik baris untuk melihat detail; pengajuan di Antrean Finance bisa disetujui atau ditolak dari sana.
          </p>
        </div>

        {sum && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Antrean Finance" value={rp(sum.antrean.count)} hint={`Rp ${rp(sum.antrean.amount)}`} tone={sum.antrean.count ? "text-amber-600" : undefined} />
            <Kpi label="Menunggu bayar" value={rp(sum.bayar.count)} hint={`Rp ${rp(sum.bayar.amount)} (nominal terisi)`} />
            <Kpi label="Kredit belum lunas" value={rp(sum.kredit.open)} hint={`Sisa Rp ${rp(sum.kredit.sisa)}`} />
            <Kpi label="Terbayar / ditolak" value={`${rp(sum.terbayar_count)} / ${rp(sum.ditolak_count)}`} hint="Seluruh periode" />
          </div>
        )}

        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-xl px-3.5 py-1.5 text-xs font-bold transition",
                tab === t.key ? "bg-emerald-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-400"
              )}
            >
              {t.label}
              {t.key === "antrean" && sum ? ` (${rp(sum.antrean.count)})` : ""}
            </button>
          ))}
        </div>

        <RequestList key={tab} tab={tab} emptyText={tab === "antrean" ? "Tidak ada pengajuan yang menunggu persetujuan Finance." : "Tidak ada pengajuan pada periode ini."} />
      </div>
    </FinanceOnly>
  );
}
