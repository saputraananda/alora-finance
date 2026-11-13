import { useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineArrowRight, HiOutlineEye } from "react-icons/hi2";
import { useDashData } from "../data";
import DetailJurnalModal from "../../../components/DetailJurnalModal";
import { Card, State, rupiah } from "../ui";

// 5 jurnal terakhir yang sudah dibukukan (widget tambahan, tidak tampil di bawaan).
export default function JurnalTerkini() {
  const entry = useDashData("main");
  const rows = entry.data?.recent_journals || [];
  const [openId, setOpenId] = useState(null);

  return (
    <Card
      title="Transaksi Jurnal Terkini"
      subtitle="5 jurnal terakhir yang sudah dibukukan"
     
      right={
        <Link to="/finance-ho/jurnal-umum" className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
          Semua jurnal <HiOutlineArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <State entry={entry} empty={entry.data && rows.length === 0 ? "Belum ada jurnal yang dibukukan." : null}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-2 py-2">No. Jurnal</th>
                <th className="px-2 py-2">Tanggal</th>
                <th className="px-2 py-2">Keterangan</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50/70">
                  <td className="px-2 py-2.5 font-mono font-semibold text-slate-800">{j.entry_no}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{`${j.entry_date.slice(8, 10)}/${j.entry_date.slice(5, 7)}/${j.entry_date.slice(0, 4)}`}</td>
                  <td className="max-w-xs truncate px-2 py-2.5 text-slate-700" title={j.description}>{j.description}</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums text-slate-900">Rp {rupiah(j.total_amount)}</td>
                  <td className="px-2 py-2.5 text-right">
                    <button type="button" onClick={() => setOpenId(j.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100">
                      <HiOutlineEye className="h-3.5 w-3.5 text-slate-400" /> Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>
      {openId && <DetailJurnalModal open journalId={openId} onClose={() => setOpenId(null)} onReversed={() => setOpenId(null)} />}
    </Card>
  );
}
