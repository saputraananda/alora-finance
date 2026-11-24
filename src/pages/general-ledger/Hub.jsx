import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HiOutlineBookOpen, HiOutlineDocumentText } from "react-icons/hi2";
import { SegmentedTabs, SubNavContext } from "../../components/ui/PageHeader";
import BukuBesar from "./index";
import JurnalUmum from "../journal";

// Menu General Ledger = dua tab atas: General Ledger (buku besar per akun) dan Jurnal (daftar jurnal & jurnal manual).
// Tab yang sudah dibuka tetap hidup (hanya disembunyikan) supaya filter dan hasilnya tidak hilang.
const VIEWS = [
  { id: "ledger", label: "Buku Besar", icon: HiOutlineDocumentText },
  { id: "jurnal", label: "Jurnal", icon: HiOutlineBookOpen },
];

export default function GeneralLedgerHub() {
  const [params] = useSearchParams();
  const first = params.get("tab") === "jurnal" ? "jurnal" : "ledger";
  const [view, setView] = useState(first);
  const [opened, setOpened] = useState(() => new Set([first]));

  const pick = (id) => {
    setView(id);
    setOpened((o) => (o.has(id) ? o : new Set(o).add(id)));
  };

  return (
    <SubNavContext.Provider value={<SegmentedTabs tabs={VIEWS} value={view} onChange={pick} label="General Ledger" />}>
      {opened.has("ledger") && <div hidden={view !== "ledger"}><BukuBesar /></div>}
      {opened.has("jurnal") && <div hidden={view !== "jurnal"}><JurnalUmum /></div>}
    </SubNavContext.Provider>
  );
}
