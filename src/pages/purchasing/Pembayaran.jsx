import { useEffect } from "react";
import { HiOutlineBanknotes } from "react-icons/hi2";
import FinanceOnly from "./components/FinanceOnly";
import RequestList from "./components/RequestList";

export default function Pembayaran() {
  useEffect(() => {
    document.title = "Pembayaran | HO Finance";
  }, []);

  return (
    <FinanceOnly>
      <div className="space-y-5 p-4 sm:p-6">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">Pembelian</p>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><HiOutlineBanknotes className="h-5 w-5" /></div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800">Pembayaran</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pengajuan yang sudah disetujui SPV Finance dan menunggu dibayar. Seluruh yang belum dibayar ditampilkan, tanpa batas periode.
          </p>
        </div>
        <RequestList tab="bayar" emptyText="Tidak ada pengajuan yang menunggu pembayaran." />
      </div>
    </FinanceOnly>
  );
}
