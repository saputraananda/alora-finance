# Struktur Code & Style Guide — Alora SuperApp

Dokumen ini menjelaskan konvensi arsitektur dan styling yang digunakan di seluruh aplikasi Alora SuperApp. Mengikuti panduan ini memastikan konsistensi ketika membuat page baru atau melakukan maintenance.

---

## 1. Arsitektur Keseluruhan

### 1.1 Alur Pengembangan Page Baru

```
STEP 1 ──► Tambahkan icon di ApplicationsSection.jsx (portal)
STEP 2 ──► Tambahkan routing di App.jsx (frontend)
STEP 3 ──► Buat controller di backend/controllers/[folder]/NamaFiturController.js
STEP 4 ──► Buat routing di backend/routes/[folder]/NamaFiturRoutes.js
STEP 5 ──► Daftarkan routing di backend/index.js
STEP 6 ──► Buat folder di frontend/src/pages/nama-page
STEP 7 ──► Pecah component sidebar + page content ke components/
STEP 8 ──► Fitur spesial (export, print, dll.) masukkan ke utils/
```

---

## 2. Struktur Folder Frontend

### 2.1 Pola Standar Page (dengan sidebar layout)

```
frontend/src/pages/nama-page/
├── index.jsx              # Layout shell (sidebar + topbar + <Outlet>)
├── components/
│   ├── DashboardNama.jsx  # Halaman utama / tab dashboard
│   ├── FormNama.jsx       # Halaman form / create / edit
│   ├── DetailNama.jsx     # Halaman detail / read-only
│   └── ComponentKecil.jsx # Sub-component (modal, toast, filter bar, dll.)
└── utils/
    ├── exportNamaExcel.js # Fungsi export Excel (jika ada)
    └── helperNama.js      # Utility khusus fitur (jika ada)
```

### 2.2 Contoh Halaman yang Mengikuti Pola Standar

| Page | Folder | Theme Color | Notes |
|------|--------|-------------|-------|
| Absensi IKM | `absensi-ikm/` | Blue/Cyan (`from-blue-800 to-cyan-500`) | memiliki `utils/exportAbsensiExcel.js` & `utils/exportKasbonExcel.js` |
| Complaint Management | `complaint-management/` | Fuchsia/Pink (`from-fuchsia-700 to-pink-700`) | - |
| Master RS IKM | `master-rs-ikm/` | Red/Orange (`from-red-800 to-orange-500`) | struktur bersarang: `components/Dashboard/`, `components/MasterData/`, `components/MasterLinen/` (satu file per RS) |
| Document Alora | `document-alora/` | Blue 900 (`from-blue-900 to-blue-700`) | - |
| Pengajuan Alora | `pengajuan-alora/` | Emerald/Teal (`from-emerald-600 to-teal-400`) | halaman utama di `pages/` (`DashboardPengajuan`, `FormPengajuan`, `PengajuanBarang`, `MasterClassification`), modal di `components/`, plus `utils/useCutoffPeriod.js` |
| Master Karyawan (Alora HR) | `master-karyawan/` | Blue (`from-blue-600 to-blue-400`) | absensi, perizinan, lembur RO, annual leave, slip gaji, report bugar; `utils/exportReportAbsensiAloraExcel.js` |
| Know Your Employee | `knowyour-employee/` | Violet/Purple (`from-violet-600 to-purple-500`) | mood, dashboard, analisis burnout |
| CSAT / NPS | `csat-nps/` | Amber/Orange (`from-amber-500 to-orange-500`) | route `/result-of-our-work/*` |
| B2B Alora | `b2b-alora/` | Sky/Cyan (`from-sky-600 to-cyan-500`) | subfolder per program (`B2B-Koperasi-2026/`, `B2B-Haji-2025/`) |
| Master Data SuperApp | `master-data-superapp/` | Slate/Violet (`from-slate-700 to-violet-600`) | satu component per master |
| Project Management v2 | `project-management-v2/` | Indigo/Violet (`from-violet-500 to-indigo-700`) | `pages/Workspaces`, `pages/MyTasks`, `pages/DirectMessages`; v1 (`project-management/`) masih ada |

### 2.3 Alternatif: Page tanpa sidebar layout (standalone)

```
frontend/src/pages/nama-page/
├── index.jsx   # Halaman tunggal (bukan layout shell)
└── components/ # (opsional, jika perlu pecah)
```

Contoh: `employee-satisfaction/index.jsx`, `target-waschen/index.jsx`, `maintenance/index.jsx`

### 2.4 Variasi Struktur yang Ada (non-standar)

Selain `components/` dan `utils/`, beberapa modul memakai subfolder tambahan. Ikuti pola modul yang sudah ada bila menambah fitur di dalamnya.

| Subfolder | Fungsi | Contoh modul |
|-----------|--------|--------------|
| `pages/` | Halaman penuh (route) dipisah dari `components/` yang hanya modal/sub-bagian | `pengajuan-alora`, `training-system`, `project-management-v2` |
| `sections/` | Bagian dashboard per topik, bukan route | `dashboard-sales` (Penjualan, Customer, Membership, Piutang, CleanoxByWaschen) |
| `hooks/` | Custom hook (`useXxx.js`) | `my-waschen` (`useCutoffPeriod`, `useLiveRefresh`, `useHrisOutletRoleFilters`), `project-management` |
| `context/` | React context | `my-waschen/context/ThermalPrinterContext.jsx` |
| `constants/` | Konstanta bersama | `project-management/constants/pmConstants.js` |
| `components/<Grup>/` | Pengelompokan component per domain | `my-waschen` (`HRIS/`, `Inventory/`, `MasterData/`, `Transaction/`, `EventB2B/`), `cleanox-management` (`dashboard/`, `makan-siang/`), `master-rs-ikm` |
| `[id].jsx` | Halaman detail dinamis | `karyawan-ikm/[id].jsx`, `cleanox-management/components/[id].jsx`, `my-waschen/components/HRIS/[id].jsx` |

### 2.5 Shared Code (`frontend/src/`)

```
frontend/src/
├── App.jsx                 # semua route + appRoles (otorisasi per path)
├── components/             # AlertSuccess, ConfirmDialog, LoadingScreen, ProtectedRoute,
│                           # RichTextEditor, UnderDevelopmentDialog
├── layouts/HeaderLayout.jsx
├── lib/api.js              # api, apiUpload, assetUrl, thumbUrl, complaintFileUrl, waschenUploadUrl
└── utils/                  # alert.js, date.js, rupiah.js
```

Gunakan `ConfirmDialog` / `AlertSuccess` bila cocok sebelum membuat modal baru. Helper URL file di `lib/api.js` dipilih sesuai asal file (`assetUrl` umum, `complaintFileUrl` complaint, `thumbUrl` thumbnail, `waschenUploadUrl` upload mobile/POS Waschen).

---

## 3. Anatomi `index.jsx` — Layout Shell

Setiap page yang memiliki sidebar mengikuti pola yang sama. Berikut bagian-bagian pentingnya:

### 3.1 Imports

```jsx
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineBars3,
  HiOutlineXMark,
  HiOutlineIconName,  // ← icon untuk sidebar item
} from "react-icons/hi2";

function cn(...classes) { return classes.filter(Boolean).join(" "); }
```

### 3.2 Konstanta `MENU_ITEMS`

Array yang mendefinisikan menu sidebar. Setiap item punya struktur:

```jsx
const MENU_ITEMS = [
  {
    to: "/nama-halaman",
    icon: HiOutlineIconName,
    label: "Label Menu",
    description: "Deskripsi singkat",
    end: true, // ← true = match exact, false = startsWith
  },
  // ...
];
```

**Aturan naming path URL:**
- Gunakan lowercase + hyphen: `/linen-report-ikm`, `/complaint-list`
- Hindari spasi, gunakan hyphen `-` sebagai pemisah kata
- Untuk nested pages: `/parent-path/child-path`, contoh `/document-alora/transactions`

### 3.3 Helper `cn()`

```jsx
function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
```

Digunakan di seluruh component untuk menggabungkan classnames secara kondisional. **Jangan import library tambahan** — cukup helper function sederhana.

### 3.4 Component `NavItem`

```jsx
function NavItem({ to, icon: Icon, label, description, end, onClose, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      title={collapsed ? label : undefined} // tooltip saat collapsed
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
          collapsed && "justify-center px-2",
          isActive
            ? "bg-[THEME_PRIMARY] text-white shadow-md shadow-[THEME_COLOR]/30"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition",
            isActive
              ? "bg-white/20 text-white"
              : "border border-slate-200 bg-white text-slate-400 group-hover:border-slate-300 group-hover:text-slate-600",
          )}>
            <Icon className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-sm font-semibold leading-none">{label}</p>
              <p className={cn(
                "mt-0.5 truncate text-[11px] leading-none",
                isActive ? "text-[THEME_COLOR]-100" : "text-slate-400",
              )}>
                {description}
              </p>
            </div>
          )}
        </>
      )}
    </NavLink>
  );
}
```

**Styling aktif:** `bg-[THEME_PRIMARY] text-white` dengan shadow bertema.
**Styling tidak aktif:** `text-slate-600 hover:bg-slate-100`.

### 3.5 Component `Sidebar`

```jsx
function Sidebar({ collapsed = false, onClose }) {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Brand header ── */}
      <div className={cn(
        "flex items-center border-b border-slate-100 py-4",
        collapsed ? "justify-center px-2"
          : onClose ? "justify-between gap-3 px-5"
          : "px-5",
      )}>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
              bg-gradient-to-br from-[THEME_START] to-[THEME_END] shadow-md">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800 leading-tight">Title</p>
              <p className="truncate text-[11px] text-slate-400">Subtitle</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
            bg-gradient-to-br from-[THEME_START] to-[THEME_END] shadow-md">
            <Icon className="h-5 w-5 text-white" />
          </div>
        )}
        {onClose && (
          <button type="button" onClick={onClose}
            className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-slate-400
              hover:bg-slate-100 hover:text-slate-600 transition lg:hidden"
            aria-label="Tutup sidebar">
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ── Menu label ── */}
      {!collapsed && (
        <p className="px-5 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Menu</p>
      )}
      {collapsed && <div className="pt-3" />}

      {/* ── Navigation items ── */}
      <nav className={cn("flex-1 overflow-y-auto space-y-0.5", collapsed ? "px-1.5" : "px-3")}>
        {MENU_ITEMS.map(item => (
          <NavItem key={item.to} {...item} onClose={onClose} collapsed={collapsed} />
        ))}
      </nav>

      {/* ── Footer: back to portal ── */}
      <div className={cn("border-t border-slate-100 py-3", collapsed ? "px-1.5" : "px-3")}>
        <button type="button" title={collapsed ? "Kembali ke Portal" : undefined}
          onClick={() => { if (onClose) onClose(); navigate("/portal"); }}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800",
            collapsed && "justify-center px-2",
          )}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition group-hover:text-slate-600">
            <HiOutlineArrowLeft className="h-4 w-4" />
          </div>
          {!collapsed && <span>Kembali ke Portal</span>}
        </button>
      </div>
    </div>
  );
}
```

### 3.6 Component `ActiveMenuTitle`

Mendeteksi menu aktif berdasarkan `pathname` dan menampilkan judul + deskripsi di topbar:

```jsx
function ActiveMenuTitle() {
  const { pathname } = useLocation();
  const active =
    MENU_ITEMS.find(m => m.end && pathname === m.to) ??
    MENU_ITEMS.find(m => !m.end && pathname.startsWith(m.to));

  const label       = active?.label       ?? "Judul Default";
  const description = active?.description ?? "Deskripsi default";
  const Icon        = active?.icon        ?? HiOutlineDefault;

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[THEME_COLOR]-50 border border-[THEME_COLOR]-200 text-[THEME_PRIMARY] shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight text-slate-800">{label}</p>
        <p className="text-[11px] leading-tight text-slate-400">{description}</p>
      </div>
    </div>
  );
}
```

### 3.7 Layout Utama (Main Component Export)

```jsx
export default function NamaPage() {
  const [mobileOpen, setMobileOpen]       = useState(false);
  const [desktopCollapsed, setCollapsed]  = useState(false);
  const drawerRef = useRef(null);

  // Keyboard: Escape to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // Set page title
  useEffect(() => {
    document.title = "Nama Page | Alora Group Indonesia";
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[THEME_BG_COLOR]">
      {/* ── Desktop sidebar ── */}
      <aside className={cn(
        "hidden lg:flex shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm transition-[width] duration-300 ease-in-out overflow-hidden",
        desktopCollapsed ? "w-20" : "w-64",
      )}>
        <Sidebar collapsed={desktopCollapsed} />
      </aside>

      {/* ── Mobile overlay ── */}
      <div aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setMobileOpen(false)}
      />

      {/* ── Mobile drawer ── */}
      <aside ref={drawerRef} aria-label="Sidebar navigasi"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}>
        <Sidebar onClose={() => setMobileOpen(false)} />
      </aside>

      {/* ── Main content area ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Desktop topbar ── */}
        <header className="hidden lg:flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <button type="button"
              onClick={() => setCollapsed(prev => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              aria-label={desktopCollapsed ? "Buka sidebar" : "Tutup sidebar"}>
              <HiOutlineBars3 className="h-5 w-5" />
            </button>
            <ActiveMenuTitle />
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[THEME_COLOR]-200 bg-[THEME_COLOR]-50 px-3 py-1.5 text-xs font-semibold text-[THEME_PRIMARY]">
            <div className="h-2 w-2 rounded-full bg-[THEME_PRIMARY]" />
            Module Name
          </div>
        </header>

        {/* ── Mobile topbar ── */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button type="button"
            onClick={() => setMobileOpen(prev => !prev)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 active:scale-95"
            aria-label="Buka menu navigasi" aria-expanded={mobileOpen}>
            {mobileOpen ? <HiOutlineXMark className="h-5 w-5" /> : <HiOutlineBars3 className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg
              bg-gradient-to-br from-[THEME_START] to-[THEME_END]">
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-700">Page Title</span>
          </div>
        </header>

        {/* ── Outlet: render child routes ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
```

---

## 4. Anatomi Component Page (`components/`)

### 4.1 Naming Convention

| Pattern | Digunakan Untuk | Contoh |
|---------|----------------|--------|
| `PascalCase.jsx` | Semua component file | `DashboardKomplain.jsx`, `FormKomplain.jsx` |
| `kebab-case.js` | Utility files (utils/) | `exportAbsensiExcel.js`, `useCutoffPeriod.js` |
| `useCamelCase.js` | Custom hooks (hook mandiri) | `useCutoffPeriod.js` |

### 4.2 Pattern Component Content

Setiap component page biasanya mengandung:

```jsx
// 1. Import icons
import {
  HiOutlinePlus, HiOutlinePencilSquare, HiOutlineTrash,
  HiOutlineMagnifyingGlass, HiOutlineXMark, HiOutlineClock,
} from "react-icons/hi2";

// 2. Import API
import { api, apiUpload } from "../../../lib/api";

// 3. Helper function (inline, di atas component utama)
function cn(...c) { return c.filter(Boolean).join(" "); }
function fmtDate(v) { ... }
function getCurrentUser() { ... }

// 4. Konstanta metadata (colors, status, dll.)
const STATUS_META = {
  terkirim: { label: "Terkirim", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  proses:   { label: "Diproses", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  selesai:  { label: "Selesai",   cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
};

// 5. Sub-component (Toast, SkeletonRow, SortTh, PhotoThumb, Modal, DeleteModal)
function Toast({ toast }) { ... }
function SortTh({ col, label, sort, onSort, className }) { ... }
function SkeletonRow({ cols }) { ... }
function DeleteModal({ open, onClose, onConfirm, target, loading }) { ... }

// 6. Main component export
export default function NamaComponent() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  // ... rest of logic

  return (
    <>
      <Toast toast={toast} />
      <main className="min-h-screen bg-indigo-50 py-6 sm:py-10">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Page Header */}
          <section className="relative overflow-hidden rounded-3xl border border-slate-200
            bg-gradient-to-br from-slate-950 via-[THEME_START] to-[THEME_END] p-5 shadow-sm sm:p-6">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-[THEME_START]-300/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 border border-white/15">
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white sm:text-2xl">Judul Halaman</h1>
                  <p className="text-sm text-white/70">Deskripsi halaman</p>
                </div>
              </div>
              <button
                onClick={() => { setEditData(null); setFormOpen(true); }}
                className="inline-flex items-center gap-2 rounded-xl bg-white/15 border border-white/25 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/25 transition shadow-sm shrink-0">
                <HiOutlinePlus className="h-4 w-4" /> Tambah
              </button>
            </div>
          </section>

          {/* Filters */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            {/* Filter form */}
          </section>

          {/* Table */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Table dengan desktop + mobile responsive */}
          </section>
        </div>
      </main>
    </>
  );
}
```

### 4.3 Komponen Pendukung (Sub-Component Pattern)

#### Toast Notification
```jsx
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={cn(
      "fixed bottom-5 right-5 z-[80] flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl transition",
      toast.type === "error"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700",
    )}>
      {toast.type === "error"
        ? <HiOutlineExclamationTriangle className="h-4 w-4 shrink-0" />
        : <HiOutlineCheckCircle className="h-4 w-4 shrink-0" />}
      {toast.message}
    </div>
  );
}
```

#### Delete Confirmation Modal (Wajib Menggunakan React Portal)

Agar modal konfirmasi/overlay tidak terpengaruh oleh *z-index stacking context* dari komponen induk (seperti sidebar panel, drawer, atau container dengan transform/overflow), selalu gunakan `createPortal` agar modal dirender langsung di bawah `document.body`.

```jsx
import { createPortal } from "react-dom";

function DeleteModal({ open, onClose, onConfirm, target, loading }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 mb-4">
          <HiOutlineTrash className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Hapus Data?</h3>
        <p className="mt-1 text-sm text-slate-500 mb-5">
          Data <span className="font-semibold text-slate-700">{target?.name}</span> akan dihapus permanen.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition disabled:opacity-50 flex items-center gap-2">
            {loading && <HiOutlineClock className="h-4 w-4 animate-spin" />}
            Hapus
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

---

## 5. Pattern API Call & State Management

```jsx
// ── Toast helper
const showToast = useCallback((message, type = "success") => {
  setToast({ message, type });
  setTimeout(() => setToast(null), 3500);
}, []);

// ── Fetch data
const fetchData = useCallback(async (page = pagination.page) => {
  setLoading(true);
  try {
    const qs = new URLSearchParams({ page: String(page), limit: String(pagination.limit) });
    if (filters.field) qs.set("field", filters.field);
    if (search) qs.set("search", search);

    const res = await api(`/endpoint?${qs}`);
    setData(res.data || []);
    setPagination(p => ({ ...p, page, total: res.pagination?.total || 0, totalPages: res.pagination?.totalPages || 0 }));
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading(false);
  }
}, [filters, pagination.limit, search]);

// ── Initial load
useEffect(() => { fetchData(1); }, [filters, search]);

// ── Body scroll lock saat modal open
useEffect(() => {
  if (formOpen || Boolean(deleteTarget)) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
  return () => { document.body.style.overflow = ""; };
}, [formOpen, deleteTarget]);
```

---

## 6. Routing di `App.jsx`

### 6.1 Pattern Layout dengan Child Routes (Sidebar Pages)

```jsx
// Import page layout + child components
import NamaPage from "./pages/nama-page";
import DashboardNama from "./pages/nama-page/components/DashboardNama";
import FormNama from "./pages/nama-page/components/FormNama";
import DetailNama from "./pages/nama-page/components/DetailNama";

// Route definition
<Route
  element={
    <ProtectedRoute user={user} allowedRoles={appRoles["/nama-path"]}>
      <NamaPage />
    </ProtectedRoute>
  }
>
  <Route path="/nama-path" element={<DashboardNama />} />
  <Route path="/nama-path/form" element={<FormNama />} />
  <Route path="/nama-path/:id" element={<DetailNama />} />
</Route>
```

### 6.2 Pattern Standalone Page (tanpa sidebar layout)

```jsx
<Route
  path="/nama-path"
  element={
    <ProtectedRoute user={user} allowedRoles={appRoles["/nama-path"]}>
      <NamaPage />
    </ProtectedRoute>
  }
/>
```

### 6.3 Redirect/Alias Routes

```jsx
<Route path="/alias-path" element={<Navigate to="/canonical-path" replace />} />
```

---

## 7. Backend Structure

### 7.1 Controller & Route — Struktur Folder

Controller ada di `backend/controllers/`, route di `backend/routes/` dengan **struktur folder yang sama** (`xxxController.js` ↔ `xxxRoutes.js`).

```
backend/controllers/  (routes/ mengikuti struktur yang sama)
├── appController.js, employeeController.js, masterKarController.js, ...   # fitur umum (root)
├── auth/                      # login/register
├── masterDataSuperApp/        # satu file per master (bank, company, department, user, menu, ...)
├── salesDashboard/            # customer, membership, piutang, sales, cleanoxByWaschen
├── Alora/                     # HR Alora: leaves, attendance*, annualLeave, lemburRo, payslip, bugar, holiday, plannedLate
│   └── utils/                 # service/rule: annualLeaveService, attendanceApprovalService, leaveFundingService, workScheduleRules, ...
├── IKM/                       # absensi, kasbon, leaves, linenReport, masterRs, stockOpname, rewash, ...
│   └── LinenTransaction/      # linenTransaction, linenTransactionKomersil, bastLinenSewa
├── Cleanox/                   # employee, absensi, lembur, kasbon, meal, pendapatan, piutang, customerAging, crossSell, kpi, master*
│   └── utils/                 # cleanoxMealCalendar, cleanoxMealRates, cleanoxProduksiEmployees
├── MyWaschen/
│   ├── HRIS/                  # Attendance, Leave, Kasbon, Overtime, DayOff, Payroll, TimeMaster, payslip, employeeWaschen
│   ├── Inventory/             # Inventory, StockOpname, DashboardInventory
│   ├── MasterData/            # Services, Outlet, Promo, Parfume, Unit, PaymentMethod, ... (satu file per master)
│   ├── Transaction/           # Customer, History, Dashboard, DailyReport, PettyCash
│   ├── Settings/              # PrinterSettings
│   └── EventB2B/
├── B2B/B2B-Koperasi-2026/     # b2bKoperasiCustomer, b2bKoperasiDashboard
├── ProjectManagement/         # projectManagement, personalChat
├── PurchaseRequest/           # pengajuan.controller.js, masterClassification.controller.js
└── (root) complaint, docAlora, operational, targetWaschen, training, csatNps, knowYourEmp, analysisBurnout,
           employeeMood, employeeAssetService, aset, broadcast, pm, personalTasklist, dailyTask
```

### 7.2 Naming Convention Backend

| Lokasi | Pola nama | Contoh |
|--------|-----------|--------|
| Mayoritas folder | `namaFiturController.js` / `namaFiturRoutes.js` | `kasbonController.js`, `kasbonRoutes.js` |
| `PurchaseRequest/` | `nama.controller.js` / `nama.routes.js` (titik) | `pengajuan.controller.js` |
| `MyWaschen/` | `PascalCase` | `PettyCashController.js`, `ServicesRoutes.js` |
| `utils/` di dalam grup | `camelCase.js`, berisi service / rule bisnis | `annualLeaveService.js` |

Gunakan pola yang dipakai folder tujuan; jangan campur gaya dalam satu folder.

### 7.2.1 Folder Backend Pendukung

```
backend/
├── db/pool.js           # semua koneksi DB (lihat 7.4.1)
├── middleware/
│   ├── auth.js          # requireAuth
│   └── upload.js        # upload file (multer)
├── utils/               # waNotify, notifyWaschenRealtime, notifyLinenMonitoring, waschenMobileUpload, waschenPosUpload
├── assets/              # file upload (payslip, purchase, pm_evidence, training_evidence, ...) — diserve static oleh index.js
└── aiAgent/             # DDL_*.sql, migrate_*.sql, skrip backup/migrasi DB (bukan runtime app)
```

### 7.3 Backend Routes Registration (`backend/index.js`)

```javascript
// 1. Import route
import namaFiturRoutes from "./routes/namaFiturRoutes.js";

// 2. Register route
app.use("/prefix-path", namaFiturRoutes);

// Contoh:
// app.use("/ikm/absensi", absensiIKMRoutes);
// app.use("/ikm/linen-report", linenReportRoutes);
// app.use("/complaints", complaintRoutes);
```

**Prefix route per domain:**

| Prefix | Domain |
|--------|--------|
| `/auth`, `/apps`, `/employees`, `/hr` | Auth, daftar aplikasi portal, karyawan, master karyawan |
| `/users`, `/menus`, `/banks`, `/companies`, `/departments`, `/positions`, `/outlets`, `/vendors`, ... | Master Data SuperApp |
| `/ikm/*` | IKM (absensi, leaves, kasbon, master-rs, linen-report, linen-transactions, stock-opname, ...) |
| `/alora/*` | HR Alora (leaves, attendance, attendance-sessions, annual-leave, payslips, lembur-ro, bugar, holidays, ...) |
| `/cleanox/*` (+ `/kpi`, `/master-services`, `/master-categories`, `/target-cleanox`) | Cleanox |
| `/waschen/*` | MyWaschen: `employees`, `transactions`, `customers`, master (`services`, `outlets`, ...), `hris/*`, `inventory/*`, `petty-cash`, `daily-report`, `event` |
| `/api/pm`, `/personal-tasklist`, `/daily-tasks` | Project Management & task |
| `/pengajuan`, `/doc-alora`, `/complaints`, `/operational`, `/training`, `/aset`, `/sales`, `/target-waschen` | Fitur umum |
| `/csat-nps`, `/b2b`, `/know-your-employee`, `/analysis-burnout`, `/api/employee-mood`, `/satisfaction` | Survey, B2B, employee wellbeing |
| `/assets/*`, `/storage/assets/*`, `/uploads/assets/*` | Static file (upload) |

### 7.4 Controller Pattern

```javascript
// File: backend/controllers/IKM/namaFiturController.js

// DB utama: pool / safeQuery. DB lain: helper safeXxxQuery (lihat 7.4.1), mis. safeIKMQuery untuk IKM.
import { pool } from "../../db/pool.js";

// GET list
export const getNamaFitur = async (req, res) => {
  try {
    const { page = 1, limit = 25, search = "", ...filters } = req.query;
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      "SELECT * FROM table_name WHERE something LIKE ? LIMIT ? OFFSET ?",
      [`%${search}%`, Number(limit), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM table_name WHERE something LIKE ?",
      [`%${search}%`]
    );

    res.json({ data: rows, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST create
export const createNamaFitur = async (req, res) => {
  try {
    const { field1, field2 } = req.body;
    const [result] = await pool.query(
      "INSERT INTO table_name (field1, field2) VALUES (?, ?)",
      [field1, field2]
    );
    res.status(201).json({ message: "Created", id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT update
export const updateNamaFitur = async (req, res) => {
  try {
    const { id } = req.params;
    const { field1, field2 } = req.body;
    await pool.query(
      "UPDATE table_name SET field1 = ?, field2 = ? WHERE id = ?",
      [field1, field2, id]
    );
    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE
export const deleteNamaFitur = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM table_name WHERE id = ?", [id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

### 7.4.1 Koneksi Database (`backend/db/pool.js`)

| Pool | Helper | Dipakai untuk |
|------|--------|---------------|
| `mainPool` (alias `pool`) | `safeQuery` | DB utama SuperApp (user, master, doc alora, pengajuan, ...) |
| `ikmPool` | `safeIKMQuery` | IKM |
| `cleanoxPool` | `safeCleanoxQuery` | Cleanox |
| `backupCleanoxPool` | `safeBackupCleanoxQuery` | Backup Cleanox |
| `myWaschenPool` | `safeMyWaschenQuery` | MyWaschen |
| `aloraMobilePool` | `safeAloraMobileQuery` | Alora Mobile (HR Alora) |
| `smartlinkPool` | `safeSmartlinkQuery` | Smartlink |

Utamakan helper `safeXxxQuery` agar penanganan koneksi putus konsisten. DDL tiap database ada di `backend/aiAgent/DDL_*.sql`.

### 7.5 Route File Pattern

```javascript
// File: backend/routes/namaFiturRoutes.js

import express from "express";
import { getNamaFitur, createNamaFitur, updateNamaFitur, deleteNamaFitur } from "../controllers/namaFiturController.js";
import { requireAuth } from "../middleware/auth.js"; // sesuaikan kedalaman path relatif

const router = express.Router();

router.get("/", requireAuth, getNamaFitur);
router.post("/", requireAuth, createNamaFitur);
router.put("/:id", requireAuth, updateNamaFitur);
router.delete("/:id", requireAuth, deleteNamaFitur);

export default router;
```

---

## 8. Icon Management — `ApplicationsSection.jsx`

Lokasi: `frontend/src/pages/portal/components/ApplicationsSection.jsx`

Icon di portal ditentukan oleh function `getAppIcon()` dan `getAppIconBg()` yang melakukan keyword matching pada nama aplikasi yang di-return oleh backend API `/apps/authorization`.

### 8.1 Untuk Menambahkan Icon App Baru

Tambahkan blok baru di kedua function berdasarkan keyword:

```jsx
// Di getAppIcon()
if (name.includes("nama-keyword")) return (
  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="..." />
  </svg>
);

// Di getAppIconBg()
if (name.includes("nama-keyword")) return "bg-[COLOR]-[SHADE]";
```

Icon menggunakan SVG inline (bukan dari library) untuk fleksibilitas penuh. Background color menggunakan Tailwind color palette.

---

## 9. Styling Conventions

### 9.1 Color Theme Mapping

Setiap page memiliki tema warna yang konsisten:

| Page | Primary | Gradient Start | Gradient End | Accent |
|------|---------|----------------|---------------|--------|
| Absensi IKM | Blue/Cyan | `from-blue-800` | `to-cyan-500` | Blue |
| Complaint | Fuchsia | `from-fuchsia-700` | `to-pink-700` | Pink |
| Master RS IKM | Red/Orange | `from-red-800` | `to-orange-500` | Red |
| Document Alora | Blue 900 | `from-blue-900` | `to-blue-700` | Navy |
| Pengajuan Alora | Emerald | `from-emerald-600` | `to-teal-400` | Green |
| Operational | Violet | `from-violet-700` | `to-purple-600` | Purple |

### 9.2 Utility Class Order

```jsx
// Urutan class: layout → sizing → spacing → colors → effects → interaction
className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-md hover:bg-slate-100 transition"
```

### 9.3 Spacing Standard

| Gunakan | Untuk |
|---------|-------|
| `space-y-6` | Jarak antar section utama |
| `p-4 sm:p-5` | Padding dalam card/section |
| `gap-3` | Jarak antar elemen dalam baris/kolom |
| `rounded-xl` | Border radius default untuk card |
| `rounded-2xl` | Border radius untuk section/panel lebih besar |
| `rounded-3xl` | Border radius untuk page header |

### 9.4 Responsive Breakpoints

| Breakpoint | Penggunaan |
|------------|-------------|
| `sm:` | Filter bar, komponen opsional |
| `md:` | Desktop table vs mobile card |
| `lg:` | Sidebar visible vs hidden, topbar switch |

---

## 10. Checklist Pembuatan Page Baru

```
☐  1. Tambahkan icon di ApplicationsSection.jsx (portal)
☐  2. Tambahkan routing di App.jsx (frontend) — parent Route + child Routes
☐  3. Buat folder: frontend/src/pages/nama-page/
☐  4. Buat index.jsx dengan layout shell (sidebar + topbar + Outlet)
☐  5. Buat folder components/
☐  6. Buat component untuk setiap tab/menu (Dashboard, Form, Detail)
☐  7. Jika ada fitur spesial: buat folder utils/ dengan file utility
☐  8. Buat folder: backend/controllers/[group]/NamaFiturController.js
☐  9. Buat file: backend/routes/[group]/NamaFiturRoutes.js
☐ 10. Daftarkan route di backend/index.js (import + app.use)
☐ 11. Update menu item di index.jsx (MENU_ITEMS array)
☐ 12. Test: sidebar navigation, API endpoint, rendering child pages
```

---

## 11. Contoh Lengkap: Menambahkan Fitur "Laporan Keuangan IKM"

### Step 1 — Aplikasi Section (Portal)
Tambahkan logic di `ApplicationsSection.jsx` agar app "Laporan Keuangan IKM" muncul di portal.

### Step 2 — Frontend Route
```jsx
// App.jsx
import LaporanKeuanganIKM from "./pages/laporan-keuangan-ikm";
import DashboardLaporan from "./pages/laporan-keuangan-ikm/components/DashboardLaporan";
import FormLaporan from "./pages/laporan-keuangan-ikm/components/FormLaporan";

// Routes
<Route
  element={
    <ProtectedRoute user={user} allowedRoles={appRoles["/laporan-keuangan-ikm"]}>
      <LaporanKeuanganIKM />
    </ProtectedRoute>
  }
>
  <Route path="/laporan-keuangan-ikm" element={<DashboardLaporan />} />
  <Route path="/laporan-keuangan-ikm/form" element={<FormLaporan />} />
</Route>
```

### Step 3 — Folder Structure
```
frontend/src/pages/laporan-keuangan-ikm/
├── index.jsx
├── components/
│   ├── DashboardLaporan.jsx
│   ├── FormLaporan.jsx
│   ├── FilterBar.jsx
│   ├── ReportModal.jsx
│   └── ExportDialog.jsx
└── utils/
    └── exportLaporanExcel.js
```

### Step 4 — Backend
```javascript
// backend/controllers/IKM/laporanKeuanganController.js
// backend/routes/IKM/laporanKeuanganRoutes.js
// backend/index.js → import + app.use("/ikm/laporan-keuangan", laporanKeuanganRoutes)
```

### Step 5 — Register Menu
Update `MENU_ITEMS` di `index.jsx`:
```jsx
const MENU_ITEMS = [
  { to: "/laporan-keuangan-ikm", icon: HiOutlineDocumentChartBar, label: "Laporan Keuangan", description: "Kelola & export laporan keuangan", end: true },
  // ... existing items
];
```

---

## 12. Standar Filter Periode (Bulan Cutoff & Tanggal Kustom)

Semua aplikasi dalam **Alora SuperApp** yang memiliki data berbasis transaksi harus menggunakan standar filter periode bulanan dengan sistem **Cutoff 26 ke 25** beserta filter **Tanggal Kustom**.

### 12.1 Logika Bisnis Cutoff (26 s/d 25)
* Tanggal Cutoff berjalan dari **tanggal 26 bulan sebelumnya** hingga **tanggal 25 bulan terpilih**.
* Contoh Periode **Juni 2026**: Berjalan dari `26 Mei 2026` s/d `25 Juni 2026`.
* Tanggal terima $\ge 26$ masuk ke periode bulan berikutnya.

### 12.2 Implementasi Backend (SQL & Controller)

Untuk mengambil daftar periode bulan/tahun cutoff yang tersedia secara dinamis dari database, gunakan query SQL berikut:

```javascript
// backend/controllers/[Fitur]Controller.js
export const getAvailablePeriods = async (req, res) => {
  try {
    const [rows] = await safeQuery(
      `SELECT DISTINCT
         CASE
           WHEN DAY(tgl_terima) >= 26 THEN
             CASE WHEN MONTH(tgl_terima) = 12 THEN YEAR(tgl_terima) + 1 ELSE YEAR(tgl_terima) END
           ELSE YEAR(tgl_terima)
         END AS yr,
         CASE
           WHEN DAY(tgl_terima) >= 26 THEN
             CASE WHEN MONTH(tgl_terima) = 12 THEN 1 ELSE MONTH(tgl_terima) + 1 END
           ELSE MONTH(tgl_terima)
         END AS mo
       FROM tr_nama_tabel
       WHERE tgl_terima IS NOT NULL
       ORDER BY yr DESC, mo DESC`
    );
    return res.json({ periods: rows });
  } catch (err) {
    return res.status(500).json({ message: "Gagal mengambil periode", error: err.message });
  }
};
```

### 12.3 Implementasi Frontend (State & Logic)

Gunakan pola React berikut untuk mengatur filter di frontend.

#### 1. Helpers & Konverter Tanggal
```javascript
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function cutoffStart(year, month) {
    // 26 bulan sebelumnya
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return `${prevYear}-${String(prevMonth).padStart(2, "0")}-26`;
}

function cutoffEnd(year, month) {
    // 25 bulan terpilih
    return `${year}-${String(month).padStart(2, "0")}-25`;
}
```

#### 2. State & Hooks di Main Page
```javascript
export default function FiturPage() {
    const [periods, setPeriods] = useState([]);
    const [selectedYear, setSelectedYear] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("");
    const [selectedOutlet, setSelectedOutlet] = useState("");
    const [isCustomDate, setIsCustomDate] = useState(false);

    // Rentang tanggal aktual yang dikirim ke API
    const [dateStart, setDateStart] = useState("");
    const [dateEnd, setDateEnd] = useState("");

    // Hook: Sinkronkan periode cutoff dengan dateStart/dateEnd saat user memilih bulan/tahun
    useEffect(() => {
        if (!isCustomDate && selectedYear && selectedMonth) {
            setDateStart(cutoffStart(selectedYear, selectedMonth));
            setDateEnd(cutoffEnd(selectedYear, selectedMonth));
        }
    }, [selectedYear, selectedMonth, isCustomDate]);

    // Hook: Otomatis pilih periode terbaru dari database sebagai default
    useEffect(() => {
        if (periods.length > 0 && !selectedYear && !selectedMonth) {
            setSelectedYear(periods[0].yr);
            setSelectedMonth(periods[0].mo);
        }
    }, [periods, selectedYear, selectedMonth]);

    // Logic: Jika user memilih tanggal awal = 26 pada mode kustom, auto-fill tanggal akhir ke 25 bulan berikutnya
    const handleCustomStartChange = useCallback((val) => {
        setDateStart(val);
        if (val) {
            const d = new Date(val);
            if (!isNaN(d.getTime()) && d.getDate() === 26) {
                const nextMonth = new Date(d);
                nextMonth.setMonth(d.getMonth() + 1);
                nextMonth.setDate(25);
                const y = nextMonth.getFullYear();
                const m = String(nextMonth.getMonth() + 1).padStart(2, "0");
                const day = String(nextMonth.getDate()).padStart(2, "0");
                setDateEnd(`${y}-${m}-${day}`);
            }
        }
    }, []);
    
    // ... fetchSummary(dateStart, dateEnd, selectedOutlet)
}
```

#### 3. Layout JSX Filter Card
```jsx
<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3 w-full">
            {!isCustomDate ? (
                <>
                    {/* Select Tahun */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Tahun</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none cursor-pointer"
                        >
                            {uniqueYears.map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    {/* Select Bulan */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Bulan (Cutoff)</label>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none cursor-pointer"
                        >
                            {availableMonths.map((m) => (
                                <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
                            ))}
                        </select>
                    </div>
                </>
            ) : (
                <>
                    {/* Input Tanggal Kustom */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Tanggal Awal</label>
                        <input
                            type="date"
                            value={dateStart || ""}
                            onChange={(e) => handleCustomStartChange(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Tanggal Akhir</label>
                        <input
                            type="date"
                            value={dateEnd || ""}
                            onChange={(e) => setDateEnd(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                        />
                    </div>
                </>
            )}
            
            {/* Toggle Mode */}
            <button
                type="button"
                onClick={() => {
                    setIsCustomDate(!isCustomDate);
                    if (isCustomDate && selectedYear && selectedMonth) {
                        setDateStart(cutoffStart(selectedYear, selectedMonth));
                        setDateEnd(cutoffEnd(selectedYear, selectedMonth));
                    }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 transition text-xs font-bold shrink-0 self-end"
            >
                <HiOutlineCalendarDays className="h-4 w-4 text-slate-400" />
                {isCustomDate ? "Gunakan Cutoff Bulanan" : "Custom Tanggal"}
            </button>
        </div>
        <div className="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 shrink-0 self-end">
            Periode: {formatDateShort(dateStart)} - {formatDateShort(dateEnd)}
        </div>
    </div>
</section>
```

---

## 13. Standar Desain & Implementasi Modal

Semua komponen modal di **Alora SuperApp** harus mengikuti standar struktur markup dan styling kelas Tailwind di bawah ini untuk menjaga konsistensi visual (visual excellence) dan mencegah bug tumpang tindih (*stacking context*).

### 13.1 Menggunakan React Portal

Modal wajib dirender menggunakan `createPortal` dari `react-dom` langsung ke `document.body`. Ini mencegah kontainer modal terpotong oleh `overflow: hidden` atau tertimpa oleh `z-index` elemen induk (*parent component*).

### 13.2 Struktur & Kelas Tailwind Standar

Setiap modal dirancang dengan anatomi 3 bagian utama: **Header**, **Scrollable Body**, dan **Footer**.

```jsx
import { createPortal } from "react-dom";
import { HiOutlineXMark } from "react-icons/hi2";

export default function StandardModal({ open, onClose, onSubmit, title, subtitle, children, loading }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* 1. Backdrop Overlay */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      {/* 2. Modal Card Wrapper */}
      <div 
        className="relative w-full max-w-lg rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden flex flex-col animate-[fadeIn_0.2s_ease-out]"
        style={{ maxHeight: "92vh" }}
      >
        {/* 3. Header (Sticky/Shrink-0) */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-white">
          <div>
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        </div>

        {/* 4. Scrollable Body (Flex-1 & overflow-y-auto) */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4 text-xs font-semibold text-slate-650">
          {children}
        </div>

        {/* 5. Footer (Sticky/Shrink-0 with light background) */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4 bg-slate-50/50 shrink-0">
          <button 
            type="button" 
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-655 hover:bg-slate-50 transition"
          >
            Batal
          </button>
          <button 
            type="button" 
            onClick={onSubmit}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition disabled:opacity-60 shadow-sm shadow-indigo-600/20"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent inline-block" />
            ) : null}
            {loading ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

### 13.3 Poin Penting Aturan Desain (Design Excellence)
- **Tepi Melengkung (Rounded Corners)**: Gunakan `rounded-3xl` untuk wrapper modal utama agar terlihat modern dan premium. Dan `rounded-xl` untuk elemen input di dalamnya.
- **Transparansi & Efek Blur**: Backdrop wajib menggunakan `backdrop-blur-sm` dengan latar belakang semi-transparan `bg-slate-950/60` (atau `bg-black/40`).
- **Scroll Mandiri**: Bagian body harus memiliki `overflow-y-auto` agar jika isinya panjang (seperti form kompleks), hanya bagian body yang scroll, sedangkan Header & Footer tetap terkunci (sticky).
- **Animasi Ringan**: Tambahkan micro-animation `animate-[fadeIn_0.2s_ease-out]` atau transisi sejenis agar transisi modal terasa mulus dan hidup.

### 13.4 Standar Dialog Konfirmasi, Alert & Validasi (Modal Kecil)

Untuk dialog tipe konfirmasi tindakan (seperti hapus, edit) atau notifikasi kesalahan (alert/validation), gunakan template modal kecil terpusat (*centered single-card dialogue*).

#### 1. Contoh Implementasi Dialog Konfirmasi Hapus/Tindakan (Confirm)
```jsx
export function ConfirmModal({ open, onClose, onConfirm, title, desc, loading }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-center space-y-4 animate-scaleUp">
        {/* Warning Icon Container */}
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 shadow-inner">
          <HiOutlineTrash className="h-6 w-6" />
        </div>
        
        {/* Text Content */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
        </div>
        
        {/* Buttons Container */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 transition active:scale-95"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-700 transition active:scale-95 shadow-md shadow-rose-600/20"
          >
            {loading ? "Memproses..." : "Hapus"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

#### 2. Contoh Notifikasi Validasi & Kesalahan (Alert Dialog)
```jsx
export function AlertModal({ open, onClose, title, message, type = "error" }) {
  if (!open) return null;

  const isError = type === "error";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-center space-y-4 animate-scaleUp">
        {/* Icon Container (Rose for Error, Emerald for Success, Amber for Warning) */}
        <div className={cn(
          "mx-auto flex h-12 w-12 items-center justify-center rounded-xl shadow-inner",
          isError ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
        )}>
          {isError ? <HiOutlineXMark className="h-6 w-6" /> : <HiOutlineCheck className="h-6 w-6" />}
        </div>
        
        {/* Content */}
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{message}</p>
        </div>
        
        {/* Single Action Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-white hover:bg-slate-900 transition active:scale-95 shadow-md shadow-slate-800/20"
        >
          Tutup
        </button>
      </div>
    </div>,
    document.body
  );
}
```

#### 3. Perbedaan Kelas Kunci (Kategori Warna & Icon)
- **Delete/Danger (Bahaya)**: Icon merah (`HiOutlineTrash` / `HiOutlineXCircle`) dengan container `bg-rose-50 text-rose-600` dan tombol utama `bg-rose-600`.
- **Validation/Warning (Peringatan)**: Icon kuning (`HiOutlineExclamationTriangle`) dengan container `bg-amber-50 text-amber-600` dan tombol utama `bg-amber-650` atau `bg-slate-800`.
- **Success/Info (Informasi/Sukses)**: Icon hijau (`HiOutlineCheckCircle` / `HiOutlineCheck`) dengan container `bg-emerald-50 text-emerald-600` dan tombol utama `bg-emerald-600`.

---

## 14. Peta Modul (Route Frontend ↔ Prefix Backend)

| Modul | Folder frontend | Path utama (`App.jsx`) | Prefix backend |
|-------|-----------------|------------------------|----------------|
| Portal | `portal/` | `/portal/*` | `/apps`, `/daily-tasks`, `/broadcast`, `/youtube` |
| Absensi & operasional IKM | `absensi-ikm/` | `/absensi-ikm`, `/kasbon-pinjaman`, `/perizinan-ikm`, `/linen-report-ikm`, `/leader-daily-report` | `/ikm/*` |
| Transaksi linen IKM | `linen-transaction/` | `/transaksi-linen-ikm`, `/transaksi-linen-komersil-ikm`, `/serah-terima-linen` | `/ikm/linen-transactions*`, `/ikm/bast-linen-sewa` |
| Master RS IKM | `master-rs-ikm/` | `/rumah-sakit-ikm`, `/<rs>-linen`, `/<rs>-stock-opname` | `/ikm/master-rs`, `/ikm/hospital-linen`, `/ikm/stock-opname` |
| Karyawan IKM | `karyawan-ikm/` | `/karyawan-ikm` | `/ikm/employees` |
| Master Karyawan (Alora HR) | `master-karyawan/` | `/master-karyawan/*` | `/hr`, `/alora/*` |
| Cleanox | `cleanox-management/` | `/cleanox-management-system/*` | `/cleanox/*`, `/kpi`, `/master-services` |
| MyWaschen | `my-waschen/` | `/my-waschen/*` | `/waschen/*` |
| Dashboard Sales | `dashboard-sales/` | `/dashboard/*` | `/sales` |
| Target Waschen | `target-waschen/` | `/target-waschen` | `/target-waschen` |
| Pengajuan Alora | `pengajuan-alora/` | `/pengajuan-alora/*` | `/pengajuan`, `/pengajuan/master-classification` |
| Document Alora | `document-alora/` | `/document-alora/*` | `/doc-alora` |
| Complaint | `complaint-management/` | `/complaint-management-system`, `/complaint-list`, `/complaint-form` | `/complaints` |
| Operational Alora | `operational-alora/` | `/operational-alora-group`, `/chemical-treatment-oc`, `/quality-check-oc` | `/operational` |
| Training | `training-system/` | `/training-management-system/*` | `/training` |
| Aset | `aset-management/` | `/aset-management` | `/aset`, `/service/employee-assets` |
| Project Management v2 | `project-management-v2/` | `/project-management-v2/*` | `/api/pm`, `/personal-tasklist` |
| CSAT / NPS | `csat-nps/` | `/result-of-our-work/*` | `/csat-nps` |
| B2B Alora | `b2b-alora/` | `/event-b2b-alora/*` | `/b2b` |
| Know Your Employee | `knowyour-employee/` | `/know-your-employee/*` | `/know-your-employee`, `/analysis-burnout`, `/api/employee-mood` |
| Employee Satisfaction | `employee-satisfaction/` | `/employeesatisfaction` | `/satisfaction` |
| Master Data SuperApp | `master-data-superapp/` | `/master-data-superapp`, `/add-menu`, `/add-user` | `/users`, `/menus`, `/banks`, ... |
| Profil, Auth, Maintenance | `profile/`, `auth/`, `maintenance/` | `/profile/*`, `/login`, `/register`, `/maintenance` | `/auth`, `/employees` |

> Path di atas diambil dari kondisi `App.jsx` saat dokumen ini diperbarui; sumber kebenaran tetap `App.jsx` dan `backend/index.js`.

---

## 15. Dokumen Terkait (`agent/`)

| File | Isi |
|------|-----|
| `StrukturIKM.md` | Struktur & aturan modul IKM |
| `MyWaschen.MD` | Struktur & aturan modul MyWaschen |
| `NotaThermal-STANDAR.md` | Standar nota thermal MyWaschen |
| `RevampProjectManagement.md` | Revamp Project Management (v2) |
| `Personalize.MD` | Personalisasi |
| `backend/aiAgent/*.sql` | DDL database per modul |

---

*Document version: 1.3 — Last updated: 2026-10-29*
