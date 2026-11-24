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
// TAB HALAMAN — setiap menu yang dibuka menjadi tab (seperti browser).
// Halaman di tab yang tidak aktif tetap hidup (hanya disembunyikan), jadi filter, isian,
// dan posisi gulir tidak hilang saat pindah tab. Daftar tab disimpan di localStorage.
// ════════════════════════════════════════════════════════════════════════════
const MAX_TABS = 12;
const MAX_SHOWN = 5; // jumlah tab yang tampil di bar (sisanya lewat dropdown)
const PINNED_KEY = "/finance-ho/dashboard";
const STORE_KEY = "alfi.tabs.v1";
const TITLE_OVERRIDE = {};

const isPinned = () => false; // tidak ada tab yang disematkan; posisi paling kiri dipakai tombol Kembali
const isChild = (key) => key === "jurnal-baru" || key.startsWith("jurnal-ubah:"); // form: dibuka di sebelah halaman asalnya

// Kunci tab: satu halaman = satu tab. Mengembalikan null bila alamat tidak dikenal.
function keyOf(pathname) {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/finance-ho/jurnal-umum/baru") return "jurnal-baru";
  const m = p.match(/^\/finance-ho\/jurnal-umum\/([^/]+)\/ubah$/);
  if (m) return `jurnal-ubah:${m[1]}`;
  if (p === SETTINGS_BASE || p.startsWith(`${SETTINGS_BASE}/`)) return SETTINGS_BASE; // semua anak menu Pengaturan Umum = satu tab
  const item = ALL_MENU_ITEMS.find((i) => i.to === p);
  return item ? item.to : null;
}

function infoOf(key, pathname = "") {
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

function loadStoredTabs(initialKey, initialPath) {
  let stored = [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (Array.isArray(raw?.tabs)) stored = raw.tabs;
  } catch {
    stored = [];
  }
  const out = [];
  const seen = new Set();
  const add = (key, pathname, search) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ key, pathname, search: search || "", state: null, rev: 0, opener: null });
  };
  stored.forEach((t) => {
    if (t?.key === SETTINGS_BASE && String(t.pathname).replace(/\/+$/, "") === SETTINGS_BASE) {
      t = { ...t, pathname: settingsPath(new URLSearchParams(t.search || "").get("tab") || "cabang"), search: "" };
    }
    if (typeof t?.pathname === "string" && t.pathname.startsWith("/finance-ho/") && keyOf(t.pathname, t.search || "") === t.key) add(t.key, t.pathname, t.search);
  });
  if (initialKey) add(initialKey, initialPath.pathname, initialPath.search);
  return out.slice(0, MAX_TABS);
}

// Merender satu halaman pada alamat tab itu sendiri (bukan alamat browser).
function TabView({ routes, tab, setDirty, closeTab }) {
  const location = useMemo(
    () => ({ pathname: tab.pathname, search: tab.search, hash: "", state: tab.state, key: `${tab.key}#${tab.rev}` }),
    [tab.pathname, tab.search, tab.state, tab.rev, tab.key]
  );
  const element = useRoutes(routes, location);
  const ctx = useMemo(() => ({ key: tab.key, setDirty, closeTab }), [tab.key, setDirty, closeTab]);
  return (
    <TabsContext.Provider value={ctx}>
      <ErrorBoundary key={`${tab.key}#${tab.rev}`}>{element}</ErrorBoundary>
    </TabsContext.Provider>
  );
}

function TabBar({ tabs, activeKey, dirty, onActivate, onClose, onCloseMany, onReorder, canGoBack, onBack, onHome, trailing }) {
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
        title={canGoBack ? "Kembali satu langkah" : "Kembali ke Beranda"}
        aria-label="Kembali"
        className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-100/80 transition hover:bg-white/10 hover:text-white"
      >
        <HiOutlineArrowLeft className="h-4 w-4" />
      </button>
      <div className="mx-1 mb-3 h-4 w-px shrink-0 bg-white/20" />
      <div ref={stripRef} className="mr-8 flex min-w-0 flex-1 gap-0.5 overflow-hidden">
        {shown.map((t) => {
          const { title, icon: Icon } = infoOf(t.key, t.pathname);
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
        })}    <button
          type="button"
          onMouseDown={stop}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setCtx(null); setList(list ? null : { x: r.right, y: r.bottom + 4 }); }}
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
        <div onMouseDown={stop} style={{ left: Math.max(8, list.x - 260), top: list.y }} className="fixed z-[60] max-h-[60vh] w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xl">
          {tabs.map((t) => {
            const { title, icon: Icon } = infoOf(t.key, t.pathname);
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

  // ── Tab ────────────────────────────────────────────────────────────────
  const initialKey = keyOf(pathname, location.search);
  const [tabs, setTabs] = useState(() => loadStoredTabs(initialKey, location));
  const [activeKey, setActiveKey] = useState(initialKey || PINNED_KEY);
  const [mounted, setMounted] = useState(() => new Set([initialKey || PINNED_KEY])); // halaman baru dimuat saat pertama dibuka
  const [dirty, setDirtyMap] = useState({});
  const [confirm, setConfirm] = useState(null); // {keys, focusKey}
  const [notice, setNotice] = useState("");
  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeKey);
  const dirtyRef = useRef(dirty);
  const navRef = useRef(navigate);
  tabsRef.current = tabs;
  activeRef.current = activeKey;
  dirtyRef.current = dirty;
  navRef.current = navigate;

  // Alamat browser berubah (klik menu, tautan, navigate) → buka / fokus tab yang sesuai.
  useEffect(() => {
    // Alamat lama: /finance-ho/pengaturan(?tab=bank) dan /finance-ho/pembelian/klasifikasi → anak menu Pengaturan Umum
    const bare = location.pathname.replace(/\/+$/, "");
    // Alamat lama Buku Besar / Jurnal → satu menu General Ledger (tab dipilih lewat ?tab=)
    if (bare === "/finance-ho/buku-besar" || bare === "/finance-ho/jurnal-umum") {
      const q = new URLSearchParams(location.search);
      q.set("tab", bare === "/finance-ho/jurnal-umum" ? "jurnal" : "ledger");
      navRef.current(`/finance-ho/general-ledger?${q.toString()}`, { replace: true, state: location.state });
      return;
    }
    if (bare === SETTINGS_BASE || bare === "/finance-ho/pembelian/klasifikasi") {
      const sec = bare === SETTINGS_BASE ? new URLSearchParams(location.search).get("tab") || "cabang" : "klasifikasi";
      navRef.current(settingsPath(sec), { replace: true, state: location.state });
      return;
    }
    const key = keyOf(location.pathname, location.search);
    if (!key) {
      navRef.current(PINNED_KEY, { replace: true });
      return;
    }
    const cur = tabsRef.current;
    const st = location.state && typeof location.state === "object" ? { ...location.state } : null;
    const closeKey = st?.closeTab || null;
    if (st) delete st.closeTab;
    const keepState = st && Object.keys(st).length ? st : null;
    const existing = cur.find((t) => t.key === key);
    let next;
    let replacedKey = null;
    if (existing) {
      // Klik menu biasa (tanpa parameter) pada tab yang sudah terbuka hanya memindahkan fokus, tidak mengubah isinya.
      const focusOnly = !location.search && existing.pathname === location.pathname;
      const same = focusOnly || (existing.pathname === location.pathname && existing.search === location.search);
      // Pindah anak menu Pengaturan Umum cukup ganti bagian, halamannya tidak dimuat ulang
      const sectionSwitch = key === SETTINGS_BASE && !location.search;
      // Parameter berbeda (mis. ?date=… dari tautan lain) atau ada pesan baru → muat ulang halaman itu.
      const bump = (!same && !sectionSwitch) || Boolean(keepState?.toast || keepState?.refresh);
      next = cur.map((t) => (t.key === key ? { ...t, pathname: location.pathname, search: focusOnly ? t.search : location.search, state: keepState, rev: bump ? t.rev + 1 : t.rev } : t));
    } else {
      const nt = { key, pathname: location.pathname, search: location.search, state: keepState, rev: 0, opener: activeRef.current };
      const activeIdx = cur.findIndex((t) => t.key === activeRef.current);
      // Menu baru menggantikan tab yang sedang aktif (seperti tautan biasa), bukan selalu buka tab baru.
      // Kecuali: form anak (selalu di sebelah halaman asalnya), tab Dashboard (tidak boleh ditimpa), atau tab aktif belum disimpan.
      const canReplace = !isChild(key) && activeIdx >= 0 && !isPinned(cur[activeIdx].key) && !dirtyRef.current[activeRef.current];
      if (canReplace) {
        replacedKey = cur[activeIdx].key;
        next = cur.map((t, i) => (i === activeIdx ? nt : t));
      } else {
        if (cur.length >= MAX_TABS) {
          setNotice(`Batas ${MAX_TABS} tab tercapai. Tutup satu tab dulu sebelum membuka halaman lain.`);
          const back = cur.find((t) => t.key === activeRef.current) || cur[0];
          navRef.current(back.pathname + back.search, { replace: true });
          return;
        }
        const at = isChild(key) ? activeIdx : -1;
        next = at >= 0 ? [...cur.slice(0, at + 1), nt, ...cur.slice(at + 1)] : [...cur, nt];
      }
    }
    if (closeKey && closeKey !== key) next = next.filter((t) => t.key !== closeKey || isPinned(t.key));
    setTabs(next);
    setActiveKey(key);
    setMounted((m) => {
      const n = new Set(m);
      n.add(key);
      if (closeKey && closeKey !== key && !isPinned(closeKey)) n.delete(closeKey);
      if (replacedKey && replacedKey !== key && !isPinned(replacedKey)) n.delete(replacedKey);
      return n;
    });
    if (closeKey && closeKey !== key) setDirtyMap((d) => { const n = { ...d }; delete n[closeKey]; return n; });
    if (replacedKey && replacedKey !== key) setDirtyMap((d) => { const n = { ...d }; delete n[replacedKey]; return n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Simpan daftar tab (alamatnya saja) agar tetap ada setelah halaman dimuat ulang.
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ tabs: tabs.map((t) => ({ key: t.key, pathname: t.pathname, search: t.search })) }));
    } catch {
      /* penyimpanan diblokir: abaikan */
    }
  }, [tabs]);

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

  const activate = useCallback((key) => {
    const t = tabsRef.current.find((x) => x.key === key);
    if (t) navRef.current(t.pathname + t.search);
  }, []);

  const performClose = useCallback((keys, focusKey) => {
    const cur = tabsRef.current;
    const closing = new Set(keys.filter((k) => !isPinned(k)));
    if (!closing.size) return;
    const rest = cur.filter((t) => !closing.has(t.key));
    setTabs(rest);
    setMounted((m) => { const n = new Set(m); closing.forEach((k) => n.delete(k)); return n; });
    setDirtyMap((d) => { const n = { ...d }; closing.forEach((k) => delete n[k]); return n; });
    let target = null;
    if (focusKey) target = rest.find((t) => t.key === focusKey);
    else if (closing.has(activeRef.current)) {
      const idx = cur.findIndex((t) => t.key === activeRef.current);
      const closed = cur[idx];
      target = rest.find((t) => t.key === closed?.opener) || cur.slice(idx + 1).find((t) => !closing.has(t.key)) || [...cur.slice(0, idx)].reverse().find((t) => !closing.has(t.key)) || rest[0];
    }
    if (target) navRef.current(target.pathname + target.search);
    else if (!rest.length) navRef.current("/"); // tab terakhir ditutup → Beranda
  }, []);

  const closeKeys = useCallback((keys, focusKey = null) => {
    const real = keys.filter((k) => !isPinned(k) && tabsRef.current.some((t) => t.key === k));
    if (!real.length) return;
    if (real.some((k) => dirtyRef.current[k])) setConfirm({ keys: real, focusKey });
    else performClose(real, focusKey);
  }, [performClose]);

  const closeOne = useCallback((key) => closeKeys([key]), [closeKeys]);

  // Seret tab ke tab lain: tab yang diseret mengambil posisi tab tujuan. Dashboard tetap paling kiri.
  const reorder = useCallback((fromKey, toKey) => {
    setTabs((cur) => {
      const a = cur.findIndex((t) => t.key === fromKey);
      const b = cur.findIndex((t) => t.key === toKey);
      if (a < 0 || b < 0 || a === b || isPinned(fromKey) || isPinned(toKey)) return cur;
      const next = [...cur];
      const [m] = next.splice(a, 1);
      next.splice(b, 0, m);
      return next;
    });
  }, []);

  // Tombol kembali: mundur satu langkah riwayat (bukan langsung ke Beranda)
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  const goBack = useCallback(() => {
    if ((window.history.state?.idx ?? 0) > 0) navRef.current(-1);
    else navRef.current("/");
  }, []);

  // Pintasan: Alt+W tutup tab, Alt+←/→ pindah tab
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const list = tabsRef.current;
      const i = list.findIndex((t) => t.key === activeRef.current);
      if (e.key.toLowerCase() === "w") { e.preventDefault(); closeOne(activeRef.current); }
      else if (e.key === "ArrowRight" && list.length > 1) { e.preventDefault(); activate(list[(i + 1) % list.length].key); }
      else if (e.key === "ArrowLeft" && list.length > 1) { e.preventDefault(); activate(list[(i - 1 + list.length) % list.length].key); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activate, closeOne]);

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
    window.scrollTo(0, scrollPos.current[activeKey] || 0);
  }, [activeKey]);

  const group = findGroup(pathname);
  // Menu samping diganti hamburger yang membuka ke kanan. Anak menu (mis. Pengaturan Umum) dibuat sejajar.
  const navItems = useMemo(
    () => (group ? group.items.flatMap((it) => (it.children ? it.children : [it])).map((it) => ({ id: it.to, label: it.label, icon: it.icon, hint: it.description })) : []),
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

  const confirmTitles = confirm ? confirm.keys.filter((k) => dirty[k]).map((k) => infoOf(k).title) : [];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 antialiased font-sans">
      {/* ── Main Content Area ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar tabs={tabs} activeKey={activeKey} dirty={dirty} onActivate={activate} onClose={closeOne} onCloseMany={closeKeys} onReorder={reorder} canGoBack={canGoBack} onBack={goBack} onHome={() => navigate("/")} trailing={<UserMenu />} />

        {/* Halaman tiap tab: yang tidak aktif disembunyikan, bukan dibuang */}
        <main className="flex-1">
          {/* Hamburger sub-menu ditaruh PageHeader di sisi kiri kartu alat (di bawah judul), sejajar dengan filter */}
          <SubNavContext.Provider value={subNav}>
            {tabs.filter((t) => mounted.has(t.key)).map((t) => (
              <div key={t.key} hidden={t.key !== activeKey} role="tabpanel">
                <TabView routes={routes} tab={t} setDirty={setDirty} closeTab={closeOne} />
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
