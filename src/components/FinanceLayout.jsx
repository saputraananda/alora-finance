import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRightOnRectangle,
  HiOutlineBars3,
  HiOutlineComputerDesktop,
  HiOutlineCog6Tooth,
  HiOutlineUsers,
  HiOutlineLockClosed,
  HiOutlineBuildingOffice2,
  HiOutlineXMark,
  HiOutlineBookOpen,
  HiOutlineDocumentText,
  HiOutlineNumberedList,
  HiOutlineCalculator,
  HiOutlineChartBar,
  HiOutlineBanknotes,
  HiOutlineShoppingCart,
  HiOutlineCreditCard,
  HiOutlineTag,
  HiOutlineScale,
  HiOutlineReceiptPercent,
  HiOutlineDocumentChartBar,
  HiOutlineCircleStack,
} from "react-icons/hi2";

import { clearSession } from "../lib/api";
import { useAuth } from "../context/AuthContext";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ── Menu mengikuti "Peta menu" Referensi Tampilan Aplikasi (12 menu utama) ──
// Menu yang modulnya belum dibangun (Kas Kecil, Pembelian, Persediaan, Aset Tetap)
// tampil sebagai "Segera hadir" di Beranda, tidak di sidebar.
const STANDALONE_ITEMS = [
  { to: "/finance-ho/dashboard", icon: HiOutlineChartBar, label: "Dashboard", description: "Ringkasan semua cabang", end: false },
  { to: "/finance-ho/integrasi-pos", icon: HiOutlineComputerDesktop, label: "Integrasi POS", description: "Sinkronisasi harian & detail batch", end: false },
  { to: "/finance-ho/jurnal-umum", icon: HiOutlineBookOpen, label: "Jurnal", description: "Daftar jurnal & jurnal manual", end: true },
  { to: "/finance-ho/rekonsiliasi", icon: HiOutlineScale, label: "Rekonsiliasi", description: "Harian, settlement, setoran, bank", end: false },
];

const OPERATIONAL_SECTIONS = [
  {
    id: "pelanggan",
    label: "Pelanggan",
    icon: HiOutlineUsers,
    items: [
      { to: "/finance-ho/pelanggan/deposit", icon: HiOutlineUsers, label: "Deposit Member", description: "Saldo POS vs akun Deposit", end: false },
    ],
  },
  {
    id: "pembelian",
    label: "Pembelian",
    icon: HiOutlineShoppingCart,
    items: [
      { to: "/finance-ho/pembelian/pengajuan", icon: HiOutlineShoppingCart, label: "Pengajuan", description: "Antrean & semua pengajuan", end: false },
      { to: "/finance-ho/pembelian/pembayaran", icon: HiOutlineBanknotes, label: "Pembayaran", description: "Menunggu bayar", end: false },
      { to: "/finance-ho/pembelian/kredit", icon: HiOutlineCreditCard, label: "Kredit & Cicilan", description: "Hutang & jatuh tempo", end: false },
      { to: "/finance-ho/pembelian/klasifikasi", icon: HiOutlineTag, label: "Klasifikasi", description: "Kategori biaya pengajuan", end: false },
    ],
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
      { to: "/finance-ho/buku-besar", icon: HiOutlineDocumentText, label: "Buku Besar", description: "Rincian mutasi & saldo per akun", end: false },
    ],
  },
  {
    id: "tutup-buku",
    label: "Tutup Buku",
    icon: HiOutlineLockClosed,
    items: [
      { to: "/finance-ho/tutup-buku", icon: HiOutlineLockClosed, label: "Tutup Buku", description: "Checklist periode & alokasi biaya pusat", end: false },
    ],
  },
];

const MASTER_SECTIONS = [
  {
    id: "master",
    label: "Pengaturan",
    icon: HiOutlineCog6Tooth,
    items: [
      { to: "/finance-ho/pengaturan", icon: HiOutlineCog6Tooth, label: "Cabang & Metode Bayar", description: "Rekening bank & pemetaan akun", end: false },
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

function NavItem({ to, icon: Icon, label, description, end, onClose, collapsed }) {
  const { pathname } = useLocation();
  const active = isItemActive(pathname, { to, end });

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all",
        collapsed && "justify-center px-2",
        active
          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-semibold"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition",
          active
            ? "bg-white/20 text-white"
            : "border border-slate-200 bg-white text-slate-400 group-hover:border-slate-300 group-hover:text-slate-600"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-sm font-semibold leading-none">{label}</p>
          <p
            className={cn(
              "mt-0.5 truncate text-[11px] leading-none",
              active ? "text-emerald-100" : "text-slate-400"
            )}
          >
            {description}
          </p>
        </div>
      )}
    </NavLink>
  );
}

// Sidebar hanya dipakai untuk menu yang punya submenu (lebih dari 1 halaman).
function Sidebar({ group, collapsed = false, onClose }) {
  const navigate = useNavigate();
  const GroupIcon = group.icon;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Brand header */}
      <div
        className={cn(
          "flex items-center border-b border-slate-100 py-4",
          collapsed
            ? "justify-center px-2"
            : onClose
              ? "justify-between gap-3 px-5"
              : "px-5"
        )}
      >
        {!collapsed ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 shadow-md shadow-emerald-600/20">
              <GroupIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800 leading-tight">{group.label}</p>
              <p className="truncate text-[11px] text-slate-400">HO Finance</p>
            </div>
          </div>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 shadow-md">
            <GroupIcon className="h-5 w-5 text-white" />
          </div>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition lg:hidden"
            aria-label="Tutup sidebar"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className={cn("flex-1 overflow-y-auto space-y-1 pt-3", collapsed ? "px-1.5" : "px-3")}>
        <button
          type="button"
          onClick={() => { navigate("/"); onClose?.(); }}
          title={collapsed ? "Beranda" : undefined}
          className={cn(
            "mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900",
            collapsed && "justify-center px-2"
          )}
        >
          <HiOutlineArrowLeft className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Beranda</span>}
        </button>

        <div className="space-y-0.5">
          {group.items.map((item) => (
            <NavItem key={item.to} {...item} onClose={onClose} collapsed={collapsed} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function ActiveMenuTitle() {
  const { pathname } = useLocation();
  const active =
    ALL_MENU_ITEMS.find((m) => m.end && pathname === m.to) ??
    ALL_MENU_ITEMS.find((m) => !m.end && pathname.startsWith(m.to));

  const label = active?.label ?? "Dashboard";
  const description = active?.description ?? "HO Finance Module";
  const Icon = active?.icon ?? HiOutlineChartBar;

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight text-slate-800">{label}</p>
        <p className="text-[11px] leading-tight text-slate-400">{description}</p>
      </div>
    </div>
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
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-slate-50 focus:outline-none"
      >
        <div className="hidden text-right sm:block">
          <p className="max-w-[240px] truncate text-xs font-bold leading-none text-slate-800 lg:max-w-[360px]" title={fullName}>
            {fullName}
          </p>
          <p className="mt-1 max-w-[240px] truncate text-xs font-medium leading-none text-slate-400 lg:max-w-[360px]" title={department}>
            {department}
          </p>
        </div>
        <img
          src={avatarUrl}
          alt={fullName}
          className="h-9 w-9 rounded-full border border-slate-200 bg-slate-100 object-cover shadow-sm"
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

export default function FinanceLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setCollapsed] = useState(false);
  const drawerRef = useRef(null);

  const group = findGroup(pathname);
  const hasSidebar = Boolean(group);

  // Keyboard: Escape to close drawer
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Set page title
  useEffect(() => {
    document.title = "HO Finance | Alora SuperApp";
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 antialiased font-sans">
      {hasSidebar && (
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out lg:flex lg:flex-col",
            desktopCollapsed ? "w-20" : "w-64"
          )}
        >
          <Sidebar group={group} collapsed={desktopCollapsed} />
        </aside>
      )}

      {/* ── Mobile Drawer (Backdrop + Slide-over) ─────────────────────────── */}
      {hasSidebar && mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl transition-transform duration-300 ease-in-out"
            role="dialog"
            aria-modal="true"
          >
            <Sidebar group={group} collapsed={false} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main Content Area ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            {!hasSidebar && (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <HiOutlineArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Beranda</span>
              </button>
            )}
            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className={cn("flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition lg:hidden", !hasSidebar && "!hidden")}
              aria-label="Buka menu navigasi"
            >
              <HiOutlineBars3 className="h-5 w-5" />
            </button>

            {/* Desktop toggle collapse */}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className={cn("hidden h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition", hasSidebar && "lg:flex")}
              aria-label={desktopCollapsed ? "Buka sidebar" : "Tutup sidebar"}
              title={desktopCollapsed ? "Perlebar menu" : "Ciutkan menu"}
            >
              <HiOutlineBars3 className="h-4 w-4" />
            </button>

            <ActiveMenuTitle />
          </div>

          <UserMenu />
        </header>

        {/* Content Outlet */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
