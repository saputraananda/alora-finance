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
        <RequestList
          tab="bayar"
          emptyText="Tidak ada pengajuan yang menunggu pembayaran."
          headerProps={{
            icon: HiOutlineBanknotes,
            tone: "bg-orange-50 text-orange-700",
            title: "Pembayaran",
            subtitle: "Pengajuan yang sudah disetujui SPV Finance dan menunggu dibayar. Seluruh yang belum dibayar ditampilkan, tanpa batas periode.",
          }}
        />
      </div>
    </FinanceOnly>
  );
}
