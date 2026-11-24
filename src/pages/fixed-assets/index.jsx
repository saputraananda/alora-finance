import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  HiOutlineBuildingOffice2,
  HiOutlineCheckCircle,
  HiOutlineChevronDown,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineExclamationTriangle,
  HiOutlinePhoto,
  HiOutlineSquares2X2,
  HiOutlineListBullet,
  HiOutlineWrenchScrewdriver,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api, apiFileUrl } from "../../lib/api";
import { currentCutoffKey, cutoffMonthLabel, cutoffRangeLabel, recentCutoffKeys, todayWib } from "../../lib/cutoff";
import PageHeader, { FieldSelect, RefreshButton, SearchBox } from "../../components/ui/PageHeader";

const cn = (...c) => c.filter(Boolean).join(" ");
const rp = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");
const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-400";
const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";
const COND_CLS = { Baik: "border-emerald-200 bg-emerald-50 text-emerald-700", "Rusak Ringan": "border-amber-200 bg-amber-50 text-amber-700", "Rusak Berat": "border-rose-200 bg-rose-50 text-rose-700", "Dalam Perbaikan": "border-sky-200 bg-sky-50 text-sky-700", "Tidak Layak Pakai": "border-slate-200 bg-slate-100 text-slate-500" };
const MT_TIPE = { perawatan_rutin: "Perawatan rutin", perbaikan: "Perbaikan", penggantian_part: "Ganti part", kalibrasi: "Kalibrasi", lainnya: "Lainnya" };
const MT_STATUS = { dijadwalkan: "bg-slate-100 text-slate-600", dalam_proses: "bg-sky-50 text-sky-700", selesai: "bg-emerald-50 text-emerald-700", dibatalkan: "bg-rose-50 text-rose-600" };

function Modal({ title, subtitle, onClose, footer, wide, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative flex w-full flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")} style={{ maxHeight: "92vh" }}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-800">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50"><HiOutlineXMark className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs text-slate-600">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

function Photo({ src, thumb, alt, className }) {
  const [bad, setBad] = useState(false);
  const url = src ? apiFileUrl(thumb ? `${src}?thumb=1` : src) : null;
  if (!url || bad) return <div className={cn("flex items-center justify-center bg-slate-100 text-slate-300", className)}><HiOutlinePhoto className="h-8 w-8" /></div>;
  return <img src={url} alt={alt} loading="lazy" onError={() => setBad(true)} className={cn("object-cover", className)} />;
}

const NoCat = () => <span className="text-slate-400">Belum dikategorikan</span>;

const emptyFin = { acquisition_date: "", cost: "", salvage: "0", opening_accum: "0", life_months: "60" };

function DetailModal({ id, categories, onClose, onChanged }) {
  const [a, setA] = useState(null);
  const [err, setErr] = useState("");
  const [shot, setShot] = useState(0);
  const [catBusy, setCatBusy] = useState(false);
  const [catMsg, setCatMsg] = useState(null);
  const [fin, setFin] = useState(emptyFin);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api(`/finance-ho/assets/${id}/detail`);
      setA(r.asset);
      const f = r.asset.finance;
      setFin(f ? { acquisition_date: f.acquisition_date, cost: String(f.cost), salvage: String(f.salvage), opening_accum: String(f.opening_accum), life_months: String(f.life_months) } : { ...emptyFin, acquisition_date: todayWib() });
    } catch (e) {
      setErr(e.message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api(`/finance-ho/assets/finance/${encodeURIComponent(a.code)}`, { method: "PUT", body: JSON.stringify(fin) });
      setMsg({ type: "ok", text: r.message });
      await load();
      onChanged();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const changeCategory = async (v) => {
    setCatBusy(true);
    setCatMsg(null);
    try {
      const r = await api(`/finance-ho/assets/category/${encodeURIComponent(a.code)}`, { method: "PUT", body: JSON.stringify({ category_id: v ? Number(v) : null }) });
      const c = (categories || []).find((x) => String(x.id) === String(v));
      setA((x) => ({ ...x, category_id: v ? Number(v) : null, category: c ? c.name : null }));
      setCatMsg({ type: "ok", text: r.message || "Kategori disimpan." });
      onChanged();
    } catch (e) {
      setCatMsg({ type: "error", text: e.message });
    } finally {
      setCatBusy(false);
    }
  };

  const locked = a?.finance?.locked;
  const setF = (p) => setFin((f) => ({ ...f, ...p }));
  const info = a ? [["Lokasi", a.outlet_name || a.location || "Pusat"], ["Kondisi", a.condition], ["Merek / model", [a.brand, a.model].filter(Boolean).join(" / ") || "-"], ["No. seri", a.serial || "-"], ["Jumlah", `${a.qty} ${a.unit}`], ["Perusahaan", a.company || "-"], ["PIC", a.pic || "-"]] : [];

  return (
    <Modal wide title={a ? a.name : "Detail aset"} subtitle={a ? a.code : undefined} onClose={onClose}
      footer={<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Tutup</button>}>
      {err ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700">{err}</p> : !a ? <p className="py-10 text-center text-slate-400">Memuat...</p> : (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <Photo src={a.photos[shot]?.url} alt={a.name} className="aspect-[4/3] w-full rounded-2xl" />
              {a.photos.length > 1 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto">
                  {a.photos.map((p, i) => (
                    <button key={p.id} type="button" onClick={() => setShot(i)} className={cn("h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2", i === shot ? "border-emerald-500" : "border-transparent")}>
                      <Photo src={p.url} thumb alt="" className="h-full w-full" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:col-span-3">
              {info.map(([k, v]) => (
                <div key={k}><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</dt><dd className="mt-0.5 font-semibold text-slate-800">{k === "Kondisi" ? <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", COND_CLS[v])}>{v}</span> : v}</dd></div>
              ))}
              <div className="col-span-2">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Kategori</dt>
                <dd className="mt-0.5">
                  <select disabled={catBusy} className={inputCls} value={a.category_id ?? ""} onChange={(e) => changeCategory(e.target.value)}>
                    <option value="">— Belum dikategorikan —</option>
                    {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {catMsg && (
                    <p className={cn("mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold", catMsg.type === "ok" ? "text-emerald-700" : "text-rose-700")}>
                      {catMsg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}{catMsg.text}
                    </p>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-800"><HiOutlineWrenchScrewdriver className="h-4 w-4 text-slate-400" /> Riwayat maintenance <span className="font-semibold text-slate-400">· {a.maintenance.length} catatan{a.maintenance_total > 0 ? ` · total Rp ${rp(a.maintenance_total)}` : ""}</span></p>
            {a.maintenance.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-slate-400">Belum ada catatan maintenance.</p>
            ) : (
              <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {a.maintenance.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
                    <span className="w-20 shrink-0 tabular-nums text-slate-500">{dmy(m.start)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800">{m.deskripsi}</p>
                      <p className="text-[10px] text-slate-400">{MT_TIPE[m.tipe] || m.tipe}{m.vendor ? ` · ${m.vendor}` : ""}{m.by_name ? ` · ${m.by_name}` : ""}{m.finish ? ` · selesai ${dmy(m.finish)}` : ""}</p>
                    </div>
                    {m.biaya > 0 && <span className="tabular-nums text-slate-600">Rp {rp(m.biaya)}</span>}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", MT_STATUS[m.status])}>{m.status.replace("_", " ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="mb-1 text-xs font-extrabold text-slate-800">Data penyusutan</p>
            <p className="mb-3 text-[11px] text-slate-400">
              {a.finance ? `Nilai buku Rp ${rp(a.finance.book_value)} · akumulasi Rp ${rp(a.finance.accum)} · susut Rp ${rp(a.finance.monthly)}/bulan${a.finance.status !== "AKTIF" ? ` · ${a.finance.status === "DIJUAL" ? "dijual" : "dihapus"} ${dmy(a.finance.disposed_at)}` : ""}` : "Belum diisi. Isi harga dan umur supaya aset ini ikut disusutkan tiap bulan."}
              {locked ? " Nilai terkunci karena sudah pernah disusutkan." : ""}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="space-y-1 font-semibold text-slate-500">Mulai disusutkan<input disabled={locked} type="date" className={inputCls} value={fin.acquisition_date} onChange={(e) => setF({ acquisition_date: e.target.value })} /></label>
              <label className="space-y-1 font-semibold text-slate-500">Harga (Rp)<input disabled={locked} type="number" className={cn(inputCls, "text-right")} value={fin.cost} onChange={(e) => setF({ cost: e.target.value })} /></label>
              <label className="space-y-1 font-semibold text-slate-500">Umur (bulan)<input disabled={locked} type="number" className={cn(inputCls, "text-right")} value={fin.life_months} onChange={(e) => setF({ life_months: e.target.value })} /></label>
              <label className="space-y-1 font-semibold text-slate-500">Nilai sisa (Rp)<input disabled={locked} type="number" className={cn(inputCls, "text-right")} value={fin.salvage} onChange={(e) => setF({ salvage: e.target.value })} /></label>
              <label className="space-y-1 font-semibold text-slate-500">Akumulasi awal (Rp)<input disabled={locked} type="number" className={cn(inputCls, "text-right")} value={fin.opening_accum} onChange={(e) => setF({ opening_accum: e.target.value })} /></label>
            </div>
            {msg && (
              <p className={cn("mt-3 flex items-start gap-1.5 rounded-lg border p-2.5 font-semibold", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
                {msg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}{msg.text}
              </p>
            )}
            {!locked && (
              <div className="mt-3 flex justify-end">
                <button type="button" disabled={busy || !fin.cost || !fin.acquisition_date} onClick={save} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan data penyusutan"}</button>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Depreciation() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentCutoffKey());
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const [y, m] = month.split("-").map(Number);
      setData(await api(`/finance-ho/assets/depreciation?year=${y}&month=${m}`));
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  }, [month]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const [y, m] = month.split("-").map(Number);
      const r = await api("/finance-ho/assets/depreciation", { method: "POST", body: JSON.stringify({ year: y, month: m }) });
      setMsg({ type: "ok", text: r.message });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const dep = data?.depreciation;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-extrabold text-slate-700">
        <span>Penyusutan bulanan</span>
        <HiOutlineChevronDown className={cn("h-4 w-4 text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4 text-xs text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldSelect label="Periode" value={month} onChange={setMonth} title={cutoffRangeLabel(month)}>
              {recentCutoffKeys(18).map((k) => <option key={k} value={k}>{cutoffMonthLabel(k)}</option>)}
            </FieldSelect>
            <p className="text-[11px] text-slate-400">Jurnal: Dr Beban Penyusutan · Cr Akumulasi Penyusutan, cabang mengikuti lokasi aset.</p>
          </div>
          {msg && <p className={cn("rounded-lg border p-2.5 font-semibold", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>{msg.text}</p>}
          {!dep ? <p className="py-4 text-center text-slate-400">Memuat...</p> : (
            <>
              <table className="w-full"><tbody className="divide-y divide-slate-100">
                {dep.by_outlet.length === 0 && <tr><td className="py-3 text-slate-400">Belum ada aset yang punya data penyusutan pada periode ini.</td></tr>}
                {dep.by_outlet.map((o) => <tr key={o.outlet_id ?? "p"}><td className="py-2">{o.outlet_name}</td><td className="py-2 text-right tabular-nums">{rp(o.amount)}</td></tr>)}
                <tr className="font-extrabold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{rp(dep.total)}</td></tr>
              </tbody></table>
              {dep.journal?.status === "POSTED" ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">Sudah diposting: {dep.journal.entry_no}. Untuk mengulang, balik jurnalnya di menu Jurnal.</p>
              ) : (
                <div className="flex justify-end">
                  <button type="button" disabled={!dep.can_run || busy} onClick={run} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? "Memproses..." : `Jalankan penyusutan ${cutoffMonthLabel(month).split(" ")[0]}`}</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AsetTetap() {
  const [view, setView] = useState(() => { try { return localStorage.getItem("alfi_asset_view") || "gallery"; } catch { return "gallery"; } });
  const [outlet, setOutlet] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState(null);

  useEffect(() => { document.title = "Aset Tetap | HO Finance"; }, []);
  useEffect(() => { try { localStorage.setItem("alfi_asset_view", view); } catch { /* abaikan */ } }, [view]);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ page: String(page), limit: view === "gallery" ? "24" : "25" });
      if (outlet) p.set("outlet_id", outlet);
      if (category) p.set("category_id", category);
      if (condition) p.set("kondisi", condition);
      if (q) p.set("search", q);
      setData(await api(`/finance-ho/assets?${p}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, outlet, category, condition, q, view]);
  useEffect(() => { load(); }, [load]);

  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const rows = data?.data || [];
  const toggleCls = (on) => cn("flex h-9 w-9 items-center justify-center", on ? "bg-emerald-600 text-white" : "bg-white text-slate-500 hover:text-emerald-700");

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader crumb="Aset Tetap" icon={HiOutlineBuildingOffice2} tone="bg-violet-50 text-violet-700" title="Daftar aset" subtitle="Data aset dari Manajemen Aset SuperApp (hanya dibaca); kategori dan data penyusutan diatur di alfi. Klik aset untuk melihat foto, riwayat maintenance, dan data penyusutan." search={<SearchBox value={search} onChange={setSearch} placeholder="Cari kode, nama, merek, atau no. seri" />}>
        <FieldSelect label="Cabang" value={outlet} onChange={reset(setOutlet)}>
          <option value="">Semua</option>
          {(data?.meta.outlets || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value="none">Pusat / tanpa cabang</option>
        </FieldSelect>
        <FieldSelect label="Kategori" value={category} onChange={reset(setCategory)}>
          <option value="">Semua</option>
          {(data?.meta.categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="none">Belum dikategorikan</option>
        </FieldSelect>
        <FieldSelect label="Kondisi" value={condition} onChange={reset(setCondition)}>
          <option value="">Semua</option>
          {(data?.meta.conditions || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </FieldSelect>
        <div className="flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="Tampilan">
          <button type="button" onClick={() => setView("gallery")} title="Galeri" aria-label="Tampilan galeri" aria-pressed={view === "gallery"} className={toggleCls(view === "gallery")}><HiOutlineSquares2X2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => setView("list")} title="Daftar" aria-label="Tampilan daftar" aria-pressed={view === "list"} className={toggleCls(view === "list")}><HiOutlineListBullet className="h-4 w-4" /></button>
        </div>
        <RefreshButton onClick={load} spinning={loading} />
      </PageHeader>


      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>}

      {!data ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">Memuat aset...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">Tidak ada aset pada filter ini.</div>
      ) : view === "gallery" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {rows.map((a) => (
            <button key={a.id} type="button" onClick={() => setDetailId(a.id)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-emerald-400 hover:shadow-md">
              <Photo src={a.photo} thumb alt={a.name} className="aspect-[4/3] w-full transition duration-300 group-hover:scale-105" />
              <div className="space-y-1 p-3">
                <p className="truncate font-mono text-[10px] font-bold text-slate-400">{a.code}</p>
                <p className="line-clamp-2 min-h-[2rem] text-xs font-bold text-slate-800">{a.name}</p>
                <p className="truncate text-[11px] text-slate-500">{a.outlet_name}</p>
                <p className="truncate text-[10px] font-semibold text-slate-500">{a.category || <NoCat />}</p>
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <span className={cn("truncate rounded-full border px-2 py-0.5 text-[10px] font-bold", COND_CLS[a.condition])}>{a.condition}</span>
                  {a.finance && <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-500">Rp {rp(a.finance.book_value)}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr><th className={th} /><th className={th}>Kode</th><th className={th}>Aset</th><th className={th}>Kategori</th><th className={th}>Lokasi</th><th className={th}>Kondisi</th><th className={cn(th, "text-right")}>Nilai buku</th><th className={cn(th, "text-right")}>Susut/bln</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.id} onClick={() => setDetailId(a.id)} className="cursor-pointer hover:bg-slate-50/60">
                    <td className="w-14 px-3 py-2"><Photo src={a.photo} thumb alt="" className="h-9 w-12 rounded-lg" /></td>
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{a.code}</td>
                    <td className="px-3 py-2.5"><p className="font-semibold text-slate-800">{a.name}</p>{(a.brand || a.serial) && <p className="text-[10px] text-slate-400">{[a.brand, a.serial].filter(Boolean).join(" · ")}</p>}</td>
                    <td className="px-3 py-2.5 text-slate-500">{a.category || <NoCat />}</td>
                    <td className="px-3 py-2.5 text-slate-600">{a.outlet_name}</td>
                    <td className="px-3 py-2.5"><span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", COND_CLS[a.condition])}>{a.condition}</span></td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{a.finance ? rp(a.finance.book_value) : <span className="text-slate-300">-</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{a.finance ? rp(a.finance.monthly) : <span className="text-slate-300">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{data.total} aset · halaman {data.page} dari {data.pages}</span>
          <div className="flex gap-1.5">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Sebelumnya" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:border-emerald-400 disabled:opacity-40"><HiOutlineChevronLeft className="h-4 w-4" /></button>
            <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Berikutnya" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:border-emerald-400 disabled:opacity-40"><HiOutlineChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      {data && data.pages <= 1 && data.total > 0 && <p className="text-xs text-slate-400">{data.total} aset</p>}

      <Depreciation />

      {detailId && <DetailModal id={detailId} categories={data?.meta.categories || []} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}
