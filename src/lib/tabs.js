import { createContext, useContext, useEffect } from "react";

// Sub-halaman Rekonsiliasi: masing-masing dibuka sebagai tab sendiri (?tab=...).
export const REKON_TAB_IDS = ["transaksi", "harian", "riwayat", "bank"];
export const REKON_LABEL = { transaksi: "Transaksi", harian: "Harian", riwayat: "Riwayat", bank: "Aktivitas Bank" };

// Menentukan sub-halaman Rekonsiliasi dari query string (tautan lama ?tab=settlement/setoran → transaksi).
export function rekonTabOf(search = "") {
  const p = new URLSearchParams(search);
  const raw = p.get("tab");
  const mapped = raw === "settlement" || raw === "setoran" || raw === "import" ? "transaksi" : raw; // Import data kini berupa modal di tab Transaksi
  if (REKON_TAB_IDS.includes(mapped)) return mapped;
  return p.get("date") ? "harian" : "transaksi";
}

// Konteks tab: setiap halaman yang terbuka tahu "kunci tab"-nya, bisa menandai isian belum disimpan,
// dan bisa meminta tabnya ditutup (dengan konfirmasi bila belum disimpan).
export const TabsContext = createContext({ key: null, setDirty: () => {}, closeTab: () => {} });
export const useTabs = () => useContext(TabsContext);

export function useTabDirty(dirty) {
  const { key, setDirty } = useTabs();
  useEffect(() => {
    if (!key) return undefined;
    setDirty(key, Boolean(dirty));
    return () => setDirty(key, false);
  }, [key, dirty, setDirty]);
}
