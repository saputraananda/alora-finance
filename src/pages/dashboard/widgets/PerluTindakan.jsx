import { Link } from "react-router-dom";
import { HiOutlineArrowRight, HiOutlineCheckCircle } from "react-icons/hi2";
import { useDashData } from "../data";
import { Card, State, cn } from "../ui";

export default function PerluTindakan() {
  const entry = useDashData("overview");
  const a = entry.data?.actions;

  return (
    <Card title="Perlu tindakan" subtitle={a?.total > 0 ? `${a.total} hal perlu diselesaikan (14 hari terakhir)` : "14 hari terakhir"}>
      <State entry={entry}>
        {a &&
          (a.items.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
              <HiOutlineCheckCircle className="h-5 w-5 text-emerald-600" /> Semua beres.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {a.items.map((x, i) => (
                <li key={i}>
                  <Link to={x.link} className="flex items-start gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50/40">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", x.severity >= 3 ? "bg-rose-500" : x.severity === 2 ? "bg-amber-500" : "bg-slate-400")} />
                    <span className="flex-1">{x.text}</span>
                    <HiOutlineArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
              {a.total > a.items.length && <li className="px-1 pt-1 text-[11px] text-slate-400">dan {a.total - a.items.length} lainnya</li>}
            </ul>
          ))}
      </State>
    </Card>
  );
}
