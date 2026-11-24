import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { rekonTabOf } from "../../lib/tabs";
import BankRekon from "./components/BankRekon";
import Workspace from "./components/Workspace";
import Riwayat from "./components/Riwayat";
import HasilRekon from "./components/HasilRekon";
import { HiOutlineArrowsRightLeft, HiOutlineBuildingLibrary, HiOutlineClipboardDocumentCheck, HiOutlineClock, HiOutlineScale } from "react-icons/hi2";
import PageHeader, { HeaderSlotContext, SegmentedTabs, TabActiveContext } from "../../components/ui/PageHeader";

const cn = (...c) => c.filter(Boolean).join(" ");
// ═════════════════════════════ HALAMAN ══════════════════════════════════
const TABS = [
  { id: "transaksi", label: "Rekonsiliasi transaksi", icon: HiOutlineArrowsRightLeft, title: "Rekonsiliasi transaksi", desc: "Cocokkan transaksi internal (kiri) dengan mutasi bank (kanan), sampai uang benar-benar masuk atau keluar rekening." },
  { id: "harian", label: "Hasil Rekonsiliasi", icon: HiOutlineClipboardDocumentCheck, title: "Hasil Rekonsiliasi", desc: "Semua hasil pencocokan. Pilih yang akan ditransfer ke General Ledger; satu jurnal per baris." },
  { id: "riwayat", label: "Riwayat", icon: HiOutlineClock, title: "Riwayat", desc: "Catatan import, pencocokan, pembatalan, dan perubahan status." },
  { id: "bank", label: "Aktivitas Bank", icon: HiOutlineBuildingLibrary, title: "Aktivitas Bank", desc: "Pencocokan mutasi ke baris jurnal di akun bank, saldo akhir bulan sebelumnya, dan jurnal biaya admin." },
];

export default function Rekonsiliasi() {
  // Satu tab aplikasi; sub-halaman (Transaksi, Import, Harian, ...) dipilih lewat strip di bawah judul.
  // ?tab=&date=&outlet= datang dari tautan lain (mis. penelusuran jurnal).
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const [tab, setTab] = useState(() => rekonTabOf(search));
  const qd = params.get("date");
  const [focusOutlet] = useState(params.get("outlet") ? Number(params.get("outlet")) : null);

  useEffect(() => {
    document.title = "Account Receivable | HO Finance";
  }, []);

  const [slot, setSlot] = useState(null);
  // Tab yang pernah dibuka tetap hidup (hanya disembunyikan), jadi filter dan pilihan di dalamnya tidak ter-reset saat pindah tab
  const [opened, setOpened] = useState(() => new Set([tab]));
  useEffect(() => { setOpened((o) => (o.has(tab) ? o : new Set(o).add(tab))); }, [tab]);
  const goto = (t) => setTab(t);

  const active = TABS.find((t) => t.id === tab);

  return (
    <HeaderSlotContext.Provider value={slot}>
      <div className="space-y-5 p-4 sm:p-6">
        <PageHeader title={active.title} subtitle={active.desc} subnav={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label="Account Receivable" />}>
          <div ref={setSlot} className="contents" />
        </PageHeader>

        {[
          ["transaksi", () => <Workspace />],
          ["harian", () => <HasilRekon onGoto={goto} initialDate={qd && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(qd) ? qd : null} initialOutlet={focusOutlet} />],
          ["riwayat", () => <Riwayat />],
          ["bank", () => <BankRekon />],
        ].map(([id, render]) => opened.has(id) && (
          <TabActiveContext.Provider key={id} value={tab === id}>
            <div hidden={tab !== id}>{render()}</div>
          </TabActiveContext.Provider>
        ))}
      </div>
    </HeaderSlotContext.Provider>
  );
}
