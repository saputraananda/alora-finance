import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRightOnRectangle,
  HiOutlineBars3,
  HiOutlineXMark,
  HiOutlineBookOpen,
  HiOutlineDocumentText,
  HiOutlineNumberedList,
  HiOutlineCalculator,
  HiOutlineChartBar,
  HiOutlineBanknotes,
  HiOutlineScale,
  HiOutlineReceiptPercent,
  HiOutlineDocumentChartBar,
  HiOutlineCircleStack,
  HiOutlineChevronDown,
} from "react-icons/hi2";

import { clearSession } from "../lib/api";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ── Standalone (Direct) Menu Items ──────────────────────────────────────────
const STANDALONE_ITEMS = [
  {
    to: "/finance-ho/dashboard",
    icon: HiOutlineChartBar,
    label: "Dashboard",
    description: "Revenue, beban & realisasi budget",
    end: false,
  },
  {
    to: "/finance-ho/rekonsiliasi",
    icon: HiOutlineScale,
    label: "Rekonsiliasi",
    description: "Penyelarasan kas & bank",
    end: false,
  },
];

// ── Collapsible Menu Sections ───────────────────────────────────────────────
const OPERATIONAL_SECTIONS = [
  {
    id: "transaksi",
    label: "Transaksi",
    icon: HiOutlineReceiptPercent,
    items: [
      {
        to: "/finance-ho/jurnal-umum",
        icon: HiOutlineBookOpen,
        label: "Jurnal Umum",
        description: "Pencatatan transaksi double-entry",
        end: true,
      },
    ],
  },
  {
    id: "report",
    label: "Report",
    icon: HiOutlineDocumentChartBar,
    items: [
      {
        to: "/finance-ho/buku-besar",
        icon: HiOutlineDocumentText,
        label: "General Ledger",
        description: "Rincian mutasi & saldo per akun",
        end: false,
      },
    ],
  },
];

const MASTER_SECTIONS = [
  {
    id: "master",
    label: "Master Data",
    icon: HiOutlineCircleStack,
    items: [
      {
        to: "/finance-ho/coa",
        icon: HiOutlineNumberedList,
        label: "Master COA",
        description: "Bagan akun & saldo normal",
        end: false,
      },
      {
        to: "/finance-ho/anggaran-beban",
        icon: HiOutlineCalculator,
        label: "Anggaran Beban",
        description: "Budget per akun per bulan",
        end: false,
      },
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

// ── Collapsible Dropdown Section (Gaya My Waschen) ──────────────────────────
function DropdownSection({ section, open, onToggle, collapsed, onClose, pathname }) {
  const SectionIcon = section.icon;
  const hasActiveChild = section.items.some((item) => isItemActive(pathname, item));

  if (collapsed) {
    return (
      <div className="space-y-0.5 px-1.5 py-1">
        {section.items.map((item) => (
          <NavItem key={item.to} {...item} onClose={onClose} collapsed />
        ))}
      </div>
    );
  }

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition",
          hasActiveChild
            ? "bg-emerald-50/70 text-emerald-800 font-bold"
            : "text-slate-700 hover:bg-slate-100"
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition",
            hasActiveChild
              ? "border-emerald-200 bg-white text-emerald-700 shadow-xs"
              : "border-slate-200 bg-white text-slate-400"
          )}
        >
          <SectionIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-none">{section.label}</p>
          <p className="mt-0.5 truncate text-[11px] leading-none text-slate-400">
            {section.items.length} menu
          </p>
        </div>
        <HiOutlineChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
            open && "rotate-180",
            hasActiveChild && "text-emerald-700"
          )}
        />
      </button>

      {/* Smooth CSS Grid Folding (Mirip My Waschen) */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <nav className="mt-1 space-y-0.5 border-l-2 border-emerald-100 ml-5 pl-2 pb-1">
            {section.items.map((item) => (
              <NavItem key={item.to} {...item} onClose={onClose} collapsed={false} />
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ collapsed = false, onClose, openSections, setOpenSections }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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
        {!collapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 shadow-md shadow-emerald-600/20">
              <HiOutlineBanknotes className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800 leading-tight">
                HO Finance
              </p>
              <p className="truncate text-[11px] text-slate-400">
                Alora SuperApp
              </p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 shadow-md">
            <HiOutlineBanknotes className="h-5 w-5 text-white" />
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

      {/* Menu label */}
      {!collapsed && (
        <p className="px-5 pt-3.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Menu Navigasi
        </p>
      )}
      {collapsed && <div className="pt-2" />}

      {/* Navigation items */}
      <nav className={cn("flex-1 overflow-y-auto space-y-1", collapsed ? "px-1.5" : "px-3")}>
        {/* 1. Standalone Items: Dashboard & Rekonsiliasi */}
        <div className="space-y-0.5">
          {STANDALONE_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} onClose={onClose} collapsed={collapsed} />
          ))}
        </div>

        {/* 2. Operasional Sections: Transaksi & Report */}
        <div className="pt-1 space-y-0.5">
          {OPERATIONAL_SECTIONS.map((section) => (
            <DropdownSection
              key={section.id}
              section={section}
              open={Boolean(openSections[section.id])}
              onToggle={() => toggleSection(section.id)}
              collapsed={collapsed}
              onClose={onClose}
              pathname={pathname}
            />
          ))}
        </div>

        {/* 3. Master Menu Section Header */}
        {!collapsed && (
          <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Master Menu
          </p>
        )}
        {collapsed && <div className="pt-2" />}

        {/* 4. Collapsible Master Sections */}
        <div className="space-y-0.5">
          {MASTER_SECTIONS.map((section) => (
            <DropdownSection
              key={section.id}
              section={section}
              open={Boolean(openSections[section.id])}
              onToggle={() => toggleSection(section.id)}
              collapsed={collapsed}
              onClose={onClose}
              pathname={pathname}
            />
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

  const user = getStoredUser();
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
    clearSession();
    sessionStorage.clear();
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setCollapsed] = useState(false);
  const drawerRef = useRef(null);

  // Status open/close untuk setiap dropdown section (default tertutup / collapsed)
  const [openSections, setOpenSections] = useState({});

  // Otomatis buka section jika route anak aktif
  useEffect(() => {
    MENU_SECTIONS.forEach((section) => {
      if (section.items.some((item) => isItemActive(pathname, item))) {
        setOpenSections((prev) => ({ ...prev, [section.id]: true }));
      }
    });
  }, [pathname]);

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
      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out lg:flex lg:flex-col",
          desktopCollapsed ? "w-20" : "w-64"
        )}
      >
        <Sidebar
          collapsed={desktopCollapsed}
          openSections={openSections}
          setOpenSections={setOpenSections}
        />
      </aside>

      {/* ── Mobile Drawer (Backdrop + Slide-over) ─────────────────────────── */}
      {mobileOpen && (
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
            <Sidebar
              collapsed={false}
              onClose={() => setMobileOpen(false)}
              openSections={openSections}
              setOpenSections={setOpenSections}
            />
          </div>
        </div>
      )}

      {/* ── Main Content Area ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition lg:hidden"
              aria-label="Buka menu navigasi"
            >
              <HiOutlineBars3 className="h-5 w-5" />
            </button>

            {/* Desktop toggle collapse */}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="hidden h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition lg:flex"
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
