import { Link } from "react-router-dom";
import { useDashData } from "../data";
import { Card, State, cn, dMon, rupiah } from "../ui";

// Warna lencana status posting (istilah sama dengan menu Integrasi POS)
const BADGE = {
  DIPOSTING: "bg-emerald-50 text-emerald-700",
  VALID: "bg-sky-50 text-sky-700",
  GAGAL: "bg-rose-50 text-rose-700",
  BERUBAH: "bg-amber-50 text-amber-700",
  TERKUNCI: "bg-slate-100 text-slate-600",
  DIBALIK: "bg-slate-100 text-slate-600",
};

// Penjualan POS hari lengkap terakhir per cabang + baris Cleanox, beserta status posting ke jurnal.
export default function SinkronPos() {
  const entry = useDashData("possync");
  const d = entry.data;

  return (
    <Card title={d ? `Sinkronisasi POS · ${dMon(d.date)}` : "Sinkronisasi POS"}>
      <State entry={entry} empty={d && d.items.length === 0 ? "Belum ada transaksi POS pada tanggal ini." : null}>
        {d && (
          <>
            <ul className="space-y-1.5 text-xs">
              {d.items.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-slate-700">{i.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-slate-600">{rupiah(i.amount)}</span>
                    <span className={cn("w-[84px] rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold", BADGE[i.status] || BADGE.TERKUNCI)}>{i.label}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px]">
              <span className="text-slate-400">
                {d.sent}/{d.outlets} cabang terkirim{d.synced_at ? ` · ${d.synced_at}` : ""}
              </span>
              <Link to={`/finance-ho/integrasi-pos?date=${d.date}`} className="font-bold text-emerald-700 hover:underline">
                Posting yang valid →
              </Link>
            </div>
          </>
        )}
      </State>
    </Card>
  );
}
