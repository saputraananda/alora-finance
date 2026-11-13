import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";

// Sumber data widget. Beberapa widget memakai sumber yang sama (mis. 5 widget dari "overview"),
// jadi data diambil sekali per kombinasi sumber + filter lalu dibagi ke semua widget.
const PATH = {
  main: "/finance-ho/dashboard",
  overview: "/finance-ho/dashboard/overview",
  sales: "/finance-ho/dashboard/sales",
  methods: "/finance-ho/dashboard/payment-methods",
  cashflow: "/finance-ho/dashboard/cashflow",
  purchasing: "/finance-ho/dashboard/purchasing",
  possync: "/finance-ho/dashboard/pos-sync",
};

// Sumber yang datanya ikut berubah menurut filter unit (sisanya tidak ikut, jadi tidak diambil ulang)
const UNIT_SOURCES = new Set(["main", "overview", "methods", "purchasing", "possync"]);

const Ctx = createContext(null);

/** filters: { from, to, outlet, unit }  ·  refreshKey: naik → muat ulang semua data yang sedang dipakai */
export function DashboardDataProvider({ filters, refreshKey, children }) {
  const [store, setStore] = useState({});
  const inflight = useRef(new Set());
  const urls = useRef(new Map());

  const urlFor = useCallback(
    (source) => {
      const qs = new URLSearchParams({ from: filters.from, to: filters.to });
      if (filters.outlet) qs.set("outlet", filters.outlet);
      if (filters.unit && filters.unit !== "all" && UNIT_SOURCES.has(source)) qs.set("unit", filters.unit);
      return { key: `${source}?${qs}`, url: `${PATH[source]}?${qs}` };
    },
    [filters.from, filters.to, filters.outlet, filters.unit]
  );

  const load = useCallback((key, url) => {
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    setStore((s) => ({ ...s, [key]: { ...s[key], loading: true, error: "" } }));
    api(url)
      .then((r) => setStore((s) => ({ ...s, [key]: { data: r.data, loading: false, error: "" } })))
      .catch((e) => setStore((s) => ({ ...s, [key]: { ...s[key], loading: false, error: e.message || "Gagal memuat data." } })))
      .finally(() => inflight.current.delete(key));
  }, []);

  // Muat ulang manual: data lama tetap tampil sampai data baru datang
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // hanya sumber untuk filter yang sedang aktif
    const current = new Set(Object.keys(PATH).map((s) => urlFor(s).key));
    urls.current.forEach((url, key) => current.has(key) && load(key, url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const value = useMemo(() => ({ store, urlFor, load, urls }), [store, urlFor, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Data satu sumber → { data, loading, error }. Memicu pengambilan data bila belum ada. */
export function useDashData(source) {
  const { store, urlFor, load, urls } = useContext(Ctx);
  const { key, url } = urlFor(source);
  const entry = store[key];
  useEffect(() => {
    urls.current.set(key, url);
    if (!store[key]) load(key, url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return entry || { loading: true };
}
