import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useRoutes } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRightOnRectangle,
  HiOutlineHome,
  HiOutlineComputerDesktop,
  HiOutlineCog6Tooth,
  HiOutlineUsers,
  HiOutlineBuildingOffice2,
  HiOutlineXMark,
  HiOutlineChevronDown,
  HiOutlineBookOpen,
  HiOutlinePlus,
  HiOutlineDocumentText,
  HiOutlineNumberedList,
  HiOutlineCalculator,
  HiOutlineChartBar,
  HiOutlineBanknotes,
  HiOutlineShoppingCart,
  HiOutlineCreditCard,
  HiOutlineScale,
  HiOutlineReceiptPercent,
  HiOutlineDocumentChartBar,
  HiOutlineCircleStack,
} from "react-icons/hi2";

import { clearSession } from "../lib/api";
import ErrorBoundary from "./ui/ErrorBoundary";
import HamburgerNav from "./HamburgerNav";
import { SubNavContext } from "./ui/PageHeader";
import ConfirmModal from "./ui/ConfirmModal";
import { TabsContext } from "../lib/tabs";
import { SETTINGS_BASE, SETTINGS_SECTIONS, settingsPath } from "../pages/settings/sections";
import { useAuth } from "../context/AuthContext";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ── Menu mengikuti "Peta menu" Referensi Tampilan Aplikasi (12 menu utama) ──
// Menu yang modulnya belum dibangun (Kas Kecil, Pembelian, Persediaan, Aset Tetap)
// tampil sebagai "Segera hadir" di Beranda, tidak di sidebar.
const STANDALONE_ITEMS = [
  { to: "/finance-ho/dashboard", icon: HiOutlineChartBar, label: "Dashboard", description: "Ringkasan semua cabang", end: false },
  { to: "/finance-ho/integrasi-pos", icon: HiOutlineComputerDesktop, label: "Front Office Cashier", description: "Transaksi, refund, void & setoran kasir", end: false },
  { to: "/finance-ho/general-ledger", icon: HiOutlineBookOpen, label: "General Ledger", description: "Buku besar & jurnal", end: false },
  { to: "/finance-ho/rekonsiliasi", icon: HiOutlineScale, label: "Account Receivable", description: "Cocokkan mutasi bank, harian", end: false },
];

const OPERATIONAL_SECTIONS = [
  {
    id: "pelanggan",
    label: "Customer",
    icon: HiOutlineUsers,
    items: [
      { to: "/finance-ho/pelanggan/daftar", icon: HiOutlineUsers, label: "Daftar Customer", description: "Data pelanggan dari POS", end: false },
      { to: "/finance-ho/pelanggan/deposit", icon: HiOutlineBanknotes, label: "Riwayat Deposit", description: "Deposit transaksi reguler", end: false },
    ],
  },
  {
    id: "pembelian",
    label: "Account Payable",
    icon: HiOutlineShoppingCart,
    items: [
      { to: "/finance-ho/pembelian/pengajuan", icon: HiOutlineShoppingCart, label: "Pengajuan", description: "Antrean & semua pengajuan", end: false },
      { to: "/finance-ho/pembelian/pembayaran", icon: HiOutlineBanknotes, label: "Pembayaran", description: "Menunggu bayar", end: false },
      { to: "/finance-ho/pembelian/kredit", icon: HiOutlineCreditCard, label: "Kredit & Cicilan", description: "Hutang & jatuh tempo", end: false },],
  },
  {
    id: "aset",
    label: "Aset Tetap",
    icon: HiOutlineBuildingOffice2,
    items: [
      { to: "/finance-ho/aset-tetap", icon: HiOutlineBuildingOffice2, label: "Aset Tetap", description: "Daftar aset & penyusutan", end: false },
    ],
  },
  {
    id: "report",
    label: "Laporan",
    icon: HiOutlineDocumentChartBar,
    items: [
      { to: "/finance-ho/laporan", icon: HiOutlineDocumentChartBar, label: "Laporan Keuangan", description: "Laba rugi, neraca, aging, rekap", end: false },
    ],
  },
];

const MASTER_SECTIONS = [
  {
    id: "master",
    label: "Pengaturan",
    icon: HiOutlineCog6Tooth,
    items: [
      {
        to: SETTINGS_BASE,
        icon: HiOutlineCog6Tooth,
        label: "Pengaturan Umum",
        description: "Cabang, rekening, akun, penomoran",
        end: false,
        children: SETTINGS_SECTIONS.map((s) => ({ to: s.to, icon: s.icon, label: s.label, description: s.desc, end: true })),
      },
      { to: "/finance-ho/coa", icon: HiOutlineNumberedList, label: "Master COA", description: "Bagan akun & saldo normal", end: false },
      { to: "/finance-ho/anggaran-beban", icon: HiOutlineCalculator, label: "Anggaran Beban", description: "Budget per akun per bulan", end: false },
    ],
  },
];

const MENU_SECTIONS = [...OPERATIONAL_SECTIONS, ...MASTER_SECTIONS];

const ALL_MENU_ITEMS = [
  ...STANDALONE_ITEMS,
  ...MENU_SECTIONS.flatMap((s) => s.items),
];
const ALL_WITH_CHILDREN = ALL_MENU_ITEMS.flatMap((i) => [i, ...(i.children || [])]);

function isItemActive(pathname, item) {
  if (item.end) return pathname === item.to;
  if (
    item.to === "/finance-ho/dashboard" &&
    (pathname === "/finance-ho" || pathname === "/finance-ho/")
  ) {
    return true;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

// Menu yang punya lebih dari 1 submenu → baru tampil sidebar.
function findGroup(pathname) {
  return (
    MENU_SECTIONS.find(
      (sec) => sec.items.length > 1 && sec.items.some((it) => isItemActive(pathname, it))
    ) || null
  );
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}") || {};
  } catch {
    return {};
  }
}

// ── User menu (nama, departemen, logout) di kanan topbar ────────────────────
function UserMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { user: authUser, logout } = useAuth();

  const user = authUser || getStoredUser();
  // Shape dari POST /api/auth/login: { fullName, username, department, position, ... }
  const fullName = user.fullName || user.name || user.username || "User";
  const department =
    user.department || user.position || user.role || "Portal User";
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    fullName
  )}&background=059669&color=fff&bold=true`;

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleLogout = () => {
    try { localStorage.removeItem("alfi.tabs.v1"); } catch { /* abaikan */ }
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-xl p-1 transition hover:bg-white/10 focus:outline-none"
      >
        <div className="hidden whitespace-nowrap text-right sm:block">
          <p className="text-xs font-bold leading-tight text-white" title={fullName}>
            {fullName}
          </p>
          <p className="mt-0.5 text-[11px] font-medium leading-tight text-emerald-100/70" title={department}>
            {department}
          </p>
        </div>
        <img
          src={avatarUrl}
          alt={fullName}
          className="h-9 w-9 shrink-0 rounded-full border border-white/20 bg-emerald-800 object-cover shadow-sm"
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2 sm:hidden">
            <p className="truncate text-xs font-bold text-slate-800">{fullName}</p>
            <p className="mt-0.5 truncate text-xs text-slate-400">{department}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-4 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
          >
            <HiOutlineArrowRightOnRectangle className="h-4 w-4" />
            <span>Keluar (Logout)</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB HALAMAN — seperti tab browser: tiap tab punya riwayat halamannya sendiri.
// Membuka menu mengganti halaman di tab aktif; tab baru hanya lewat tombol +. Halaman di tab yang
// tidak aktif tetap hidup (hanya disembunyikan), jadi filter, isian, dan posisi gulir tidak hilang saat
// pindah tab. Daftar tab dan riwayatnya disimpan di localStorage.
// ════════════════════════════════════════════════════════════════════════════
const MAX_TABS = 12;
const MAX_SHOWN = 5; // jumlah tab yang tampil di bar (sisanya lewat dropdown)
const MAX_HIST = 30; // banyak halaman yang diingat per tab (untuk tombol Kembali)
const DEFAULT_PATH = "/finance-ho/dashboard";
const NEW_TAB_PATH = "/finance-ho/tab-baru"; // isi tab baru = halaman Beranda
const STORE_KEY = "alfi.tabs.v2";
const OLD_STORE_KEY = "alfi.tabs.v1";
const TITLE_OVERRIDE = {};

const isPinned = () => false; // tidak ada tab yang disematkan; posisi paling kiri dipakai tombol Kembali

// Kunci halaman: dipakai untuk judul tab dan untuk memutuskan perlu tidaknya memuat ulang halaman. null = alamat tidak dikenal.
function keyOf(pathname) {
  const p = pathname.replace(/\/+$/, "");
  if (p === NEW_TAB_PATH) return "tab-baru";
  if (p === "/finance-ho/jurnal-umum/baru") return "jurnal-baru";
  const m = p.match(/^\/finance-ho\/jurnal-umum\/([^/]+)\/ubah$/);
  if (m) return `jurnal-ubah:${m[1]}`;
  if (p === SETTINGS_BASE || p.startsWith(`${SETTINGS_BASE}/`)) return SETTINGS_BASE; // semua anak menu Pengaturan Umum = satu halaman
  const item = ALL_MENU_ITEMS.find((i) => i.to === p);
  return item ? item.to : null;
}

function infoOf(key, pathname = "") {
  if (key === "tab-baru") return { title: "Tab baru", icon: HiOutlinePlus };
  if (key === "jurnal-baru") return { title: "Jurnal baru", icon: HiOutlineBookOpen };
  if (key.startsWith("jurnal-ubah:")) return { title: "Ubah jurnal", icon: HiOutlineBookOpen };
  if (key === SETTINGS_BASE) {
    const s = SETTINGS_SECTIONS.find((x) => x.to === pathname.replace(/\/+$/, ""));
    return { title: s ? `Pengaturan · ${s.label}` : "Pengaturan", icon: HiOutlineCog6Tooth };
  }
  const sec = MENU_SECTIONS.find((s) => s.items.some((i) => i.to === key));
  const item = [...STANDALONE_ITEMS, ...MENU_SECTIONS.flatMap((s) => s.items)].find((i) => i.to === key);
  if (!item) return { title: key, icon: HiOutlineDocumentText };
  let title = TITLE_OVERRIDE[key] || item.label;
  if (!TITLE_OVERRIDE[key] && sec && sec.items.length > 1 && sec.label !== item.label) title = `${sec.label} · ${item.label}`;
  return { title, icon: item.icon };
}

// ── Model tab ───────────────────────────────────────────────────────────────
// Satu tab = satu "jendela" dengan riwayat halamannya sendiri (seperti browser):
//   { id, hist: [{pathname, search, state}], idx, rev }   halaman tab sekarang = hist[idx]
// Membuka menu mengganti halaman di tab aktif; tab baru hanya dibuat lewat tombol +.
let idSeq = 0;
const newId = () => `t${Date.now().toString(36)}${(idSeq++).toString(36)}`;
const curOf = (t) => t.hist[t.idx];
const mkTab = (pathname, search = "", state = null) => ({ id: newId(), hist: [{ pathname, search: search || "", state }], idx: 0, rev: 0 });
const validEntry = (e) => typeof e?.pathname === "string" && e.pathname.startsWith("/finance-ho/") && Boolean(keyOf(e.pathname));
const fixOld = (e) => (String(e.pathname).replace(/\/+$/, "") === SETTINGS_BASE ? { ...e, pathname: settingsPath(new URLSearchParams(e.search || "").get("tab") || "cabang"), search: "" } : e);

// Tab tersimpan (v2); bila belum ada, ubah dari format lama (satu halaman = satu tab). Lalu sesuaikan dengan alamat yang sedang dibuka.
function loadStored(initial) {
  let tabs = [];
  let active = null;
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (Array.isArray(raw?.tabs)) {
      tabs = raw.tabs
        .map((t) => {
          const hist = (Array.isArray(t?.hist) ? t.hist : []).map(fixOld).filter(validEntry).slice(-MAX_HIST);
          if (!hist.length) return null;
          const idx = Math.min(Math.max(0, Number(t.idx) || 0), hist.length - 1);
          return { id: String(t.id || newId()), hist: hist.map((e) => ({ pathname: e.pathname, search: e.search || "", state: null })), idx, rev: 0 };
        })
        .filter(Boolean);
      active = raw.active;
    } else {
      const old = JSON.parse(localStorage.getItem(OLD_STORE_KEY) || "null");
      if (Array.isArray(old?.tabs)) tabs = old.tabs.map(fixOld).filter(validEntry).map((t) => mkTab(t.pathname, t.search || ""));
    }
  } catch {
    tabs = [];
  }
  tabs = tabs.slice(0, MAX_TABS);
  const urlOk = Boolean(keyOf(initial.pathname));
  const sameEntry = (e) => e.pathname === initial.pathname && (e.search || "") === (initial.search || "");
  if (!tabs.length) {
    const t = mkTab(urlOk ? initial.pathname : DEFAULT_PATH, urlOk ? initial.search : "");
    return { tabs: [t], active: t.id };
  }
  const act = tabs.find((t) => t.id === active) || tabs[0];
  if (!urlOk || sameEntry(curOf(act))) return { tabs, active: act.id };
  // Alamat berbeda dari tab aktif tersimpan (mis. tautan dibuka dari luar): tampilkan di tab yang sudah menunjukkannya, atau buka tab baru
  const found = tabs.find((t) => sameEntry(curOf(t)));
  if (found) return { tabs, active: found.id };
  if (tabs.length < MAX_TABS) {
    const nt = mkTab(initial.pathname, initial.search);
    return { tabs: [...tabs, nt], active: nt.id };
  }
  const hist = [...act.hist.slice(0, act.idx + 1), { pathname: initial.pathname, search: initial.search || "", state: null }].slice(-MAX_HIST);
  return { tabs: tabs.map((t) => (t.id === act.id ? { ...t, hist, idx: hist.length - 1 } : t)), active: act.id };
}

// Merender halaman tab pada alamat tab itu sendiri (bukan alamat browser).
function TabView({ routes, tab, setDirty, closeTab }) {
  const cur = curOf(tab);
  const pageKey = keyOf(cur.pathname) || cur.pathname;
  const location = useMemo(
    () => ({ pathname: cur.pathname, search: cur.search, hash: "", state: cur.state, key: `${pageKey}#${tab.rev}` }),
    [cur.pathname, cur.search, cur.state, pageKey, tab.rev]
  );
  const element = useRoutes(routes, location);
  const ctx = useMemo(() => ({ key: tab.id, setDirty, closeTab }), [tab.id, setDirty, closeTab]);
  return (
    <TabsContext.Provider value={ctx}>
      <ErrorBoundary key={`${pageKey}#${tab.rev}`}>{element}</ErrorBoundary>
    </TabsContext.Provider>
  );
}

function TabBar({ tabs, activeKey, dirty, onActivate, onClose, onCloseMany, onReorder, onNew, canGoBack, backTitle, onBack, onHome, trailing }) {
  const stripRef = useRef(null);
  const [ctx, setCtx] = useState(null); // {x, y, key}
  const [list, setList] = useState(null); // {x, y}
  const [drag, setDrag] = useState(null); // {from, over}: seret tab untuk memindahkan urutan

  useEffect(() => {
    stripRef.current?.querySelector(`[data-tab="${CSS.escape(activeKey || "")}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeKey, tabs.length]);

  useEffect(() => {
    if (!ctx && !list) return undefined;
    const close = () => { setCtx(null); setList(null); };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", close, true); };
  }, [ctx, list]);

  const idxOf = (key) => tabs.findIndex((t) => t.key === key);
  // Hanya MAX_SHOWN tab yang tampil di bar; tab aktif selalu ikut tampil. Semua tab tetap ada di dropdown.
  const shown = useMemo(() => {
    if (tabs.length <= MAX_SHOWN) return tabs;
    const first = tabs.slice(0, MAX_SHOWN);
    if (first.some((t) => t.key === activeKey)) return first;
    const act = tabs.find((t) => t.key === activeKey);
    return act ? [...first.slice(0, MAX_SHOWN - 1), act] : first;
  }, [tabs, activeKey]);
  const stop = (e) => e.stopPropagation();

  return (
    <div className="sticky top-0 z-30 flex items-end gap-1 bg-gradient-to-r from-[#022c22] to-[#064e3b] px-3 pt-2 print:hidden" role="tablist" aria-label="Halaman terbuka">
      <button
        type="button"
        onClick={onHome}
        title="Beranda"
        className="mb-1 flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20"
      >
        <HiOutlineHome className="h-4 w-4" />
        <span className="hidden sm:inline">Beranda</span>
      </button>
      <button
        type="button"
        onClick={onBack}
        title={backTitle}
        aria-label="Kembali"
        className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-100/80 transition hover:bg-white/10 hover:text-white"
      >
        <HiOutlineArrowLeft className="h-4 w-4" />
      </button>
      <div className="mx-1 mb-3 h-4 w-px shrink-0 bg-white/20" />
      <div ref={stripRef} className="mr-8 flex min-w-0 flex-1 gap-0.5 overflow-hidden">
        {shown.map((t) => {
          const { title, icon: Icon } = infoOf(t.pageKey, t.pathname);
          const active = t.key === activeKey;
          const pinned = isPinned(t.key);
          return (
            <div
              key={t.key}
              data-tab={t.key}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              title={title}
              draggable={!pinned}
              onDragStart={(e) => { if (pinned) return; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", t.key); } catch { /* abaikan */ } setDrag({ from: t.key, over: null }); }}
              onDragOver={(e) => { if (!drag || drag.from === t.key || pinned) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (drag.over !== t.key) setDrag({ ...drag, over: t.key }); }}
              onDrop={(e) => { e.preventDefault(); if (drag && !pinned && drag.from !== t.key) onReorder(drag.from, t.key); setDrag(null); }}
              onDragEnd={() => setDrag(null)}
              onClick={(e) => { if (e.target.closest("[data-x]")) return; onActivate(t.key); }}
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.key); } }}
              onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
              onContextMenu={(e) => { e.preventDefault(); setList(null); setCtx({ x: e.clientX, y: e.clientY, key: t.key }); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(t.key); } }}
              className={cn(
                "group relative flex h-10 shrink cursor-pointer select-none items-center gap-2 rounded-t-xl px-3.5 text-xs transition",
                pinned ? "" : "min-w-[84px] max-w-[220px]",
                active ? "bg-white font-bold text-slate-800" : "text-emerald-100/70 hover:bg-white/10 hover:text-white",
                drag?.from === t.key && "opacity-40",
                drag?.over === t.key && "!bg-emerald-500/30"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-emerald-600" : "text-emerald-100/60")} />
              {!pinned && <span className="min-w-0 flex-1 truncate">{title}</span>}
              {!pinned && dirty[t.key] && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 group-hover:hidden" title="Belum disimpan" />}
              {!pinned && (
                <button
                  type="button"
                  data-x
                  onClick={(e) => { stop(e); onClose(t.key); }}
                  className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", active ? "text-slate-400 hover:bg-slate-200 hover:text-slate-700" : "text-emerald-100/50 hover:bg-white/15 hover:text-white", dirty[t.key] && "hidden group-hover:flex")}
                  aria-label={`Tutup tab ${title}`}
                >
                  <HiOutlineXMark className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {/* Tombol + dan daftar tab menempel di sebelah tab terakhir; sisi kanan bar hanya untuk nama dan divisi */}
        <button
          type="button"
          onClick={onNew}
          disabled={tabs.length >= MAX_TABS}
          title="Tab baru (Alt+T)"
          aria-label="Tab baru"
          className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-100/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <HiOutlinePlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={stop}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setCtx(null); setList(list ? null : { x: r.left, y: r.bottom + 4 }); }}
          className="mb-1 flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-emerald-100/70 hover:bg-white/10"
          title="Semua halaman yang terbuka"
        >
          <HiOutlineChevronDown className="h-3.5 w-3.5" /> {tabs.length}/{MAX_TABS}
        </button>
      </div>

      {trailing && <div className="mb-1 ml-auto shrink-0 pl-4">{trailing}</div>}

      {ctx && (
        <div onMouseDown={stop} style={{ left: Math.min(ctx.x, window.innerWidth - 220), top: ctx.y }} className="fixed z-[60] w-52 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xl">
          {[
            ["Tutup tab", isPinned(ctx.key), () => onClose(ctx.key)],
            ["Tutup tab lainnya", tabs.every((t) => t.key === ctx.key || isPinned(t.key)), () => onCloseMany(tabs.filter((t) => t.key !== ctx.key).map((t) => t.key), ctx.key)],
            ["Tutup tab di kanan", idxOf(ctx.key) >= tabs.length - 1, () => onCloseMany(tabs.slice(idxOf(ctx.key) + 1).map((t) => t.key), ctx.key)],
            ["Tutup semua tab", false, () => onCloseMany(tabs.map((t) => t.key), null)],
          ].map(([label, disabled, fn]) => (
            <button key={label} type="button" disabled={disabled} onClick={() => { setCtx(null); fn(); }} className="block w-full rounded-lg px-3 py-2 text-left font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent">
              {label}
            </button>
          ))}
        </div>
      )}
      {list && (
        <div onMouseDown={stop} style={{ left: Math.max(8, Math.min(list.x, window.innerWidth - 272)), top: list.y }} className="fixed z-[60] max-h-[60vh] w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xl">
          {tabs.map((t) => {
            const { title, icon: Icon } = infoOf(t.pageKey, t.pathname);
            return (
              <button key={t.key} type="button" onClick={() => { setList(null); onActivate(t.key); }} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100", t.key === activeKey ? "font-bold text-emerald-700" : "font-semibold text-slate-700")}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {dirty[t.key] && <span className="h-2 w-2 rounded-full bg-amber-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FinanceLayout({ routes }) {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();

  // ── Tab: tiap tab punya riwayat halamannya sendiri (seperti browser) ─────────────────────────────────
  const [boot] = useState(() => loadStored({ pathname: location.pathname, search: location.search }));
  const [tabs, setTabs] = useState(boot.tabs);
  const [activeId, setActiveId] = useState(boot.active);
  const [mounted, setMounted] = useState(() => new Set([boot.active])); // halaman tab dimuat saat tab pertama kali aktif
  const [dirty, setDirtyMap] = useState({});
  const [confirm, setConfirm] = useState(null); // tutup tab: {keys, focusKey}
  const [pending, setPending] = useState(null); // pindah halaman saat isian belum disimpan: {run}
  const [notice, setNotice] = useState("");
  const [trail, setTrail] = useState([]); // tab-tab yang pernah aktif sebelumnya (terbaru di belakang), untuk Kembali di halaman pertama tab
  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeId);
  const dirtyRef = useRef(dirty);
  const navRef = useRef(navigate);
  const locRef = useRef(location);
  const expectedRef = useRef(null); // alamat yang baru kita setel sendiri (supaya tidak dianggap navigasi baru)
  tabsRef.current = tabs;
  activeRef.current = activeId;
  dirtyRef.current = dirty;
  navRef.current = navigate;
  locRef.current = location;

  // Samakan alamat browser dengan halaman tab (tanpa menambah riwayat browser)
  const mirror = useCallback((entry) => {
    const target = entry.pathname + (entry.search || "");
    if (target === locRef.current.pathname + locRef.current.search) return;
    expectedRef.current = target;
    navRef.current(target, { replace: true, state: entry.state || null });
  }, []);

  // Pindah ke halaman baru di tab: tambahkan ke riwayat tab (atau gantikan entri sekarang)
  const applyNav = useCallback((id, entry, replace = false) => {
    setTabs((cur) =>
      cur.map((t) => {
        if (t.id !== id) return t;
        const here = curOf(t);
        const sameKey = keyOf(here.pathname) === keyOf(entry.pathname);
        const sectionSwitch = keyOf(entry.pathname) === SETTINGS_BASE && !entry.search; // pindah bagian Pengaturan tidak memuat ulang halaman
        const bump = sameKey && !sectionSwitch && (entry.search !== here.search || Boolean(entry.state?.toast || entry.state?.refresh));
        const base = replace ? t.hist.slice(0, t.idx) : t.hist.slice(0, t.idx + 1);
        const hist = [...base, entry].slice(-MAX_HIST);
        return { ...t, hist, idx: hist.length - 1, rev: bump ? t.rev + 1 : t.rev };
      })
    );
  }, []);

  // Alamat browser berubah (klik menu, tautan, navigate) → buka di tab yang sedang aktif.
  useEffect(() => {
    const bare = location.pathname.replace(/\/+$/, "");
    // Alamat lama Buku Besar / Jurnal → satu menu General Ledger (tab dipilih lewat ?tab=)
    if (bare === "/finance-ho/buku-besar" || bare === "/finance-ho/jurnal-umum") {
      const q = new URLSearchParams(location.search);
      q.set("tab", bare === "/finance-ho/jurnal-umum" ? "jurnal" : "ledger");
      navRef.current(`/finance-ho/general-ledger?${q.toString()}`, { replace: true, state: location.state });
      return;
    }
    // Alamat lama: /finance-ho/pengaturan(?tab=bank) dan /finance-ho/pembelian/klasifikasi → anak menu Pengaturan Umum
    if (bare === SETTINGS_BASE || bare === "/finance-ho/pembelian/klasifikasi") {
      const sec = bare === SETTINGS_BASE ? new URLSearchParams(location.search).get("tab") || "cabang" : "klasifikasi";
      navRef.current(settingsPath(sec), { replace: true, state: location.state });
      return;
    }
    const key = keyOf(location.pathname);
    if (!key) {
      navRef.current(DEFAULT_PATH, { replace: true });
      return;
    }
    const target = location.pathname + location.search;
    if (expectedRef.current !== null) {
      const expected = expectedRef.current;
      expectedRef.current = null;
      if (expected === target) return; // gema dari alamat yang kita setel sendiri
    }
    const act = tabsRef.current.find((t) => t.id === activeRef.current) || tabsRef.current[0];
    if (!act) return;
    const st = location.state && typeof location.state === "object" ? { ...location.state } : null;
    const closeFlag = Boolean(st?.closeTab); // form selesai disimpan: gantikan entri form agar Kembali tidak membuka form lagi
    if (st) delete st.closeTab;
    const keepState = st && Object.keys(st).length ? st : null;
    const here = curOf(act);
    const samePath = here.pathname === location.pathname;
    // Klik menu halaman yang sedang terbuka (tanpa parameter baru): tidak mengubah apa pun, isian dan filter tetap
    if (samePath && (!location.search || location.search === here.search) && !(keepState?.toast || keepState?.refresh)) return;
    const entry = { pathname: location.pathname, search: location.search, state: keepState };
    const replace = closeFlag || (samePath && location.search === here.search);
    if (dirtyRef.current[act.id] && !closeFlag && keyOf(here.pathname) !== key) {
      // Isian belum disimpan: kembalikan alamat, lalu tanya dulu
      mirror(here);
      setPending({
        run: () => {
          applyNav(act.id, entry, replace);
          expectedRef.current = target;
          navRef.current(target, { replace: true, state: keepState });
        },
      });
      return;
    }
    applyNav(act.id, entry, replace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Simpan daftar tab (alamat dan riwayatnya) agar tetap ada setelah halaman dimuat ulang.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          active: activeId,
          tabs: tabs.map((t) => ({ id: t.id, idx: t.idx, hist: t.hist.map((e) => ({ pathname: e.pathname, search: e.search })) })),
        })
      );
    } catch {
      /* penyimpanan diblokir: abaikan */
    }
  }, [tabs, activeId]);

  useEffect(() => {
    setMounted((m) => (m.has(activeId) ? m : new Set(m).add(activeId)));
  }, [activeId]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const setDirty = useCallback((key, value) => {
    setDirtyMap((d) => {
      if (Boolean(d[key]) === Boolean(value)) return d;
      const n = { ...d };
      if (value) n[key] = true;
      else delete n[key];
      return n;
    });
  }, []);

  const activate = useCallback((id) => {
    const t = tabsRef.current.find((x) => x.id === id);
    if (!t) return;
    const prev = activeRef.current;
    if (prev && prev !== id) setTrail((tr) => [...tr.filter((k) => k !== prev && k !== id), prev].slice(-20));
    else setTrail((tr) => tr.filter((k) => k !== id));
    setActiveId(id);
    setMounted((m) => (m.has(id) ? m : new Set(m).add(id)));
    mirror(curOf(t));
  }, [mirror]);

  // Tombol +: tab baru berisi Beranda (pilih menu dari sana)
  const newTab = useCallback(() => {
    if (tabsRef.current.length >= MAX_TABS) {
      setNotice(`Batas ${MAX_TABS} tab tercapai. Tutup satu tab dulu sebelum membuka tab baru.`);
      return;
    }
    const nt = mkTab(NEW_TAB_PATH);
    const prev = activeRef.current;
    if (prev) setTrail((tr) => [...tr.filter((k) => k !== prev), prev].slice(-20));
    setTabs((c) => [...c, nt]);
    setActiveId(nt.id);
    setMounted((m) => new Set(m).add(nt.id));
    mirror(curOf(nt));
  }, [mirror]);

  const performClose = useCallback((keys, focusKey) => {
    const cur = tabsRef.current;
    const closing = new Set(keys.filter((k) => !isPinned(k)));
    if (!closing.size) return;
    const rest = cur.filter((t) => !closing.has(t.id));
    setTabs(rest);
    setMounted((m) => { const n = new Set(m); closing.forEach((k) => n.delete(k)); return n; });
    setDirtyMap((d) => { const n = { ...d }; closing.forEach((k) => delete n[k]); return n; });
    setTrail((tr) => tr.filter((k) => !closing.has(k)));
    let target = null;
    if (focusKey) target = rest.find((t) => t.id === focusKey);
    else if (closing.has(activeRef.current)) {
      const idx = cur.findIndex((t) => t.id === activeRef.current);
      target = cur.slice(idx + 1).find((t) => !closing.has(t.id)) || [...cur.slice(0, idx)].reverse().find((t) => !closing.has(t.id)) || rest[0];
    }
    if (target) {
      setActiveId(target.id);
      setMounted((m) => (m.has(target.id) ? m : new Set(m).add(target.id)));
      mirror(curOf(target));
    } else if (!rest.length) navRef.current("/"); // tab terakhir ditutup → Beranda
  }, [mirror]);

  const closeKeys = useCallback((keys, focusKey = null) => {
    const real = keys.filter((k) => !isPinned(k) && tabsRef.current.some((t) => t.id === k));
    if (!real.length) return;
    if (real.some((k) => dirtyRef.current[k])) setConfirm({ keys: real, focusKey });
    else performClose(real, focusKey);
  }, [performClose]);

  const closeOne = useCallback((key) => closeKeys([key]), [closeKeys]);

  // Seret tab ke tab lain: tab yang diseret mengambil posisi tab tujuan.
  const reorder = useCallback((fromKey, toKey) => {
    setTabs((cur) => {
      const a = cur.findIndex((t) => t.id === fromKey);
      const b = cur.findIndex((t) => t.id === toKey);
      if (a < 0 || b < 0 || a === b) return cur;
      const next = [...cur];
      const [m] = next.splice(a, 1);
      next.splice(b, 0, m);
      return next;
    });
  }, []);

  // Mundur satu halaman di dalam tab (seperti tombol kembali browser)
  const moveTo = useCallback((id, to) => {
    setTabs((cur) =>
      cur.map((t) => {
        if (t.id !== id || to < 0 || to >= t.hist.length) return t;
        const a = curOf(t);
        const b = t.hist[to];
        const bump = keyOf(a.pathname) === keyOf(b.pathname) && a.search !== b.search;
        return { ...t, idx: to, rev: bump ? t.rev + 1 : t.rev };
      })
    );
  }, []);

  const stepBack = useCallback((id) => {
    const t = tabsRef.current.find((x) => x.id === id);
    if (!t || t.idx <= 0) return false;
    const entry = t.hist[t.idx - 1];
    const run = () => {
      moveTo(id, t.idx - 1);
      if (activeRef.current === id) mirror(entry);
    };
    if (dirtyRef.current[id]) setPending({ run });
    else run();
    return true;
  }, [moveTo, mirror]);

  const active = tabs.find((t) => t.id === activeId) || tabs[0];
  // Kembali: mundur satu halaman di tab ini; di halaman pertama tab, pindah ke tab yang sebelumnya aktif
  const trailTarget = useMemo(() => [...trail].reverse().find((k) => k !== activeId && tabs.some((t) => t.id === k)) || null, [trail, activeId, tabs]);
  const trailTargetRef = useRef(trailTarget);
  trailTargetRef.current = trailTarget;
  const canGoBack = Boolean(active && (active.idx > 0 || trailTarget));
  const backTitle = active && active.idx > 0 ? "Kembali satu halaman di tab ini" : trailTarget ? "Kembali ke tab sebelumnya" : "Kembali ke halaman utama (Beranda)";
  const goBack = useCallback(() => {
    if (stepBack(activeRef.current)) return;
    if (trailTargetRef.current) { activate(trailTargetRef.current); return; }
    // Tidak ada halaman atau tab sebelumnya: ke halaman utama (Beranda); tanya dulu bila ada isian belum disimpan
    const home = () => navRef.current("/");
    if (dirtyRef.current[activeRef.current]) setPending({ run: home });
    else home();
  }, [stepBack, activate]);

  // Halaman form (Jurnal baru / Ubah): "batal" mundur ke halaman asal; bila tab hanya punya satu halaman, tab ditutup
  const leaveTab = useCallback((id) => {
    if (!stepBack(id)) closeKeys([id]);
  }, [stepBack, closeKeys]);

  // Pintasan: Alt+T tab baru, Alt+W tutup tab, Alt+←/→ pindah tab
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const list = tabsRef.current;
      const i = list.findIndex((t) => t.id === activeRef.current);
      const k = e.key.toLowerCase();
      if (k === "t") { e.preventDefault(); newTab(); }
      else if (k === "w") { e.preventDefault(); closeOne(activeRef.current); }
      else if (e.key === "ArrowRight" && list.length > 1) { e.preventDefault(); activate(list[(i + 1) % list.length].id); }
      else if (e.key === "ArrowLeft" && list.length > 1) { e.preventDefault(); activate(list[(i - 1 + list.length) % list.length].id); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activate, closeOne, newTab]);

  // Peringatan bila memuat ulang / menutup browser saat ada isian belum disimpan
  const anyDirty = Object.keys(dirty).length > 0;
  useEffect(() => {
    if (!anyDirty) return undefined;
    const onBefore = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [anyDirty]);

  // Posisi gulir diingat per tab
  const scrollPos = useRef({});
  useEffect(() => {
    const onScroll = () => { scrollPos.current[activeRef.current] = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    window.scrollTo(0, scrollPos.current[activeId] || 0);
  }, [activeId]);

  // Bentuk ringkas untuk bar tab: id, halaman sekarang, dan kunci halamannya (judul & ikon)
  const viewTabs = useMemo(() => tabs.map((t) => ({ key: t.id, pathname: curOf(t).pathname, pageKey: keyOf(curOf(t).pathname) || curOf(t).pathname })), [tabs]);
  const titleOfTab = (id) => {
    const t = tabs.find((x) => x.id === id);
    return t ? infoOf(keyOf(curOf(t).pathname) || curOf(t).pathname, curOf(t).pathname).title : "tab";
  };

  const group = findGroup(pathname);
  // Menu samping diganti hamburger yang membuka ke kanan. Anak menu (mis. Pengaturan Umum) dibuat sejajar.
  const navItems = useMemo(
    // Item bersub-menu (Pengaturan Umum) tampil sebagai satu pilihan; bagian-bagiannya ada di daftar sisi kiri halamannya
    () => (group ? group.items.map((it) => ({ id: it.to, label: it.label, icon: it.icon, hint: it.description })) : []),
    [group]
  );
  const navActive = useMemo(() => {
    const bare = pathname.replace(/\/+$/, "");
    return navItems.find((i) => i.id === bare)?.id || navItems.filter((i) => bare.startsWith(`${i.id}/`)).sort((a, b) => b.id.length - a.id.length)[0]?.id || null;
  }, [navItems, pathname]);

  const subNav = useMemo(
    () => (navItems.length > 0 && group ? <HamburgerNav items={navItems} value={navActive} onSelect={(to) => navigate(to)} label={group.label} /> : null),
    [navItems, navActive, group, navigate]
  );

  // Set page title
  useEffect(() => {
    document.title = "HO Finance | Alora SuperApp";
  }, []);

  const confirmTitles = confirm ? confirm.keys.filter((k) => dirty[k]).map((k) => titleOfTab(k)) : [];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 antialiased font-sans">
      {/* ── Main Content Area ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar tabs={viewTabs} activeKey={activeId} dirty={dirty} onActivate={activate} onClose={closeOne} onCloseMany={closeKeys} onReorder={reorder} onNew={newTab} canGoBack={canGoBack} backTitle={backTitle} onBack={goBack} onHome={() => navigate("/")} trailing={<UserMenu />} />

        {/* Halaman tiap tab: yang tidak aktif disembunyikan, bukan dibuang */}
        <main className="flex-1">
          {/* Hamburger sub-menu ditaruh PageHeader di sisi kiri kartu alat (di bawah judul), sejajar dengan filter */}
          <SubNavContext.Provider value={subNav}>
            {tabs.filter((t) => mounted.has(t.id)).map((t) => (
              <div key={t.id} hidden={t.id !== activeId} role="tabpanel">
                <TabView routes={routes} tab={t} setDirty={setDirty} closeTab={leaveTab} />
              </div>
            ))}
          </SubNavContext.Provider>
        </main>
      </div>

      {notice && (
        <div role="status" className="fixed left-1/2 top-20 z-[70] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl">
          {notice}
        </div>
      )}
      <ConfirmModal
        open={Boolean(pending)}
        tone="warning"
        title="Pindah halaman?"
        desc="Isian di halaman ini belum disimpan dan akan hilang."
        confirmLabel="Pindah tanpa menyimpan"
        onClose={() => setPending(null)}
        onConfirm={() => { const p = pending; setPending(null); p?.run(); }}
      />
      <ConfirmModal
        open={Boolean(confirm)}
        tone="warning"
        title={confirmTitles.length > 1 ? `${confirmTitles.length} tab belum disimpan` : `Tutup “${confirmTitles[0] || "tab"}”?`}
        desc="Isian yang belum disimpan akan hilang."
        confirmLabel="Tutup tanpa menyimpan"
        onClose={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); if (c) performClose(c.keys, c.focusKey); }}
      />
    </div>
  );
}
