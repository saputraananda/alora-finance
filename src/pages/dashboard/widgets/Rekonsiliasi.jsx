import { Link } from "react-router-dom";
import { HiOutlineArrowRight } from "react-icons/hi2";
import { useDashData } from "../data";
import { Card, State, cn, ddmm } from "../ui";

// Warna status rekonsiliasi (konsisten dengan menu Rekonsiliasi)
const CELL = {
  COCOK: { cls: "bg-emerald-500", label: "Cocok" },
  SELISIH: { cls: "bg-amber-500", label: "Selisih" },
  BELUM: { cls: "bg-slate-300", label: "Belum dikunci" },
  KOSONG: { cls: "bg-slate-100 border border-slate-200", label: "Tidak ada transaksi" },
};

export default function Rekonsiliasi() {
  const entry = useDashData("overview");
  const grid = entry.data?.reconciliation_grid || [];
  const days = grid[0]?.days || [];

  return (
    <Card
      title="Rekonsiliasi 8 hari terakhir"
      subtitle="Hijau cocok · oranye selisih · abu-abu belum dikunci"
      right={
        <Link to="/finance-ho/rekonsiliasi" className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
          Buka <HiOutlineArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <State entry={entry} empty={entry.data && grid.length === 0 ? "Belum ada cabang." : null}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-bold text-slate-400">
                <th className="pb-2 pr-3 text-left font-bold" />
                {days.map((d) => <th key={d.date} className="pb-2 text-center font-bold tabular-nums">{ddmm(d.date)}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.map((g) => (
                <tr key={g.outlet_id}>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-bold text-slate-700">{g.outlet_name}</td>
                  {g.days.map((d) => (
                    <td key={d.date} className="py-1.5 text-center">
                      <span title={`${g.outlet_name} ${ddmm(d.date)}: ${CELL[d.status].label}`} className={cn("inline-block h-5 w-5 rounded-md", CELL[d.status].cls)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>
    </Card>
  );
}
