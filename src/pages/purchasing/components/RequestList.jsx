import { useCallback, useEffect, useRef, useState } from "react";
import { HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlineClipboardDocumentList, HiOutlineMagnifyingGlass } from "react-icons/hi2";
import { api } from "../../../lib/api";
import { STATUS_META, TYPE_LABEL, cn, dmy, filterSelectCls, getStatusDisplay, rp, thCls } from "../utils/format";
import DateFilter, { useDateFilter } from "../../../components/DateFilter";
import RequestDetailModal from "./RequestDetailModal";

const REFRESH_MS = 10000; // muat ulang diam-diam (SuperApp: 5 detik)

// Daftar pengajuan dengan filter yang sama seperti halaman Pengajuan SuperApp:
// filter tanggal (Cutoff / Rentang / Satu Hari / Semua), cari, tipe, status, kategori,
// metode & departemen (tab "semua"), jumlah per halaman 10 / 25 / 100 / ALL.
// tab: "semua" | "antrean" | "bayar"
export default function RequestList({ tab, emptyText = "Belum ada pengajuan" }) {
  const isAll = tab === "semua";
  // Antrean & Pembayaran: bawaannya Semua periode supaya antrean lama tidak tersembunyi
  const date = useDateFilter(isAll ? "cutoff" : "all");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [method, setMethod] = useState("");
  const [dept, setDept] = useState("");
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    api("/finance-ho/purchasing/companies").then((r) => setCompanies(r.data)).catch(() => {});
    if (isAll) api("/finance-ho/purchasing/departments").then((r) => setDepartments(r.data)).catch(() => {});
  }, [isAll]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [date.mode, date.from, date.to]);

  const load = useCallback(
    async (silent = false) => {
      if (!date.ready) return;
      const my = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const qs = new URLSearchParams({ tab, page: String(page), limit: String(limit) });
        if (search) qs.set("search", search);
        if (type) qs.set("type", type);
        if (status && isAll) qs.set("status", status);
        if (company) qs.set("company_id", company);
        if (method && isAll) qs.set("payment_method", method);
        if (dept && isAll) qs.set("department_id", dept);
        if (date.mode !== "all") {
          qs.set("date_from", date.from);
          qs.set("date_to", date.to);
        }
        const r = await api(`/finance-ho/purchasing/requests?${qs}`);
        if (my === seq.current) {
          setData(r);
          setError("");
        }
      } catch (e) {
        if (!silent && my === seq.current) setError(e.message);
      } finally {
        if (!silent && my === seq.current) setLoading(false);
      }
    },
    [tab, page, limit, search, type, status, company, method, dept, isAll, date.mode, date.from, date.to, date.ready]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const rows = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / (limit === "all" ? Math.max(total, 1) : limit)));
  const reset = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {openId && <RequestDetailModal id={openId} onClose={() => setOpenId(null)} onChanged={() => load()} />}

      <DateFilter f={date} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-[220px] flex-1">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nama barang, kode, atau nama pengaju..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <select value={type} onChange={reset(setType)} className={filterSelectCls}>
          <option value="">Semua Tipe</option>
          <option value="pengajuan">Pengajuan</option>
          <option value="reimburse">Reimburse</option>
        </select>
        {isAll && (
          <select value={status} onChange={reset(setStatus)} className={filterSelectCls}>
            <option value="">Semua Status</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        )}
        <select value={company} onChange={reset(setCompany)} className={filterSelectCls}>
          <option value="">Semua Kategori</option>
          {companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.company_name}</option>)}
        </select>
        {isAll && (
          <select value={method} onChange={reset(setMethod)} className={filterSelectCls}>
            <option value="">Semua Metode</option>
            <option value="cash">Cash</option>
            <option value="kredit">Kredit</option>
          </select>
        )}
        {isAll && (
          <select value={dept} onChange={reset(setDept)} className={filterSelectCls}>
            <option value="">Semua Departemen</option>
            {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
          </select>
        )}
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-slate-300/40">
        {loading && !data ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <HiOutlineClipboardDocumentList className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-400">{emptyText}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className={thCls}>Kode</th>
                  <th className={thCls}>Tanggal</th>
                  <th className={thCls}>Pengaju</th>
                  <th className={thCls}>Barang / keperluan</th>
                  <th className={thCls}>Outlet</th>
                  <th className={thCls}>Klasifikasi</th>
                  <th className={cn(thCls, "text-right")}>Nominal</th>
                  <th className={thCls}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const st = getStatusDisplay(r);
                  return (
                    <tr key={r.pr_id} onClick={() => setOpenId(r.pr_id)} className="cursor-pointer hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-700">
                        {r.pr_code}
                        {r.type === "reimburse" && <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">{TYPE_LABEL.reimburse}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-500">{dmy(r.tanggal_pengajuan)}</td>
                      <td className="px-3 py-2.5 text-slate-600">
                        <p className="max-w-[160px] truncate">{r.pengaju_name || "-"}</p>
                        <p className="max-w-[160px] truncate text-[10px] text-slate-400">{r.department_name || ""}</p>
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-2.5 text-slate-700" title={r.nama_barang}>{r.nama_barang}</td>
                      <td className="max-w-[140px] truncate px-3 py-2.5 text-slate-500" title={r.outlet_name || ""}>{r.outlet_name || "-"}</td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-500" title={r.classification_name || ""}>{r.classification_name || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">{Number(r.amount) ? rp(r.amount) : "-"}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", st.cls)}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-xs text-slate-500">
                Halaman <span className="font-bold text-slate-700">{page}</span> dari <span className="font-bold text-slate-700">{totalPages}</span>
                <span className="ml-1.5 text-slate-400">({rp(total)} data)</span>
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Tampilkan:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLimit(v === "all" ? "all" : Number(v));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={100}>100</option>
                  <option value="all">ALL</option>
                </select>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                  <HiOutlineChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                  <HiOutlineChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
